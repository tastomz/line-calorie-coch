import { detectCoachIntent } from './coach-intent';

describe('detectCoachIntent', () => {
  it('detects calorie questions', () => {
    expect(detectCoachIntent('วันนี้กินไปกี่แคล')).toBe('calories_consumed');
    expect(detectCoachIntent('วันนี้เหลือกี่แคล')).toBe('calories_remaining');
  });

  it('detects protein questions', () => {
    expect(detectCoachIntent('โปรตีนเหลือเท่าไร')).toBe('protein_remaining');
    expect(detectCoachIntent('วันนี้โปรตีนกี่กรัม')).toBe('protein_consumed');
  });

  it('detects history and meal recommendation', () => {
    expect(detectCoachIntent('วันนี้กินอะไรไปบ้าง')).toBe('history');
    expect(detectCoachIntent('มื้อเย็นกินอะไรดี')).toBe('meal_recommendation');
    expect(detectCoachIntent('ตอนนี้ควรกินอะไร')).toBe('meal_recommendation');
  });

  it('returns none for food logging text', () => {
    expect(detectCoachIntent('ข้าวกะเพราไก่ไข่ดาว 1 จาน')).toBe('none');
    expect(detectCoachIntent('sushi 3 pieces')).toBe('none');
  });

  describe('medical gate', () => {
    it.each([
      'ยากิโซบะ หมู',
      'มื้อเช้า ยากิโซบะ หมู',
      'ยากิโซบะหมู',
      'กินยากิโซบะ',
      'ปลาหมอทอด',
      'ข้าวยำไก่',
      'ผัดยากๆ',
      'ยากิทอริ 3 ไม้',
    ])('does not treat the food "%s" as medical', (text) => {
      expect(detectCoachIntent(text)).not.toBe('medical');
    });

    it.each([
      'กินยาลดความอ้วนดีไหม',
      'ยาเบาหวาน กินอะไรได้',
      'เป็นโรคเบาหวานกินอะไรได้',
      'ควรปรึกษาหมอไหม',
      'กินยาอะไรดี',
      'ยา',
      'ผมกินยา 2 เม็ด',
      'ยา 2 เม็ด',
    ])('still treats "%s" as medical', (text) => {
      expect(detectCoachIntent(text)).toBe('medical');
    });
  });
});
