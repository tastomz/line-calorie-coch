import { foodDayCommandText, parseFoodDayCommand } from './food-day';

describe('parseFoodDayCommand', () => {
  it.each([
    ['เมื่อวาน', 1],
    ['เมื่อวานนี้', 1],
    ['ดูเมื่อวาน', 1],
    ['สรุปเมื่อวาน', 1],
    ['เมื่อวาน กินอะไรไปบ้าง', 1],
    ['เมื่อวานกินอะไร', 1],
    ['เมื่อวานซืน', 2],
    ['3 วันก่อน', 3],
    ['5วันที่แล้ว', 5],
  ])('views a single past day: %s', (text, daysAgo) => {
    expect(parseFoodDayCommand(text)).toEqual({ kind: 'view_day', daysAgo });
  });

  it('routes the foodday postback payload', () => {
    expect(parseFoodDayCommand(foodDayCommandText(4))).toEqual({
      kind: 'view_day',
      daysAgo: 4,
    });
    expect(parseFoodDayCommand('foodday:0')).toEqual({
      kind: 'view_day',
      daysAgo: 0,
    });
    expect(parseFoodDayCommand('foodday:99')).toBeNull();
  });

  it.each([
    ['ย้อนหลัง', 7],
    ['ประวัติย้อนหลัง', 7],
    ['ดูย้อนหลัง', 7],
    ['ย้อนหลัง 3 วัน', 3],
    ['ย้อนหลัง 30', 14],
    ['7 วันที่ผ่านมา', 7],
  ])('views a range: %s', (text, days) => {
    expect(parseFoodDayCommand(text)).toEqual({ kind: 'view_range', days });
  });

  it('treats a range of 1 day as yesterday', () => {
    expect(parseFoodDayCommand('ย้อนหลัง 1 วัน')).toEqual({
      kind: 'view_day',
      daysAgo: 1,
    });
  });

  it.each([
    ['เมื่อวาน ข้าวมันไก่', 'ข้าวมันไก่'],
    ['เมื่อวานกินข้าวมันไก่ 1 จาน', 'ข้าวมันไก่ 1 จาน'],
    ['เมื่อวานนี้ ทานส้มตำ', 'ส้มตำ'],
    ['เมื่อวานได้กินก๋วยเตี๋ยวเรือ', 'ก๋วยเตี๋ยวเรือ'],
  ])('logs food for yesterday: %s', (text, food) => {
    expect(parseFoodDayCommand(text)).toEqual({
      kind: 'log_past',
      daysAgo: 1,
      text: food,
    });
  });

  it.each([
    'วันนี้',
    'ประวัติ',
    'ข้าวมันไก่',
    'กินข้าวมันไก่เมื่อวาน',
    'เมื่อวานน้ำหนัก 84.2',
    'เมื่อวานโปรตีนเหลือเท่าไร',
    'เมื่อวานนอน 00:30 ตื่น 07:30',
    'เมื่อวานออกกำลังกาย วิ่ง 30',
    'เมื่อวานซืนกินข้าว',
    '',
  ])('leaves other text untouched: %s', (text) => {
    expect(parseFoodDayCommand(text)).toBeNull();
  });
});
