import { spawn } from 'child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  CodexRequest,
  CodexUsage,
  cleanCodexText,
  usageFromCodexEvents,
} from './codex-chat';

/**
 * Runs the official, unmodified Codex CLI once with the owner's ChatGPT
 * sign-in (ported from simply-brands / เทพเย่).
 *  - auth.json goes into a fresh 0700 dir per run and is deleted afterwards
 *  - the child gets a minimal env (no DATABASE_URL, no API keys, no secrets)
 *  - read-only sandbox, ephemeral session, user config ignored, empty workdir
 */
export type CodexRunInput = {
  bin: string;
  authJson: string;
  model: string | null;
  request: CodexRequest;
  timeoutMs: number;
  runDir?: string;
  /**
   * Called when Codex refreshed its tokens — also when the run itself failed,
   * so a rotated refresh token is never lost.
   */
  onAuthUpdated?: (authJson: string) => Promise<void>;
};

export type CodexRunResult = {
  text: string;
  usage: CodexUsage | null;
};

export class CodexRunError extends Error {}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function redactSecrets(s: string): string {
  return s.replace(
    /(eyJ[\w-]+\.[\w-]+\.[\w-]+)|((access|refresh|id)_token["':\s]+[^\s"']+)/gi,
    '[redacted]',
  );
}

export function buildCodexArgs(opts: {
  workdir: string;
  outFile: string;
  model: string | null;
  effort: CodexRequest['effort'];
  imagePaths: string[];
  schemaPath: string | null;
}): string[] {
  const args = [
    'exec',
    '--json',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-user-config',
    '--color',
    'never',
    '-C',
    opts.workdir,
    '-o',
    opts.outFile,
  ];
  if (opts.model) args.push('-m', opts.model);
  if (opts.effort) args.push('-c', `model_reasoning_effort="${opts.effort}"`);
  for (const p of opts.imagePaths) args.push('-i', p);
  if (opts.schemaPath) args.push('--output-schema', opts.schemaPath);
  args.push('-');
  return args;
}

export async function runCodexExec(
  input: CodexRunInput,
): Promise<CodexRunResult> {
  // Codex refuses to set up helper binaries under /tmp — use a dir under $HOME.
  const base = input.runDir || join(homedir(), '.kcal-codex-runs');
  await mkdir(base, { recursive: true, mode: 0o700 });
  const home = await mkdtemp(join(base, 'run-'));
  const workdir = join(home, 'work');
  const outFile = join(home, 'last-message.txt');
  const authPath = join(home, 'auth.json');

  try {
    await mkdir(workdir, { mode: 0o700 });
    await writeFile(authPath, input.authJson, { mode: 0o600 });

    const imagePaths: string[] = [];
    for (const [i, img] of input.request.images.entries()) {
      const p = join(workdir, `photo-${i + 1}.${EXT[img.mime] ?? 'jpg'}`);
      await writeFile(p, img.data, { mode: 0o600 });
      imagePaths.push(p);
    }
    let schemaPath: string | null = null;
    if (input.request.schema) {
      schemaPath = join(home, 'schema.json');
      await writeFile(schemaPath, JSON.stringify(input.request.schema), {
        mode: 0o600,
      });
    }

    const args = buildCodexArgs({
      workdir,
      outFile,
      model: input.model,
      effort: input.request.effort,
      imagePaths,
      schemaPath,
    });

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(input.bin, args, {
        cwd: workdir,
        env: {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          HOME: home,
          CODEX_HOME: home,
          LANG: 'C.UTF-8',
          ...(process.env.SSL_CERT_FILE
            ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE }
            : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d: Buffer) => {
        out = (out + d.toString()).slice(-200_000);
      });
      child.stderr.on('data', (d: Buffer) => {
        err = (err + d.toString()).slice(-4000);
      });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, input.timeoutMs);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new CodexRunError(`codex spawn failed: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(
            new CodexRunError(`codex timed out after ${input.timeoutMs}ms`),
          );
        } else if (code === 0) {
          resolve(out);
        } else {
          const lastError = out
            .split('\n')
            .filter((l) => l.includes('"type":"error"'))
            .slice(-1)[0];
          reject(
            new CodexRunError(
              `codex exit ${code}: ${redactSecrets(lastError ?? err).slice(-500)}`,
            ),
          );
        }
      });
      child.stdin.end(input.request.prompt);
    });

    const raw = await readFile(outFile, 'utf8').catch(() => '');
    const text = cleanCodexText(raw, Boolean(input.request.schema));
    if (!text) throw new CodexRunError('codex returned an empty answer');
    return {
      text,
      usage: usageFromCodexEvents(stdout),
    };
  } finally {
    const updated = await readFile(authPath, 'utf8').catch(() => null);
    if (updated && updated !== input.authJson && input.onAuthUpdated) {
      await input.onAuthUpdated(updated).catch(() => undefined);
    }
    await rm(home, { recursive: true, force: true });
  }
}
