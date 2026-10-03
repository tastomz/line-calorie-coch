import { normalizeFoodKey, parseServingRequest } from './thai-food-key';

describe('normalizeFoodKey', () => {
  it('ignores spacing, punctuation, emoji and case', () => {
    expect(normalizeFoodKey(' ข้าว มัน-ไก่ 🍗 ')).toBe('ข้าวมันไก่');
    expect(normalizeFoodKey('Pad Thai!')).toBe('padthai');
  });

  it('keeps Thai combining marks so different dishes stay different', () => {
    expect(normalizeFoodKey('ผัดไทย')).not.toBe(normalizeFoodKey('ผัดไท'));
    expect(normalizeFoodKey('ก๋วยเตี๋ยว')).toContain('๋');
  });
});

describe('parseServingRequest', () => {
  it.each([
    ['ข้าวมันไก่', 'ข้าวมันไก่', 1, null],
    ['ข้าวมันไก่ 2 จาน', 'ข้าวมันไก่', 2, 'plate'],
    ['ข้าวมันไก่2จาน', 'ข้าวมันไก่', 2, 'plate'],
    ['ข้าวมันไก่ครึ่งจาน', 'ข้าวมันไก่', 0.5, 'plate'],
    ['ข้าวมันไก่หนึ่งจาน', 'ข้าวมันไก่', 1, 'plate'],
    ['ก๋วยเตี๋ยว 1 ชาม', 'ก๋วยเตี๋ยว', 1, 'bowl'],
    ['ส้มตำ 1.5 ถ้วย', 'ส้มตำ', 1.5, 'cup'],
    ['ชาเย็น 1 แก้ว', 'ชาเย็น', 1, 'cup'],
    ['กินข้าวมันไก่ 2 จาน', 'ข้าวมันไก่', 2, 'plate'],
    ['ทานส้มตำ', 'ส้มตำ', 1, null],
    ['2 จาน ข้าวมันไก่', 'ข้าวมันไก่', 2, 'plate'],
    ['ครึ่งชาม ก๋วยเตี๋ยว', 'ก๋วยเตี๋ยว', 0.5, 'bowl'],
  ])('parses %s', (text, name, quantity, unit) => {
    expect(parseServingRequest(text)).toEqual({ name, quantity, unit });
  });

  it.each([
    '',
    '   ',
    'ข้าวมันไก่ 2', // bare number is ambiguous → AI
    'ข้าวมันไก่ 20 จาน', // implausible amount
    'ข้าวมันไก่ 0 จาน',
    'โปรตีนเชค 30g',
  ])('declines to guess: %j', (text) => {
    expect(parseServingRequest(text)).toBeNull();
  });
});
