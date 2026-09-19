import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';

export type LogEventFields = {
  event: string;
  lineEventId?: string;
  /** Prefer hashed LINE user id — never log secrets. */
  lineUserKey?: string;
  durationMs?: number;
  errorCategory?: string;
  [key: string]: string | number | boolean | undefined;
};

/** Stable non-reversible key for correlation without storing raw LINE user ids in logs. */
export function hashLineUserId(lineUserId: string): string {
  if (!lineUserId) {
    return 'unknown';
  }
  return createHash('sha256').update(lineUserId).digest('hex').slice(0, 12);
}

/**
 * Structured log helper. Emits a single JSON line via Nest Logger.
 * Never pass secrets, tokens, raw images, or full request bodies.
 */
export function logEvent(
  logger: Logger,
  level: 'log' | 'warn' | 'error' | 'debug',
  fields: LogEventFields,
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    ...fields,
  };
  const line = JSON.stringify(payload);
  switch (level) {
    case 'warn':
      logger.warn(line);
      break;
    case 'error':
      logger.error(line);
      break;
    case 'debug':
      logger.debug(line);
      break;
    default:
      logger.log(line);
  }
}
