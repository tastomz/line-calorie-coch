import { AsyncLocalStorage } from 'async_hooks';

/**
 * Which backend answers the OpenAI calls made inside the current AiGateway run.
 * - 'api'   → OPENAI_API_KEY (default, Pro / Free)
 * - 'codex' → the owner's ChatGPT sign-in via Codex CLI (Trial package)
 */
export type AiRoute = 'api' | 'codex';

const als = new AsyncLocalStorage<AiRoute>();

export function currentAiRoute(): AiRoute {
  return als.getStore() ?? 'api';
}

export function runWithAiRoute<T>(
  route: AiRoute,
  work: () => Promise<T>,
): Promise<T> {
  return als.run(route, work);
}
