import OpenAI from 'openai';
import { currentAiRoute } from './ai-route';
import { getCodexBackend } from './codex-bridge';
import { toChatCompletion } from '../modules/codex/codex-chat';

type CreateFn = (...args: unknown[]) => Promise<unknown>;

export class CodexRouteError extends Error {}

/**
 * Same as `new OpenAI({ apiKey })`, except that inside a Trial user's
 * AiGateway run (route = 'codex') EVERY chat completion — routing classifier
 * and photo-type check included — is answered by the owner's ChatGPT sign-in
 * through Codex. There is no API fallback for Trial: if Codex is signed out,
 * paused or fails, the call fails and the caller's own fallback applies.
 */
export function createOpenAiClient(apiKey: string): OpenAI {
  const client = new OpenAI({ apiKey });
  const completions = client.chat.completions;
  const original = completions.create.bind(completions) as CreateFn;

  const routed: CreateFn = async (...args: unknown[]) => {
    if (currentAiRoute() !== 'codex') return original(...args);
    const params = (args[0] ?? {}) as { stream?: boolean };
    const codex = getCodexBackend();
    if (!codex?.available()) {
      throw new CodexRouteError('Codex is not available for Trial');
    }
    if (params.stream) {
      throw new CodexRouteError('streaming is not supported via Codex');
    }
    const r = await codex.chat(params);
    return toChatCompletion(r.text, r.model, {
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    });
  };

  (completions as unknown as { create: CreateFn }).create = routed;
  return client;
}
