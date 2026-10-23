/**
 * Which OpenAI models the bot uses, in one place.
 *
 * - SMART: food estimates (text + photo), coach, weekly review, meal plan,
 *   body-scan extraction — quality matters.
 * - FAST: message routing classifier and the photo-kind pre-check — tiny
 *   structured-JSON tasks where latency matters most.
 *
 * Override without a rebuild via Railway variables AI_MODEL_SMART /
 * AI_MODEL_FAST / FOOD_VISION_MODEL — GPT-6 or newer only; anything older
 * (gpt-4o, gpt-5…) is ignored and the default is used.
 */
export const DEFAULT_SMART_MODEL = 'gpt-6.1-sol';
export const DEFAULT_FAST_MODEL = 'gpt-6-luna';

const MODEL_ID = /^[\w.-]{1,64}$/;

/** gpt-6, gpt-6.1-sol, gpt-7…, gpt-10… */
const GPT6_PLUS = /^gpt-([6-9]|[1-9]\d+)(\.\d+)?(-[\w.-]+)?$/;

export function isGpt6Plus(model: string): boolean {
  return MODEL_ID.test(model) && GPT6_PLUS.test(model);
}

/** A configured model if it is GPT-6+, otherwise the fallback. */
export function gpt6PlusOr(raw: string | undefined, fallback: string): string {
  const m = (raw ?? '').trim();
  return m && isGpt6Plus(m) ? m : fallback;
}

function fromEnv(name: string, fallback: string): string {
  return gpt6PlusOr(process.env[name], fallback);
}

export function smartModel(): string {
  return fromEnv('AI_MODEL_SMART', DEFAULT_SMART_MODEL);
}

export function fastModel(): string {
  return fromEnv('AI_MODEL_FAST', DEFAULT_FAST_MODEL);
}

/** 'fast' = shortest thinking the model allows; 'normal' = a little thought. */
export type AiSpeed = 'fast' | 'normal';

export type ReasoningEffortValue = 'none' | 'minimal' | 'low';

/** Reasoning models reject temperature/max_tokens and need reasoning_effort. */
export const REASONING_MODEL = /^(gpt-5|gpt-6|o\d)/;

/**
 * Lowest supported effort differs per family:
 * gpt-5 → minimal · gpt-6 Luna → none · gpt-6.x Sol / Astra / o-series → low.
 */
export function reasoningEffortFor(
  model: string,
  speed: AiSpeed,
): ReasoningEffortValue {
  if (speed === 'normal') return 'low';
  if (/^gpt-5/.test(model)) return 'minimal';
  if (/^gpt-6(\.\d+)?-luna/.test(model)) return 'none';
  return 'low';
}
