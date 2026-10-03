import { normalizeFoodKey } from './thai-food-key';
import { parseThaiFoodCsv } from './thai-food-import';

/** Subset of an Open Food Facts product as written by tools/off-extract-thailand.mjs. */
export type OffProduct = {
  code?: string | null;
  product_name?: string | null;
  product_name_th?: string | null;
  brands?: string | null;
  quantity?: string | null;
  nutriments?: Record<string, unknown> | null;
};

export type SkipReason =
  | 'no_name'
  | 'no_pack_weight'
  | 'incomplete_nutrition'
  | 'ambiguous_name'
  | 'failed_validation';

export type ConvertedRow = {
  nameTh: string;
  nameEn: string | null;
  aliases: string[];
  servingDesc: string;
  servingGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sourceRef: string;
};

export const OFF_SOURCE = 'Open Food Facts';
export const OFF_LICENSE =
  'ODbL 1.0, © Open Food Facts contributors (attribution required)';

const MAX_PACK_GRAMS = 3000;
const SAME_NUTRITION_TOLERANCE = 0.05;

export const CSV_HEADER = [
  'name_th',
  'name_en',
  'aliases',
  'serving_unit',
  'serving_desc',
  'serving_grams',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'source',
  'source_ref',
  'license',
];

/** "72 g", "1.5 kg", "72 กรัม" → grams. Anything else (ml, "2 x 36 g", …) → null. */
export function parsePackGrams(
  quantity: string | null | undefined,
): number | null {
  const match = (quantity ?? '')
    .trim()
    .match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|กก\.?|กิโลกรัม|กรัม)$/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1].replace(',', '.'));
  const isKg = /^(kg|กก\.?|กิโลกรัม)$/i.test(match[2]);
  const grams = isKg ? value * 1000 : value;
  return Number.isFinite(grams) && grams > 0 && grams <= MAX_PACK_GRAMS
    ? grams
    : null;
}

function per100g(
  nutriments: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = nutriments?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function toRow(product: OffProduct): ConvertedRow | SkipReason {
  const nameTh = (product.product_name_th ?? '').trim();
  const nameRaw = (product.product_name ?? '').trim();
  const name = nameTh || nameRaw;
  if (!name) {
    return 'no_name';
  }

  const grams = parsePackGrams(product.quantity);
  if (grams === null) {
    return 'no_pack_weight';
  }

  const kcal = per100g(product.nutriments, 'energy-kcal_100g');
  const protein = per100g(product.nutriments, 'proteins_100g');
  const carbs = per100g(product.nutriments, 'carbohydrates_100g');
  const fat = per100g(product.nutriments, 'fat_100g');
  // A missing value is unknown, not zero — never fill it in.
  if (kcal === null || protein === null || carbs === null || fat === null) {
    return 'incomplete_nutrition';
  }

  const scale = grams / 100;
  const brand = (product.brands ?? '').split(',')[0].trim();
  const aliases =
    brand && !normalizeFoodKey(name).includes(normalizeFoodKey(brand))
      ? [`${brand} ${name}`]
      : [];

  return {
    nameTh: name,
    nameEn: nameTh && nameRaw && nameRaw !== nameTh ? nameRaw : null,
    aliases,
    servingDesc: `1 ซอง (${grams} g)`,
    servingGrams: grams,
    calories: round1(kcal * scale),
    proteinG: round1(protein * scale),
    carbsG: round1(carbs * scale),
    fatG: round1(fat * scale),
    sourceRef: (product.code ?? '').trim(),
  };
}

function sameNutrition(a: ConvertedRow, b: ConvertedRow): boolean {
  const close = (x: number, y: number): boolean =>
    Math.abs(x - y) <= Math.max(1, Math.abs(x) * SAME_NUTRITION_TOLERANCE);
  return (
    a.servingGrams === b.servingGrams &&
    close(a.calories, b.calories) &&
    close(a.proteinG, b.proteinG) &&
    close(a.carbsG, b.carbsG) &&
    close(a.fatG, b.fatG)
  );
}

export function convertOffProducts(products: OffProduct[]): {
  rows: ConvertedRow[];
  skipped: Record<SkipReason, number>;
} {
  const skipped: Record<SkipReason, number> = {
    no_name: 0,
    no_pack_weight: 0,
    incomplete_nutrition: 0,
    ambiguous_name: 0,
    failed_validation: 0,
  };

  const groups = new Map<string, ConvertedRow[]>();
  for (const product of products) {
    const row = toRow(product);
    if (typeof row === 'string') {
      skipped[row] += 1;
      continue;
    }
    const key = normalizeFoodKey(row.nameTh);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const rows: ConvertedRow[] = [];
  for (const group of groups.values()) {
    // Same name + same nutrition = the same product listed twice (keep one).
    // Same name with different numbers: which one the user means is unknown.
    if (group.every((row) => sameNutrition(row, group[0]))) {
      rows.push(group[0]);
    } else {
      skipped.ambiguous_name += group.length;
    }
  }
  return { rows, skipped };
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: ConvertedRow[]): string {
  const lines = rows.map((row) =>
    [
      row.nameTh,
      row.nameEn,
      row.aliases.join('|'),
      'item',
      row.servingDesc,
      row.servingGrams,
      row.calories,
      row.proteinG,
      row.carbsG,
      row.fatG,
      OFF_SOURCE,
      row.sourceRef || null,
      OFF_LICENSE,
    ]
      .map(csvCell)
      .join(','),
  );
  return [CSV_HEADER.join(','), ...lines].join('\n') + '\n';
}

/**
 * Converts products to an import CSV that is guaranteed to pass the importer's
 * own validation: rows it would reject are dropped and counted instead.
 */
export function buildImportCsv(products: OffProduct[]): {
  csv: string;
  kept: number;
  skipped: Record<SkipReason, number>;
  rejected: Array<{ name: string; message: string }>;
} {
  const converted = convertOffProducts(products);
  let rows = converted.rows;
  const skipped = converted.skipped;
  const rejected: Array<{ name: string; message: string }> = [];

  for (let pass = 0; pass < 10; pass += 1) {
    const { issues } = parseThaiFoodCsv(rowsToCsv(rows));
    if (issues.length === 0) {
      break;
    }
    // Line N of the CSV is rows[N - 2]; line 1 is the header.
    const bad = new Set<number>();
    for (const issue of issues) {
      const row = rows[issue.line - 2];
      if (row) {
        bad.add(issue.line - 2);
        rejected.push({ name: row.nameTh, message: issue.message });
      } else {
        // Whole-file problem (should not happen with our own header).
        throw new Error(`import validation failed: ${issue.message}`);
      }
    }
    skipped.failed_validation += bad.size;
    rows = rows.filter((_, index) => !bad.has(index));
  }

  return { csv: rowsToCsv(rows), kept: rows.length, skipped, rejected };
}
