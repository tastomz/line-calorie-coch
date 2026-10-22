import { DiscountType, ProPlan } from '@prisma/client';
import {
  PlanValidationError,
  priceProPlan,
  validateProPlan,
} from './pro-plan.service';

const DAY = 24 * 60 * 60 * 1000;

function plan(overrides: Partial<ProPlan> = {}): ProPlan {
  return {
    id: 'plan_3m',
    code: '3m',
    labelTh: '3 เดือน',
    days: 90,
    priceThb: 170,
    discountType: DiscountType.NONE,
    discountValue: 0,
    discountLabel: null,
    discountStartsAt: null,
    discountEndsAt: null,
    active: true,
    sortOrder: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('priceProPlan', () => {
  const now = new Date('2026-10-22T03:00:00Z');

  it('uses the full price when there is no discount', () => {
    const p = priceProPlan(plan(), now);
    expect(p.finalPriceThb).toBe(170);
    expect(p.discountActive).toBe(false);
    expect(p.perMonthThb).toBe(57);
  });

  it('applies a percent discount (rounded to whole baht)', () => {
    const p = priceProPlan(
      plan({ discountType: DiscountType.PERCENT, discountValue: 15 }),
      now,
    );
    expect(p.finalPriceThb).toBe(145); // 170 × 0.85 = 144.5 → 145
    expect(p.discountActive).toBe(true);
  });

  it('applies a fixed-baht discount', () => {
    const p = priceProPlan(
      plan({ discountType: DiscountType.AMOUNT, discountValue: 20 }),
      now,
    );
    expect(p.finalPriceThb).toBe(150);
  });

  it('ignores a discount outside its time window', () => {
    const notYet = plan({
      discountType: DiscountType.PERCENT,
      discountValue: 50,
      discountStartsAt: new Date(now.getTime() + DAY),
    });
    const ended = plan({
      discountType: DiscountType.PERCENT,
      discountValue: 50,
      discountEndsAt: new Date(now.getTime() - 1),
    });
    expect(priceProPlan(notYet, now).finalPriceThb).toBe(170);
    expect(priceProPlan(ended, now).finalPriceThb).toBe(170);
  });

  it('never prices below ฿10', () => {
    const p = priceProPlan(
      plan({
        priceThb: 12,
        discountType: DiscountType.PERCENT,
        discountValue: 90,
      }),
      now,
    );
    expect(p.finalPriceThb).toBe(10);
  });
});

describe('validateProPlan', () => {
  const base = { code: '2m', labelTh: '2 เดือน', days: 60, priceThb: 115 };

  it('accepts a minimal plan with defaults', () => {
    expect(validateProPlan(base)).toMatchObject({
      code: '2m',
      days: 60,
      priceThb: 115,
      discountType: DiscountType.NONE,
      discountValue: 0,
      active: true,
    });
  });

  it('clears discount fields when discount is NONE', () => {
    const v = validateProPlan({
      ...base,
      discountType: 'NONE',
      discountValue: 30,
      discountLabel: 'x',
      discountEndsAt: '2026-12-31T00:00:00Z',
    });
    expect(v.discountValue).toBe(0);
    expect(v.discountLabel).toBeNull();
    expect(v.discountEndsAt).toBeNull();
  });

  it.each([
    [{ code: 'Bad Code' }, 'code'],
    [{ labelTh: '' }, 'labelTh'],
    [{ days: 0 }, 'days'],
    [{ days: 30.5 }, 'days'],
    [{ priceThb: 5 }, 'priceThb'],
    [{ priceThb: '60' }, 'priceThb'],
    [{ discountType: 'BOGO' }, 'discountType'],
    [{ discountType: 'PERCENT', discountValue: 95 }, 'discountValue'],
    [{ discountType: 'AMOUNT', discountValue: 110 }, 'discountValue'],
    [
      {
        discountType: 'PERCENT',
        discountValue: 10,
        discountStartsAt: '2026-12-01T00:00:00Z',
        discountEndsAt: '2026-11-01T00:00:00Z',
      },
      'discountEndsAt',
    ],
    [{ active: 'yes' }, 'active'],
  ])('rejects %j', (overrides, field) => {
    expect(() => validateProPlan({ ...base, ...overrides })).toThrow(
      PlanValidationError,
    );
    expect(() => validateProPlan({ ...base, ...overrides })).toThrow(field);
  });
});
