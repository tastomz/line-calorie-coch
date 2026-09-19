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

  it('parses absolute Thai quantity phrases', () => {
    expect(parseQuantityAdjustment('กินแค่ 3 ชิ้น')).toEqual({
      kind: 'absolute',
      quantity: 3,
    });
    expect(parseQuantityAdjustment('กิน 5 คำ')).toEqual({
      kind: 'absolute',
      quantity: 5,
    });
  });

  it('parses fraction phrases', () => {
    expect(parseQuantityAdjustment('กินไป 3 จาก 10')).toEqual({
      kind: 'fraction',
      numerator: 3,
      denominator: 10,
    });
  });

  it('parses half', () => {
    expect(parseQuantityAdjustment('กินครึ่งหนึ่ง')).toEqual({ kind: 'half' });
    expect(parseQuantityAdjustment('กินครึ่งจาน')).toEqual({ kind: 'half' });
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
    expect(resolveConsumedQuantity({ kind: 'absolute', quantity: 3 }, 10)).toBe(
      3,
    );
    expect(
      resolveConsumedQuantity(
        { kind: 'fraction', numerator: 3, denominator: 10 },
        10,
      ),
    ).toBe(3);
  });
});
