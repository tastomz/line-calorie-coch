export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Race a promise against a timeout. Does not cancel the underlying work. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = 'operation',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** OpenAI call budget for V1 webhook-safe processing. */
export const OPENAI_CALL_TIMEOUT_MS = 15_000;

/**
 * Text messages run classify → food analysis back to back inside the 25 s
 * event budget. Classify is a tiny 'minimal'-effort call; food analysis
 * ('low' effort) gets the rest. 7 s + 17 s leaves ~1 s for DB + LINE reply.
 */
export const OPENAI_CLASSIFY_TIMEOUT_MS = 7_000;
export const OPENAI_FOOD_TIMEOUT_MS = 17_000;

/** Google Sheets outbound budget (reporting only; never blocks UX). */
export const SHEETS_CALL_TIMEOUT_MS = 10_000;

/** Per-event processing budget (replyToken ~30s). */
export const WEBHOOK_EVENT_BUDGET_MS = 25_000;
