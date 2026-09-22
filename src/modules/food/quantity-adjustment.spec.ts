import {
  applyProportionalNutrition,
  parseQuantityAdjustment,
  resolveConsumedQuantity,
} from './quantity-adjustment';

describe('quantity-adjustment', () => {
  it('parses eat-all phrases', () => {
    expect(parseQuantityAdjustment('กินหมด')).toEqual({ kind: 'all' });
    expect(parseQuantityAdjustment('กินทั้งหมด')).toEqual({ kind: 'all' });
  });

  it('parses percentage before absolute', () => {
    expect(parseQuantityAdjustment('กินแค่ 50%')).toEqual({
      kind: 'percent',
      percent: 50,
    });
    expect(parseQuantityAdjustment('กิน 50%')).toEqual({
      kind: 'percent',
      percent: 50,
    });
    expect(parseQuantityAdjustment('กินไป 50%')).toEqual({
      kind: 'percent',
      percent: 50,
    });
    expect(parseQuantityAdjustment('25%')).toEqual({
      kind: 'percent',
      percent: 25,
    });
    expect(parseQuantityAdjustment('75%')).toEqual({
      kind: 'percent',
      percent: 75,
    });
    expect(parseQuantityAdjustment('100%')).toEqual({
      kind: 'percent',
      percent: 100,
    });
    expect(parseQuantityAdjustment('กิน 50 เปอร์เซ็นต์')).toEqual({
      kind: 'percent',
      percent: 50,
    });
    expect(parseQuantityAdjustment('กิน 50 เปอร์เซ็น')).toEqual({
      kind: 'percent',
      percent: 50,
    });
  });

  it('resolves percent relative to originalQuantity', () => {
    expect(resolveConsumedQuantity({ kind: 'percent', percent: 50 }, 1)).toBe(
      0.5,
    );
    expect(resolveConsumedQuantity({ kind: 'percent', percent: 50 }, 2)).toBe(
      1,
    );
    expect(resolveConsumedQuantity({ kind: 'percent', percent: 25 }, 1)).toBe(
      0.25,
    );
    expect(resolveConsumedQuantity({ kind: 'percent', percent: 100 }, 1)).toBe(
      1,
    );
  });

  it('parses absolute Thai quantity phrases with required unit', () => {
    expect(parseQuantityAdjustment('กินแค่ 3 ชิ้น')).toEqual({
      kind: 'absolute',
      quantity: 3,
    });
    expect(parseQuantityAdjustment('กิน 5 คำ')).toEqual({
      kind: 'absolute',
      quantity: 5,
    });
    expect(parseQuantityAdjustment('กิน 2 จาน')).toEqual({
      kind: 'absolute',
      quantity: 2,
    });
    expect(parseQuantityAdjustment('กิน 3 ชิ้น')).toEqual({
      kind: 'absolute',
      quantity: 3,
    });
    expect(parseQuantityAdjustment('กิน 4 คำ')).toEqual({
      kind: 'absolute',
      quantity: 4,
    });
  });

  it('treats กิน + number without unit as ambiguous', () => {
    expect(parseQuantityAdjustment('กิน 50')).toEqual({ kind: 'ambiguous' });
    expect(parseQuantityAdjustment('กินแค่ 50')).toEqual({
      kind: 'ambiguous',
    });
    expect(parseQuantityAdjustment('กินไป 50')).toEqual({ kind: 'ambiguous' });
  });

  it('parses fraction phrases', () => {
    expect(parseQuantityAdjustment('กินไป 3 จาก 10')).toEqual({
      kind: 'fraction',
      numerator: 3,
      denominator: 10,
    });
    expect(parseQuantityAdjustment('กิน 1/2')).toEqual({
      kind: 'fraction',
      numerator: 1,
      denominator: 2,
    });
    expect(parseQuantityAdjustment('กิน 1/3')).toEqual({
      kind: 'fraction',
      numerator: 1,
      denominator: 3,
    });
    expect(parseQuantityAdjustment('กิน 2/3')).toEqual({
      kind: 'fraction',
      numerator: 2,
      denominator: 3,
    });
  });

  it('parses half', () => {
    expect(parseQuantityAdjustment('กินครึ่ง')).toEqual({ kind: 'half' });
    expect(parseQuantityAdjustment('กินครึ่งหนึ่ง')).toEqual({ kind: 'half' });
    expect(parseQuantityAdjustment('กินครึ่งจาน')).toEqual({ kind: 'half' });
    expect(parseQuantityAdjustment('กิน half')).toEqual({ kind: 'half' });
  });

  it('flags ambiguous phrases', () => {
    expect(parseQuantityAdjustment('กินไปนิดเดียว')).toEqual({
      kind: 'ambiguous',
    });
  });

  it('flags composition changes for AI reinterpretation', () => {
    expect(parseQuantityAdjustment('กินแต่ปลา ไม่กินข้าว')).toEqual({
      kind: 'composition',
    });
    expect(parseQuantityAdjustment('กินแต่ไส้ ไม่กินแป้ง')).toEqual({
      kind: 'composition',
    });
  });

  it('treats bare numbers as quantity only when allowBareNumber is true', () => {
    expect(parseQuantityAdjustment('3')).toEqual({ kind: 'none' });
    expect(parseQuantityAdjustment('84.2')).toEqual({ kind: 'none' });
    expect(parseQuantityAdjustment('3', { allowBareNumber: true })).toEqual({
      kind: 'absolute',
      quantity: 3,
    });
    expect(parseQuantityAdjustment('84.2', { allowBareNumber: true })).toEqual({
      kind: 'absolute',
      quantity: 84.2,
    });
  });

  it('parses explicit quantity phrases without needing allowBareNumber', () => {
    expect(parseQuantityAdjustment('กิน 3 ชิ้น')).toEqual({
      kind: 'absolute',
      quantity: 3,
    });
    expect(parseQuantityAdjustment('กินแค่ 3 ชิ้น')).toEqual({
      kind: 'absolute',
      quantity: 3,
    });
  });

  it('calculates proportional nutrition deterministically', () => {
    // 10 pieces = 600 kcal → 3 pieces = 180
    const adjusted = applyProportionalNutrition(
      { calories: 600, proteinG: 25, carbsG: 80, fatG: 20 },
      3 / 10,
    );
    expect(adjusted).toEqual({
      calories: 180,
      proteinG: 7.5,
      carbsG: 24,
      fatG: 6,
    });
  });

  it('resolves consumed quantity from adjustments', () => {
    expect(resolveConsumedQuantity({ kind: 'all' }, 10)).toBe(10);
    expect(resolveConsumedQuantity({ kind: 'half' }, 10)).toBe(5);
    expect(resolveConsumedQuantity({ kind: 'half' }, 1)).toBe(0.5);
    expect(resolveConsumedQuantity({ kind: 'absolute', quantity: 3 }, 10)).toBe(
      3,
    );
    expect(
      resolveConsumedQuantity(
        { kind: 'fraction', numerator: 3, denominator: 10 },
        10,
      ),
    ).toBe(3);
    expect(
      resolveConsumedQuantity(
        { kind: 'fraction', numerator: 1, denominator: 2 },
        1,
      ),
    ).toBe(0.5);
    expect(
      resolveConsumedQuantity(
        { kind: 'fraction', numerator: 1, denominator: 3 },
        1,
      ),
    ).toBeCloseTo(1 / 3);
    expect(
      resolveConsumedQuantity(
        { kind: 'fraction', numerator: 2, denominator: 3 },
        1,
      ),
    ).toBeCloseTo(2 / 3);
  });
});
