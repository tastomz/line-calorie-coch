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

/** OpenAI call budget for single-call features (coach, reviews, plans). */
export const OPENAI_CALL_TIMEOUT_MS = 30_000;

/**
 * Text messages run classify → food analysis back to back inside the event
 * budget. Classify is a tiny 'minimal'-effort call; food analysis ('low'
 * effort) gets the rest. 10 s + 35 s leaves ~5 s for DB + LINE reply.
 */
export const OPENAI_CLASSIFY_TIMEOUT_MS = 10_000;
export const OPENAI_FOOD_TIMEOUT_MS = 35_000;

/** Google Sheets outbound budget (reporting only; never blocks UX). */
export const SHEETS_CALL_TIMEOUT_MS = 10_000;

/**
 * Per-event processing budget. LINE reply tokens are valid for ~1 minute
 * after the webhook ("use beyond one minute isn't guaranteed"; the limit may
 * change), so stay well inside it.
 */
export const WEBHOOK_EVENT_BUDGET_MS = 50_000;

/** LINE loading indicator length — multiple of 5, max 60; cleared on reply. */
export const LINE_LOADING_SECONDS = 50;
