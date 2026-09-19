import { parseFoodEdit } from './food-edit';

describe('parseFoodEdit', () => {
  it('parses calorie overrides', () => {
    expect(parseFoodEdit('แคลน่าจะ 500')).toEqual({
      kind: 'calorie_override',
      calories: 500,
    });
    expect(parseFoodEdit('500 kcal')).toEqual({
      kind: 'calorie_override',
      calories: 500,
    });
  });

  it('detects composition corrections', () => {
    expect(parseFoodEdit('ไม่ใช่ไก่ เป็นหมู')).toEqual({
      kind: 'composition',
      instruction: 'ไม่ใช่ไก่ เป็นหมู',
    });
  });

  it('asks for clarification on vague edits', () => {
    expect(parseFoodEdit('แก้ให้ถูก')).toEqual({ kind: 'ambiguous' });
  });

  it('returns none for unrelated text', () => {
    expect(parseFoodEdit('ข้าวกะเพรา')).toEqual({ kind: 'none' });
  });
});
