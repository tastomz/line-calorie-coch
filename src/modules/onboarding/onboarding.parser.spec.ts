import {
  parseActivityLevel,
  parseAge,
  parseGoal,
  parseHeightCm,
  parsePositiveNumber,
  parseSex,
  parseWeightKg,
} from './onboarding.parser';

describe('onboarding.parser', () => {
  it('parses sex choices', () => {
    expect(parseSex('ชาย')).toBe('MALE');
    expect(parseSex('หญิง')).toBe('FEMALE');
    expect(parseSex('อื่น')).toBeNull();
  });

  it('parses age from free text within bounds', () => {
    expect(parseAge('อายุ 29')).toBe(29);
    expect(parseAge('29')).toBe(29);
    expect(parseAge('อายุ abc')).toBeNull();
    expect(parseAge('29.5')).toBeNull();
    expect(parseAge('9')).toBeNull();
    expect(parseAge('101')).toBeNull();
  });

  it('parses height and weight with bounds', () => {
    expect(parseHeightCm('181')).toBe(181);
    expect(parseHeightCm('99')).toBeNull();
    expect(parseHeightCm('251')).toBeNull();
    expect(parseWeightKg('84.2')).toBe(84.2);
    expect(parseWeightKg('19')).toBeNull();
    expect(parseWeightKg('301')).toBeNull();
    expect(parsePositiveNumber('181')).toBe(181);
    expect(parsePositiveNumber('0')).toBeNull();
  });

  it('parses activity and goal labels', () => {
    expect(parseActivityLevel('น้อยมาก')).toBe('SEDENTARY');
    expect(parseActivityLevel('เบา')).toBe('LIGHT');
    expect(parseActivityLevel('ปานกลาง')).toBe('MODERATE');
    expect(parseActivityLevel('มาก')).toBe('ACTIVE');
    expect(parseActivityLevel('มากมาก')).toBe('VERY_ACTIVE');
    expect(parseGoal('ลดน้ำหนัก')).toBe('LOSE_WEIGHT');
    expect(parseGoal('รักษาน้ำหนัก')).toBe('MAINTAIN_WEIGHT');
    expect(parseGoal('เพิ่มน้ำหนัก')).toBe('GAIN_WEIGHT');
  });
});
