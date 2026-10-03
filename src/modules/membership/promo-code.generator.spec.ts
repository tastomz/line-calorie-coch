import {
  generateTastomPromoCode,
  isValidPromoDays,
  isValidPromoMaxRedemptions,
  parsePromoParams,
  PROMO_MAX_DAYS,
  PROMO_MAX_REDEMPTIONS,
} from './promo-code.generator';

describe('promo-code.generator', () => {
  it.each([1, 7, 14, 30, 90, PROMO_MAX_DAYS])('accepts %i days', (days) => {
    expect(isValidPromoDays(days)).toBe(true);
  });

  it.each([
    0,
    -5,
    PROMO_MAX_DAYS + 1,
    1.5,
    NaN,
    Infinity,
    '30',
    null,
    undefined,
  ])('rejects %p days', (days) => {
    expect(isValidPromoDays(days)).toBe(false);
  });

  it.each([1, 2, 500, PROMO_MAX_REDEMPTIONS])('accepts %i redemptions', (n) => {
    expect(isValidPromoMaxRedemptions(n)).toBe(true);
  });

  it.each([0, -1, PROMO_MAX_REDEMPTIONS + 1, 2.5, '5', NaN, null])(
    'rejects %p redemptions',
    (n) => {
      expect(isValidPromoMaxRedemptions(n)).toBe(false);
    },
  );

  describe('parsePromoParams', () => {
    it('uses defaults (30 days, 1 redemption) when values are missing', () => {
      expect(parsePromoParams({})).toEqual({
        trialDays: 30,
        maxRedemptions: 1,
      });
      expect(
        parsePromoParams({ trialDays: null, maxRedemptions: null }),
      ).toEqual({ trialDays: 30, maxRedemptions: 1 });
    });

    it('passes typed values through', () => {
      expect(parsePromoParams({ trialDays: 7, maxRedemptions: 50 })).toEqual({
        trialDays: 7,
        maxRedemptions: 50,
      });
    });

    it.each([
      [{ trialDays: 0 }, 'trialDays'],
      [{ trialDays: 400 }, 'trialDays'],
      [{ trialDays: 7.5 }, 'trialDays'],
      [{ trialDays: '7' }, 'trialDays'],
      [{ maxRedemptions: 0 }, 'maxRedemptions'],
      [{ maxRedemptions: 5000 }, 'maxRedemptions'],
      [{ maxRedemptions: '3' }, 'maxRedemptions'],
    ])('rejects %j', (input, field) => {
      expect(() => parsePromoParams(input)).toThrow(field);
    });
  });

  it('generates TASTOM-XXXXXX uppercase codes', () => {
    const code = generateTastomPromoCode();
    expect(code).toMatch(/^TASTOM-[A-Z0-9]{6}$/);
    const codes = new Set(
      Array.from({ length: 20 }, () => generateTastomPromoCode()),
    );
    expect(codes.size).toBe(20);
  });
});
