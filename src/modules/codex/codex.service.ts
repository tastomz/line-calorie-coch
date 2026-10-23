import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CodexBackend,
  CodexChatResult,
  setCodexBackend,
} from '../../common/codex-bridge';
import { ChatParams, codexModelLabel, toCodexRequest } from './codex-chat';
import { runCodexExec } from './codex-runner';
import {
  describeAuthJson,
  parseVaultKey,
  seal,
  unseal,
  validateAuthJson,
} from './codex-vault';

const CREDENTIAL_ID = 'codex';
const MODEL_ID = /^[\w.-]{1,64}$/;
/** After this many failures in a row, skip Codex for PAUSE_MS (API answers). */
const FAILURE_THRESHOLD = 3;
const PAUSE_MS = 5 * 60_000;
const MAX_QUEUE_WAIT_MS = 5_000;

export class CodexBusyError extends Error {}

function intEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
}

/**
 * Owns the ChatGPT sign-in used for Trial users (encrypted in AiCredential).
 * Runs are serialized — Codex may rotate the refresh token, and two runs
 * refreshing at once would invalidate each other.
 */
@Injectable()
export class CodexService
  implements CodexBackend, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CodexService.name);
  private authJson: string | null = null;
  private model: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private inFlight = 0;
  private consecutiveFailures = 0;
  private pausedUntil = 0;
  private lastError: string | null = null;
  private lastOkAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get bin() {
    return (this.config.get<string>('CODEX_BIN') ?? '').trim() || 'codex';
  }
  private get timeoutMs() {
    return intEnv(this.config.get('CODEX_TIMEOUT_SECONDS'), 25, 5, 120) * 1000;
  }
  /** Runs allowed in the queue (running + waiting) before Trial uses the API. */
  private get maxPending() {
    return intEnv(this.config.get('CODEX_MAX_PENDING'), 2, 1, 10);
  }
  private enabled() {
    return (
      (this.config.get<string>('CODEX_TRIAL_ENABLED') ?? 'true').trim() !==
      'false'
    );
  }

  async onModuleInit() {
    setCodexBackend(this);
    try {
      await this.load();
    } catch (error) {
      this.logger.warn(
        `Codex sign-in not loaded: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  onModuleDestroy() {
    setCodexBackend(null);
  }

  private key() {
    return parseVaultKey(this.config.get<string>('CODEX_VAULT_KEY'));
  }

  private async load() {
    const row = await this.prisma.aiCredential.findUnique({
      where: { id: CREDENTIAL_ID },
    });
    if (!row) return;
    this.authJson = unseal(this.key(), row);
    this.model = row.model;
    this.lastOkAt = row.lastOkAt;
    this.lastError = row.lastError;
  }

  available(): boolean {
    return (
      this.enabled() &&
      this.authJson !== null &&
      Date.now() >= this.pausedUntil &&
      this.inFlight < this.maxPending
    );
  }

  status() {
    let keyOk = true;
    let keyError: string | null = null;
    try {
      this.key();
    } catch (e) {
      keyOk = false;
      keyError = e instanceof Error ? e.message : 'invalid key';
    }
    const info = this.authJson ? describeAuthJson(this.authJson) : null;
    return {
      enabled: this.enabled(),
      keyOk,
      keyError,
      signedIn: this.authJson !== null,
      account: info?.accountId ?? null,
      lastRefresh: info?.lastRefresh ?? null,
      model: this.model,
      modelLabel: codexModelLabel(this.model),
      lastOkAt: this.lastOkAt,
      lastError: this.lastError,
      pausedUntil:
        this.pausedUntil > Date.now() ? new Date(this.pausedUntil) : null,
      inFlight: this.inFlight,
    };
  }

  async saveAuth(rawAuthJson: unknown, model: unknown) {
    const authJson = validateAuthJson(rawAuthJson);
    const cleanModel = this.parseModel(model);
    const sealed = seal(this.key(), authJson);
    await this.prisma.aiCredential.upsert({
      where: { id: CREDENTIAL_ID },
      create: { id: CREDENTIAL_ID, ...sealed, model: cleanModel },
      update: { ...sealed, model: cleanModel, lastError: null },
    });
    this.authJson = authJson;
    this.model = cleanModel;
    this.lastError = null;
    this.consecutiveFailures = 0;
    this.pausedUntil = 0;
  }

  async setModel(model: unknown) {
    const cleanModel = this.parseModel(model);
    if (!this.authJson) throw new Error('ยังไม่ได้เชื่อม ChatGPT');
    await this.prisma.aiCredential.update({
      where: { id: CREDENTIAL_ID },
      data: { model: cleanModel },
    });
    this.model = cleanModel;
  }

  async clear() {
    await this.prisma.aiCredential.deleteMany({ where: { id: CREDENTIAL_ID } });
    this.authJson = null;
    this.model = null;
    this.lastOkAt = null;
    this.lastError = null;
  }

  private parseModel(model: unknown): string | null {
    if (model === undefined || model === null || model === '') return null;
    if (typeof model !== 'string' || !MODEL_ID.test(model.trim())) {
      throw new Error('ชื่อโมเดลไม่ถูกต้อง');
    }
    return model.trim();
  }

  /** Admin "ทดสอบ" — one tiny run, bypassing the pause. */
  async test(): Promise<{
    ok: boolean;
    ms: number;
    answer?: string;
    error?: string;
  }> {
    if (!this.authJson)
      return { ok: false, ms: 0, error: 'ยังไม่ได้เชื่อม ChatGPT' };
    const started = Date.now();
    try {
      const r = await this.enqueue(
        {
          messages: [
            { role: 'system', content: 'Reply in Thai, one short sentence.' },
            { role: 'user', content: 'ข้าวมันไก่ 1 จาน ประมาณกี่ kcal' },
          ],
        },
        120_000,
      );
      return {
        ok: true,
        ms: Date.now() - started,
        answer: r.text.slice(0, 300),
      };
    } catch (error) {
      return {
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  chat(params: unknown): Promise<CodexChatResult> {
    return this.enqueue(params as ChatParams);
  }

  private enqueue(
    params: ChatParams,
    maxWaitMs = MAX_QUEUE_WAIT_MS,
  ): Promise<CodexChatResult> {
    this.inFlight += 1;
    const queuedAt = Date.now();
    const run = this.queue.then(() => {
      // Waited too long behind another run: let the caller use the API
      // instead of blowing the LINE reply budget.
      if (Date.now() - queuedAt > maxWaitMs) {
        throw new CodexBusyError('codex busy');
      }
      return this.runOnce(params);
    });
    this.queue = run.catch(() => undefined);
    return run.finally(() => {
      this.inFlight -= 1;
    });
  }

  private async runOnce(params: ChatParams): Promise<CodexChatResult> {
    const authJson = this.authJson;
    if (!authJson) throw new Error('Codex signed out');
    const request = toCodexRequest(params);
    try {
      const result = await runCodexExec({
        bin: this.bin,
        authJson,
        model: this.model,
        request,
        timeoutMs: this.timeoutMs,
        runDir:
          (this.config.get<string>('CODEX_RUN_DIR') ?? '').trim() || undefined,
        onAuthUpdated: (updated) => this.persistRotated(authJson, updated),
      });
      await this.recordOk();
      return {
        text: result.text,
        model: codexModelLabel(this.model),
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      };
    } catch (error) {
      await this.recordFailure(error);
      throw error;
    }
  }

  /** Codex refreshed its tokens: re-encrypt and store so restarts keep working. */
  private async persistRotated(previous: string, updated: string) {
    if (this.authJson !== previous) return; // replaced by the admin meanwhile
    let valid: string;
    try {
      valid = validateAuthJson(updated);
    } catch {
      return;
    }
    this.authJson = valid;
    await this.prisma.aiCredential.update({
      where: { id: CREDENTIAL_ID },
      data: seal(this.key(), valid),
    });
    this.logger.log('Codex sign-in refreshed and stored');
  }

  private async recordOk() {
    this.consecutiveFailures = 0;
    this.pausedUntil = 0;
    const now = new Date();
    // Write at most every 10 minutes — this is for the admin card only.
    const stale =
      !this.lastOkAt || now.getTime() - this.lastOkAt.getTime() > 600_000;
    this.lastOkAt = now;
    if (stale || this.lastError) {
      this.lastError = null;
      await this.prisma.aiCredential
        .update({
          where: { id: CREDENTIAL_ID },
          data: { lastOkAt: now, lastError: null },
        })
        .catch(() => undefined);
    }
  }

  private async recordFailure(error: unknown) {
    const message = (error instanceof Error ? error.message : 'unknown').slice(
      0,
      500,
    );
    this.consecutiveFailures += 1;
    this.lastError = message;
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.pausedUntil = Date.now() + PAUSE_MS;
      this.logger.warn(
        `Codex paused for ${PAUSE_MS / 60_000} min after ${this.consecutiveFailures} failures`,
      );
    }
    this.logger.warn(`Codex run failed: ${message}`);
    await this.prisma.aiCredential
      .update({ where: { id: CREDENTIAL_ID }, data: { lastError: message } })
      .catch(() => undefined);
  }
}
