import { isLikelyFoodText } from './food-text-heuristic';

describe('isLikelyFoodText', () => {
  it('detects obvious Thai meal descriptions', () => {
    expect(isLikelyFoodText('ข้าวกะเพราไก่')).toBe(true);
    expect(isLikelyFoodText('ข้าวกะเพราไก่ไข่ดาว 1 จาน')).toBe(true);
    expect(isLikelyFoodText('ต้มยำกุ้ง')).toBe(true);
    expect(isLikelyFoodText('chicken rice')).toBe(true);
    expect(isLikelyFoodText('อะไรสักอย่าง')).toBe(false); // ambiguous → classify
  });

  it('rejects weight, coach, greetings, and bare numbers', () => {
    expect(isLikelyFoodText('84.2')).toBe(false);
    expect(isLikelyFoodText('น้ำหนักล่าสุด')).toBe(false);
    expect(isLikelyFoodText('วันนี้กินไปกี่แคล')).toBe(false);
    expect(isLikelyFoodText('มื้อเย็นกินอะไรดี')).toBe(false);
    expect(isLikelyFoodText('สวัสดี')).toBe(false);
    expect(isLikelyFoodText('')).toBe(false);
  });
});
