import {
  FREE_AI_LIMITS,
  PRO_AI_LIMITS,
  TRIAL_AI_LIMITS,
  PRO_MONTHLY_PRICE_THB,
  TRIAL_DEFAULT_DAYS,
  limitFor,
  limitsForPlan,
} from './plan.config';

describe('plan.config', () => {
  it('centralizes Pro price at 50 THB', () => {
    expect(PRO_MONTHLY_PRICE_THB).toBe(50);
  });

  it('defaults trial to 7 days', () => {
    expect(TRIAL_DEFAULT_DAYS).toBe(7);
  });

  it('exposes FREE and PRO daily AI limits', () => {
    expect(FREE_AI_LIMITS.FOOD_TEXT).toBe(5);
    expect(FREE_AI_LIMITS.FOOD_VISION).toBe(2);
    expect(FREE_AI_LIMITS.COMPOSITION_ADJUSTMENT).toBe(3);
    expect(FREE_AI_LIMITS.COACH).toBe(3);
    expect(FREE_AI_LIMITS.CLASSIFY).toBe(5);
    expect(FREE_AI_LIMITS.BODY_SCAN).toBe(1);
    expect(FREE_AI_LIMITS.MEAL_PLAN).toBe(2);
    expect(FREE_AI_LIMITS.WEEKLY_REVIEW).toBe(1);

    expect(PRO_AI_LIMITS.FOOD_TEXT).toBe(30);
    expect(PRO_AI_LIMITS.FOOD_VISION).toBe(15);
    expect(PRO_AI_LIMITS.COMPOSITION_ADJUSTMENT).toBe(20);
    expect(PRO_AI_LIMITS.COACH).toBe(30);
    expect(PRO_AI_LIMITS.CLASSIFY).toBe(30);
    expect(PRO_AI_LIMITS.BODY_SCAN).toBe(5);
    expect(PRO_AI_LIMITS.MEAL_PLAN).toBe(15);
    expect(PRO_AI_LIMITS.WEEKLY_REVIEW).toBe(4);
  });

  it('assigns a distinct trial quota between free and pro', () => {
    expect(TRIAL_AI_LIMITS.FOOD_TEXT).toBe(10);
    expect(TRIAL_AI_LIMITS.FOOD_VISION).toBe(5);
    expect(TRIAL_AI_LIMITS.COACH).toBe(10);
    expect(limitsForPlan('TRIAL')).toEqual(TRIAL_AI_LIMITS);
  });

  it('resolves limits from plan id', () => {
    expect(limitsForPlan('FREE')).toEqual(FREE_AI_LIMITS);
    expect(limitFor('PRO', 'FOOD_VISION')).toBe(15);
  });
});
