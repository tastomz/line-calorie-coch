import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { currentAiRoute } from './ai-route';
import { getCodexBackend } from './codex-bridge';
import { fastModel } from './ai-models';
import { toChatCompletion } from '../modules/codex/codex-chat';

const logger = new Logger('OpenAiClient');

type CreateFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Same as `new OpenAI({ apiKey })`, except that inside a Trial user's
 * AiGateway run (route = 'codex') chat completions are answered by the
 * owner's ChatGPT sign-in through Codex. Falls back to the API key when
 * Codex is signed out, paused, busy or fails.
 *
 * FAST-model calls (message routing, photo-kind pre-check) always use the
 * API: they are tiny, and a Codex run (~several seconds) would slow every reply.
 */
export function createOpenAiClient(apiKey: string): OpenAI {
  const client = new OpenAI({ apiKey });
  const completions = client.chat.completions;
  const original = completions.create.bind(completions) as CreateFn;

  const routed: CreateFn = async (...args: unknown[]) => {
    const params = (args[0] ?? {}) as { model?: string; stream?: boolean };
    const codex = getCodexBackend();
    if (
      currentAiRoute() === 'codex' &&
      codex?.available() &&
      !params.stream &&
      params.model !== fastModel()
    ) {
      try {
        const r = await codex.chat(params);
        return toChatCompletion(r.text, r.model, {
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
        });
      } catch (error) {
        logger.warn(
          `Codex failed, falling back to API: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
        );
      }
    }
    return original(...args);
  };

  (completions as unknown as { create: CreateFn }).create = routed;
  return client;
}
