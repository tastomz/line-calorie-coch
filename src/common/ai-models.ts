/**
 * Which OpenAI models the bot uses, in one place.
 *
 * - SMART: food estimates (text + photo), coach, weekly review, meal plan,
 *   body-scan extraction — quality matters.
 * - FAST: message routing classifier and the photo-kind pre-check — tiny
 *   structured-JSON tasks where latency matters most.
 *
 * Override without a rebuild via Railway variables AI_MODEL_SMART /
 * AI_MODEL_FAST (e.g. set back to `gpt-5` if a new model misbehaves).
 * FOOD_VISION_MODEL, when set, still overrides the model for food photos.
 */
export const DEFAULT_SMART_MODEL = 'gpt-6.1-sol';
export const DEFAULT_FAST_MODEL = 'gpt-6-luna';

const MODEL_ID = /^[\w.-]{1,64}$/;

function fromEnv(name: string, fallback: string): string {
  const raw = (process.env[name] ?? '').trim();
  return raw && MODEL_ID.test(raw) ? raw : fallback;
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
