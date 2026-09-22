import {
  generateTastomPromoCode,
  isAllowedPromoDays,
  PROMO_ALLOWED_DAYS,
} from './promo-code.generator';

describe('promo-code.generator', () => {
  it('allows only 10/15/30 day durations', () => {
    expect(PROMO_ALLOWED_DAYS).toEqual([10, 15, 30]);
    expect(isAllowedPromoDays(10)).toBe(true);
    expect(isAllowedPromoDays(7)).toBe(false);
    expect(isAllowedPromoDays(14)).toBe(false);
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
