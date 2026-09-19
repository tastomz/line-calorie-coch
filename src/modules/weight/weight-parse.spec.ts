import {
  detectWeightQuestionIntent,
  isWeightDomainText,
  parseWeightInput,
} from './weight-parse';

describe('parseWeightInput', () => {
  it('parses common Thai weight phrases', () => {
    expect(parseWeightInput('น้ำหนัก 84.2')).toEqual({
      kind: 'weight',
      weightKg: 84.2,
    });
    expect(parseWeightInput('84.2 กก.')).toEqual({
      kind: 'weight',
      weightKg: 84.2,
    });
    expect(parseWeightInput('หนัก 84.2')).toEqual({
      kind: 'weight',
      weightKg: 84.2,
    });
    expect(parseWeightInput('น้ำหนักวันนี้ 83.8')).toEqual({
      kind: 'weight',
      weightKg: 83.8,
    });
    expect(parseWeightInput('วันนี้ชั่งได้ 84.2')).toEqual({
      kind: 'weight',
      weightKg: 84.2,
    });
    expect(parseWeightInput('บันทึกน้ำหนักให้หน่อย 84.2')).toEqual({
      kind: 'weight',
      weightKg: 84.2,
    });
  });

  it('accepts valid decimal within range', () => {
    expect(parseWeightInput('น้ำหนัก 20')).toEqual({
      kind: 'weight',
      weightKg: 20,
    });
    expect(parseWeightInput('น้ำหนัก 300')).toEqual({
      kind: 'weight',
      weightKg: 300,
    });
  });

  it('rejects out-of-range values', () => {
    expect(parseWeightInput('น้ำหนัก 19.9')).toEqual({
      kind: 'invalid',
      reason: 'out_of_range',
    });
    expect(parseWeightInput('น้ำหนัก 300.1')).toEqual({
      kind: 'invalid',
      reason: 'out_of_range',
    });
  });

  it('ignores bare numbers and food text', () => {
    expect(parseWeightInput('84.2')).toEqual({ kind: 'none' });
    expect(parseWeightInput('ข้าวกะเพราไก่')).toEqual({ kind: 'none' });
  });

  it('marks weight-domain text so it will not go to food AI', () => {
    expect(isWeightDomainText('น้ำหนักของฉันเท่าไร')).toBe(true);
    expect(isWeightDomainText('ข้าวกะเพราไก่')).toBe(false);
  });
});

describe('detectWeightQuestionIntent', () => {
  it('detects factual weight questions', () => {
    expect(detectWeightQuestionIntent('น้ำหนักเท่าไร')).toBe('latest');
    expect(detectWeightQuestionIntent('น้ำหนักล่าสุด')).toBe('latest');
    expect(detectWeightQuestionIntent('น้ำหนักของฉันตอนนี้เท่าไร')).toBe(
      'latest',
    );
    expect(detectWeightQuestionIntent('ตอนนี้หนักเท่าไร')).toBe('latest');
    expect(detectWeightQuestionIntent('น้ำหนักช่วงนี้เป็นยังไง')).toBe('trend');
    expect(detectWeightQuestionIntent('ลดไปเท่าไรแล้ว')).toBe('progress');
  });
});
