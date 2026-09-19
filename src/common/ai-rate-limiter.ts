/**
 * In-memory per-LINE-user rate limiter for expensive AI operations.
 *
 * V1 limits (documented):
 * - food text analysis: 8 requests / minute / lineUserId
 * - food image analysis: 4 requests / minute / lineUserId
 * - message classify: 20 requests / minute / lineUserId
 * - coach (tips / meal suggestions): 10 requests / minute / lineUserId
 *
 * Identity is LINE user id — not IP (shared infra).
 */
export type AiRateBucket = 'food_text' | 'food_image' | 'classify' | 'coach';

const LIMITS: Record<AiRateBucket, { max: number; windowMs: number }> = {
  food_text: { max: 8, windowMs: 60_000 },
  food_image: { max: 4, windowMs: 60_000 },
  classify: { max: 20, windowMs: 60_000 },
  coach: { max: 10, windowMs: 60_000 },
};

type WindowState = { count: number; windowStartMs: number };

export class AiRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  tryConsume(lineUserId: string, bucket: AiRateBucket): boolean {
    if (!lineUserId) {
      return false;
    }
    const { max, windowMs } = LIMITS[bucket];
    const key = `${bucket}:${lineUserId}`;
    const now = Date.now();
    const current = this.windows.get(key);

    if (!current || now - current.windowStartMs >= windowMs) {
      this.windows.set(key, { count: 1, windowStartMs: now });
      return true;
    }

    if (current.count >= max) {
      return false;
    }

    current.count += 1;
    return true;
  }

  /** Test helper */
  reset(): void {
    this.windows.clear();
  }
}

export const aiRateLimiter = new AiRateLimiter();

export function describeAiRateLimits(): string {
  return [
    `food text analysis: ${LIMITS.food_text.max}/min per LINE user`,
    `food image analysis: ${LIMITS.food_image.max}/min per LINE user`,
    `message classify: ${LIMITS.classify.max}/min per LINE user`,
    `coach tips/meals: ${LIMITS.coach.max}/min per LINE user`,
  ].join('; ');
}
