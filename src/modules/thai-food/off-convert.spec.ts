import {
  OFF_LICENSE,
  OFF_SOURCE,
  OffProduct,
  buildImportCsv,
  convertOffProducts,
  parsePackGrams,
} from './off-convert';
import { parseThaiFoodCsv } from './thai-food-import';

function product(overrides: Partial<OffProduct> = {}): OffProduct {
  return {
    code: '0000000000001',
    product_name: 'FAKE อกไก่ย่าง',
    brands: 'CP Delight,7-Eleven',
    quantity: '72 g',
    nutriments: {
      'energy-kcal_100g': 125,
      proteins_100g: 23.6,
      carbohydrates_100g: 0.5,
      fat_100g: 2.8,
    },
    ...overrides,
  };
}

describe('parsePackGrams', () => {
  it.each([
    ['72 g', 72],
    ['72g', 72],
    ['1.5 kg', 1500],
    ['1,5 kg', 1500],
    ['72 กรัม', 72],
    ['0.2 กก.', 200],
  ])('reads %s', (text, grams) => {
    expect(parsePackGrams(text)).toBe(grams);
  });

  it.each([
    '',
    null,
    undefined,
    '330 ml',
    '2 x 36 g',
    '72 g (2 pieces)',
    '0 g',
    '5 kg',
    'abc',
  ])('declines %p', (text) => {
    expect(parsePackGrams(text)).toBeNull();
  });
});

describe('convertOffProducts', () => {
  it('scales per-100 g values to the whole pack and builds the aliases', () => {
    const { rows, skipped } = convertOffProducts([product()]);

    expect(Object.values(skipped).every((n) => n === 0)).toBe(true);
    expect(rows).toEqual([
      {
        nameTh: 'FAKE อกไก่ย่าง',
        nameEn: null,
        aliases: ['CP Delight FAKE อกไก่ย่าง'],
        servingDesc: '1 ซอง (72 g)',
        servingGrams: 72,
        calories: 90,
        proteinG: 17,
        carbsG: 0.4,
        fatG: 2,
        sourceRef: '0000000000001',
      },
    ]);
  });

  it('prefers the Thai name and keeps the other as English name', () => {
    const { rows } = convertOffProducts([
      product({
        product_name_th: 'อกไก่นุ่มย่างถ่าน',
        product_name: 'Grilled',
      }),
    ]);
    expect(rows[0].nameTh).toBe('อกไก่นุ่มย่างถ่าน');
    expect(rows[0].nameEn).toBe('Grilled');
  });

  it('does not add a brand alias when the brand is already in the name', () => {
    const { rows } = convertOffProducts([
      product({ product_name: 'ซีพี ดีไลท์ อกไก่', brands: 'ซีพี ดีไลท์' }),
    ]);
    expect(rows[0].aliases).toEqual([]);
  });

  it.each([
    ['no_name', { product_name: '', product_name_th: '' }],
    ['no_pack_weight', { quantity: '330 ml' }],
    ['no_pack_weight', { quantity: null }],
    [
      'incomplete_nutrition',
      { nutriments: { 'energy-kcal_100g': 125, proteins_100g: 20 } },
    ],
    ['incomplete_nutrition', { nutriments: null }],
  ] as const)('skips with reason %s', (reason, overrides) => {
    const { rows, skipped } = convertOffProducts([product(overrides)]);
    expect(rows).toEqual([]);
    expect(skipped[reason]).toBe(1);
  });

  it('never treats a missing macro as zero', () => {
    const { rows, skipped } = convertOffProducts([
      product({
        nutriments: {
          'energy-kcal_100g': 125,
          proteins_100g: 23.6,
          fat_100g: 2.8,
        },
      }),
    ]);
    expect(rows).toEqual([]);
    expect(skipped.incomplete_nutrition).toBe(1);
  });

  it('keeps one row for the same product listed twice', () => {
    const { rows, skipped } = convertOffProducts([
      product({ code: '1' }),
      product({ code: '2' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped.ambiguous_name).toBe(0);
  });

  it('drops every row of a name whose variants disagree', () => {
    const { rows, skipped } = convertOffProducts([
      product({ code: '1' }),
      product({
        code: '2',
        nutriments: {
          'energy-kcal_100g': 300,
          proteins_100g: 10,
          carbohydrates_100g: 40,
          fat_100g: 8,
        },
      }),
    ]);
    expect(rows).toEqual([]);
    expect(skipped.ambiguous_name).toBe(2);
  });
});

describe('buildImportCsv', () => {
  it('produces a CSV the importer accepts, with source and licence', () => {
    const { csv, kept } = buildImportCsv([
      product(),
      product({ code: '2', product_name: 'FAKE ข้าวกล่อง, พิเศษ "ใหญ่"' }),
    ]);

    expect(kept).toBe(2);
    const { rows, issues } = parseThaiFoodCsv(csv);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      servingUnit: 'item',
      source: OFF_SOURCE,
      license: OFF_LICENSE,
      sourceRef: '0000000000001',
      servingGrams: 72,
      calories: 90,
    });
    expect(rows[1].nameTh).toBe('FAKE ข้าวกล่อง, พิเศษ "ใหญ่"');
  });

  it('drops rows the importer would reject instead of failing the file', () => {
    // 600 kcal per 100 g but almost no macros → fails the energy check
    const inconsistent = product({
      code: '9',
      product_name: 'FAKE ไม่สมเหตุสมผล',
      nutriments: {
        'energy-kcal_100g': 600,
        proteins_100g: 1,
        carbohydrates_100g: 1,
        fat_100g: 1,
      },
    });
    const { csv, kept, skipped, rejected } = buildImportCsv([
      product(),
      inconsistent,
    ]);

    expect(kept).toBe(1);
    expect(skipped.failed_validation).toBe(1);
    expect(rejected[0].name).toBe('FAKE ไม่สมเหตุสมผล');
    expect(rejected[0].message).toContain('do not match calories');
    expect(parseThaiFoodCsv(csv).issues).toEqual([]);
  });

  it('drops a later row whose alias collides with an earlier one', () => {
    const { kept, skipped } = buildImportCsv([
      product({ code: '1', product_name: 'FAKE A', brands: 'Brand' }),
      // alias "Brand FAKE A" would equal this other product's own name key
      product({ code: '2', product_name: 'Brand FAKE A', brands: 'Other' }),
    ]);
    expect(kept).toBe(1);
    expect(skipped.failed_validation).toBe(1);
  });

  it('keeps nothing when nothing is usable', () => {
    const { csv, kept } = buildImportCsv([product({ quantity: null })]);
    expect(kept).toBe(0);
    expect(parseThaiFoodCsv(csv).rows).toEqual([]);
  });
});
