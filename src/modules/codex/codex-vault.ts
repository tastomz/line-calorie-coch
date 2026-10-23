import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM for the ChatGPT sign-in (Codex auth.json).
 * The key lives only in the CODEX_VAULT_KEY env var (32 bytes, hex or base64);
 * the database stores iv/tag/ciphertext only.
 */
export type SealedSecret = { iv: string; tag: string; ciphertext: string };

export class CodexVaultKeyError extends Error {}

export function parseVaultKey(raw: string | undefined): Buffer {
  const s = (raw ?? '').trim();
  if (!s) throw new CodexVaultKeyError('CODEX_VAULT_KEY is not set');
  const key = /^[0-9a-f]{64}$/i.test(s)
    ? Buffer.from(s, 'hex')
    : Buffer.from(s, 'base64');
  if (key.length !== 32) {
    throw new CodexVaultKeyError(
      'CODEX_VAULT_KEY must be 32 bytes (64 hex chars or base64)',
    );
  }
  return key;
}

export function seal(key: Buffer, plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function unseal(key: Buffer, sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(sealed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Accepts the contents of ~/.codex/auth.json from `codex login`
 * (ChatGPT sign-in). Rejects API-key-only files — Trial must use the sign-in.
 */
export function validateAuthJson(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 50_000) {
    throw new Error('auth.json ต้องเป็นข้อความ (ไม่เกิน 50KB)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('auth.json ไม่ใช่ JSON ที่ถูกต้อง');
  }
  const tokens = (parsed as { tokens?: Record<string, unknown> } | null)
    ?.tokens;
  if (
    !tokens ||
    typeof tokens.refresh_token !== 'string' ||
    typeof tokens.access_token !== 'string'
  ) {
    throw new Error(
      'ไม่พบ tokens.access_token / refresh_token — ต้องเป็นไฟล์จาก `codex login` แบบ Sign in with ChatGPT',
    );
  }
  return JSON.stringify(parsed);
}

/** Account label for the admin card — never the tokens themselves. */
export function describeAuthJson(json: string): {
  accountId: string | null;
  lastRefresh: string | null;
} {
  try {
    const p = JSON.parse(json) as {
      last_refresh?: string;
      tokens?: { account_id?: string };
    };
    const id = p.tokens?.account_id ?? null;
    return {
      accountId: id ? `${id.slice(0, 6)}…` : null,
      lastRefresh: p.last_refresh ?? null,
    };
  } catch {
    return { accountId: null, lastRefresh: null };
  }
}
