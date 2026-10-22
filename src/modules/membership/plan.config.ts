/**
 * Central plan / price / AI quota configuration.
 * Do not hardcode these values in LINE handlers or AI call sites.
 */

export const PRO_MONTHLY_PRICE_THB = 50;

export const TRIAL_DEFAULT_DAYS = 7;

export type PlanId = 'FREE' | 'PRO';

export type AiOperation =
  | 'FOOD_TEXT'
  | 'FOOD_VISION'
  | 'COMPOSITION_ADJUSTMENT'
  | 'COACH'
  | 'CLASSIFY'
  | 'BODY_SCAN'
  | 'MEAL_PLAN'
  | 'WEEKLY_REVIEW';

export type AiDailyLimits = {
  FOOD_TEXT: number;
  FOOD_VISION: number;
  COMPOSITION_ADJUSTMENT: number;
  COACH: number;
  CLASSIFY: number;
  BODY_SCAN: number;
  MEAL_PLAN: number;
  WEEKLY_REVIEW: number;
};

export const FREE_AI_LIMITS: AiDailyLimits = {
  FOOD_TEXT: 5,
  FOOD_VISION: 2,
  COMPOSITION_ADJUSTMENT: 3,
  COACH: 3,
  CLASSIFY: 5,
  BODY_SCAN: 1,
  MEAL_PLAN: 2,
  WEEKLY_REVIEW: 1,
};

export const PRO_AI_LIMITS: AiDailyLimits = {
  FOOD_TEXT: 30,
  FOOD_VISION: 15,
  COMPOSITION_ADJUSTMENT: 20,
  COACH: 30,
  CLASSIFY: 30,
  BODY_SCAN: 5,
  MEAL_PLAN: 15,
  WEEKLY_REVIEW: 4,
};

export const FREE_PLAN = {
  id: 'FREE' as const,
  labelTh: 'Free',
  priceThbMonthly: 0,
  aiLimits: FREE_AI_LIMITS,
  marketingBlurbTh: 'Core tracking ใช้งานได้ฟรี',
};

export const PRO_PLAN = {
  id: 'PRO' as const,
  labelTh: 'Pro',
  priceThbMonthly: PRO_MONTHLY_PRICE_THB,
  aiLimits: PRO_AI_LIMITS,
  /** Never claim unlimited AI. */
  marketingBlurbTh: 'ใช้งาน AI ได้มากขึ้น',
};

export function limitsForPlan(plan: PlanId): AiDailyLimits {
  return plan === 'PRO' ? PRO_AI_LIMITS : FREE_AI_LIMITS;
}

export function limitFor(plan: PlanId, operation: AiOperation): number {
  return limitsForPlan(plan)[operation];
}
