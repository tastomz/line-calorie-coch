import { parseCsv, parseThaiFoodCsv } from './thai-food-import';

const HEADER =
  'name_th,name_en,aliases,serving_unit,serving_desc,serving_grams,calories,protein_g,carbs_g,fat_g,source,source_ref,license';

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n');
}

const OK_ROW =
  'ข้าวทดสอบ,Test Rice,ข้าวทดสอบสอง|test rice,จาน,"1 จาน, ประมาณ 300 g",300,600,30,70,20,TEST DATASET,T-1,test fixture only';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,"b,1","c ""q"""\r\n"x\ny",2,3\r\n');
    expect(rows).toEqual([
      ['a', 'b,1', 'c "q"'],
      ['x\ny', '2', '3'],
    ]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('parseThaiFoodCsv', () => {
  it('accepts a valid row and builds normalized, de-duplicated keys', () => {
    const { rows, issues } = parseThaiFoodCsv(csv(OK_ROW));

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nameTh: 'ข้าวทดสอบ',
      nameEn: 'Test Rice',
      servingUnit: 'plate',
      servingDesc: '1 จาน, ประมาณ 300 g',
      servingGrams: 300,
      calories: 600,
      proteinG: 30,
      carbsG: 70,
      fatG: 20,
      source: 'TEST DATASET',
      sourceRef: 'T-1',
      license: 'test fixture only',
    });
    // name_en "Test Rice" and alias "test rice" collapse to one key
    expect(rows[0].keys).toEqual(['ข้าวทดสอบ', 'testrice', 'ข้าวทดสอบสอง']);
  });

  it('works with optional columns omitted', () => {
    const minimal =
      'name_th,serving_unit,calories,protein_g,carbs_g,fat_g,source,license\n' +
      'ข้าวทดสอบ,plate,600,30,70,20,TEST,fixture';
    const { rows, issues } = parseThaiFoodCsv(minimal);
    expect(issues).toEqual([]);
    expect(rows[0].nameEn).toBeNull();
    expect(rows[0].servingGrams).toBeNull();
  });

  it('rejects a file with missing required columns', () => {
    const result = parseThaiFoodCsv('name_th,calories\nx,1');
    expect(result.rows).toEqual([]);
    expect(result.issues[0].message).toContain('missing columns');
    expect(result.issues[0].message).toContain('license');
  });

  it('rejects an empty file', () => {
    expect(parseThaiFoodCsv('').issues[0].message).toContain('empty');
  });

  it.each([
    ['missing license', OK_ROW.replace('test fixture only', ''), 'license'],
    ['missing source', OK_ROW.replace('TEST DATASET', ''), 'source'],
    ['unknown unit', OK_ROW.replace(',จาน,', ',กิโล?,'), 'serving_unit'],
    [
      'non-numeric macro',
      OK_ROW.replace(',30,70,20,', ',abc,70,20,'),
      'numbers',
    ],
    [
      'zero calories',
      OK_ROW.replace(',600,30,70,20,', ',0,30,70,20,'),
      'calories must',
    ],
    [
      'absurd calories',
      OK_ROW.replace(',600,30,70,20,', ',90000,30,70,20,'),
      'calories must',
    ],
    ['negative macro', OK_ROW.replace(',30,70,20,', ',-1,70,20,'), 'protein_g'],
    [
      'bad serving_grams',
      OK_ROW.replace(',300,600,', ',-5,600,'),
      'serving_grams',
    ],
  ])('rejects %s', (_label, row, expected) => {
    const { rows, issues } = parseThaiFoodCsv(csv(row));
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(2);
    expect(issues[0].message).toContain(expected);
  });

  it('flags macros that do not add up to the calories (swapped columns)', () => {
    const swapped = OK_ROW.replace(',600,30,70,20,', ',600,1,1,1,');
    const { issues } = parseThaiFoodCsv(csv(swapped));
    expect(issues[0].message).toContain('do not match calories');
  });

  it('accepts Thai unit words', () => {
    const { rows } = parseThaiFoodCsv(csv(OK_ROW.replace(',จาน,', ',ชาม,')));
    expect(rows[0].servingUnit).toBe('bowl');
  });

  it('rejects a duplicate item within the same source', () => {
    const { rows, issues } = parseThaiFoodCsv(
      csv(OK_ROW, OK_ROW.replace('ข้าวทดสอบสอง|test rice', 'อื่น')),
    );
    expect(rows).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('duplicate item');
  });

  it('rejects a lookup key shared by two different items', () => {
    const other = OK_ROW.replace('ข้าวทดสอบ,Test Rice,', 'ข้าวอื่น,,'); // alias test rice still present
    const { rows, issues } = parseThaiFoodCsv(csv(OK_ROW, other));
    expect(rows).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(3);
    expect(issues[0].message).toContain('already used by line 2');
  });

  it('allows the same dish name from two different sources only when keys differ', () => {
    const second = OK_ROW.replace('TEST DATASET', 'OTHER')
      .replace('ข้าวทดสอบสอง|test rice', 'ข้าวทดสอบสาม')
      .replace('Test Rice', 'Other Rice');
    // same name_th → same key → must conflict, never silently merge
    const { issues } = parseThaiFoodCsv(csv(OK_ROW, second));
    expect(issues.some((i) => i.message.includes('already used'))).toBe(true);
  });
});
