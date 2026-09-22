import { AsyncLocalStorage } from 'async_hooks';

export type AiTokenUsageMeta = {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

type Store = {
  record: (meta: AiTokenUsageMeta) => void;
};

const als = new AsyncLocalStorage<Store>();

/**
 * Report OpenAI token usage into the active AiGateway run.
 * Safe no-op outside a gateway context (e.g. unit tests of OpenAI clients).
 */
export function reportAiTokenUsage(meta: AiTokenUsageMeta): void {
  const store = als.getStore();
  if (!store) return;
  const input = Math.max(0, Math.floor(meta.inputTokens || 0));
  const output = Math.max(0, Math.floor(meta.outputTokens || 0));
  const model = (meta.model ?? '').trim() || 'unknown';
  store.record({
    model,
    inputTokens: input,
    outputTokens: output,
  });
}

export function runWithAiTokenCapture<T>(
  onCapture: (meta: AiTokenUsageMeta) => void,
  work: () => Promise<T>,
): Promise<T> {
  return als.run({ record: onCapture }, work);
}

/** Extract usage from OpenAI chat completion-shaped responses. */
export function usageFromOpenAiCompletion(
  completion: {
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
  },
  fallbackModel: string,
): AiTokenUsageMeta | null {
  const usage = completion.usage;
  if (!usage) return null;
  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  return {
    model: (completion.model ?? fallbackModel).trim() || fallbackModel,
    inputTokens: input,
    outputTokens: output,
  };
}
