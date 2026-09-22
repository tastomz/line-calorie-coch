import {
  buildMembershipStatusMessage,
  buildPromoErrorMessage,
  buildPromoSuccessMessage,
  buildQuotaExceededMessage,
  isMembershipCommand,
  parsePromoCommand,
} from './membership.messages';
import { AiQuotaExceededError } from './membership.errors';
import { FREE_AI_LIMITS, PRO_MONTHLY_PRICE_THB } from './plan.config';

describe('membership.messages', () => {
  it('recognizes membership commands', () => {
    expect(isMembershipCommand('สมาชิก')).toBe(true);
    expect(isMembershipCommand('แพ็กเกจ')).toBe(true);
    expect(isMembershipCommand('สิทธิ์')).toBe(true);
    expect(isMembershipCommand('วันนี้')).toBe(false);
  });

  it('parses promo command', () => {
    expect(parsePromoCommand('ใช้โค้ด WELCOME30')).toBe('WELCOME30');
    expect(parsePromoCommand('ใช้โค้ด  beta30')).toBe('beta30');
    expect(parsePromoCommand('สมาชิก')).toBeNull();
  });

  it('builds FREE membership summary with price', () => {
    const text = buildMembershipStatusMessage(
      {
        plan: 'FREE',
        status: 'NONE',
        hasProAccess: false,
        subscription: null,
        periodEnd: null,
      },
      {
        usageDate: '2026-09-22',
        foodTextCalls: 3,
        visionCalls: 1,
        adjustmentCalls: 0,
        coachCalls: 1,
        classifyCalls: 0,
        bodyScanCalls: 0,
        mealPlanCalls: 0,
        weeklyReviewCalls: 0,
        totalCalls: 5,
      },
    );
    expect(text).toContain('Free');
    expect(text).toContain(`3/${FREE_AI_LIMITS.FOOD_TEXT}`);
    expect(text).toContain(`${PRO_MONTHLY_PRICE_THB} บาท`);
    expect(text).toContain('ใช้งาน AI ได้มากขึ้น');
    expect(text).not.toContain('ไม่จำกัด');
  });

  it('builds quota exceeded and promo messages', () => {
    const q = buildQuotaExceededMessage(
      new AiQuotaExceededError('FOOD_VISION', 'FREE', 2, 2),
    );
    expect(q).toContain('2/2');
    expect(q).toContain('Pro');

    expect(
      buildPromoSuccessMessage({
        code: 'WELCOME30',
        trialDays: 30,
        expiresAt: new Date('2026-10-22T00:00:00.000Z'),
      }),
    ).toContain('30 วัน');

    expect(buildPromoErrorMessage('already_redeemed')).toContain('เคยใช้');
    expect(buildPromoErrorMessage('already_pro')).toContain('Pro อยู่แล้ว');
  });
});
