import {
  FOOD_QUANTITY_UNITS,
  FoodQuantityUnit,
} from '../food/food-analysis.types';
import { normalizeQuantityUnit } from '../food/food-analysis.validator';
import { normalizeFoodKey } from './thai-food-key';

export type ThaiFoodRow = {
  nameTh: string;
  nameEn: string | null;
  servingUnit: FoodQuantityUnit;
  servingDesc: string | null;
  servingGrams: number | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: string;
  sourceRef: string | null;
  license: string;
  /** Normalized lookup keys: Thai name, English name, aliases. */
  keys: string[];
};

export type ImportIssue = { line: number; message: string };

export const REQUIRED_COLUMNS = [
  'name_th',
  'serving_unit',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'source',
  'license',
] as const;

const LIMITS = {
  nameLength: 120,
  caloriesPerServing: 3000,
  macroGramsPerServing: 300,
  servingGrams: 3000,
} as const;

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function parseNumber(raw: string | undefined): number | null {
  const value = (raw ?? '').trim();
  if (!value) {
    return null;
  }
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function resolveUnit(raw: string): FoodQuantityUnit | null {
  const unit = normalizeQuantityUnit(raw);
  return (FOOD_QUANTITY_UNITS as readonly string[]).includes(unit)
    ? (unit as FoodQuantityUnit)
    : null;
}

function parseRow(
  get: (column: string) => string,
  line: number,
  issues: ImportIssue[],
): ThaiFoodRow | null {
  const fail = (message: string): null => {
    issues.push({ line, message });
    return null;
  };

  const nameTh = get('name_th').trim();
  if (!nameTh || nameTh.length > LIMITS.nameLength) {
    return fail('name_th is required (max 120 chars)');
  }
  const source = get('source').trim();
  const license = get('license').trim();
  if (!source) {
    return fail('source is required (dataset name shown to users)');
  }
  if (!license) {
    return fail('license is required (record the permission/licence terms)');
  }

  const servingUnit = resolveUnit(get('serving_unit'));
  if (!servingUnit) {
    return fail(
      `serving_unit must be one of ${FOOD_QUANTITY_UNITS.join('|')} (or จาน/ชาม/ถ้วย/…)`,
    );
  }

  const calories = parseNumber(get('calories'));
  const proteinG = parseNumber(get('protein_g'));
  const carbsG = parseNumber(get('carbs_g'));
  const fatG = parseNumber(get('fat_g'));
  if (
    calories === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null
  ) {
    return fail('calories, protein_g, carbs_g, fat_g must all be numbers');
  }
  if (calories <= 0 || calories > LIMITS.caloriesPerServing) {
    return fail(`calories must be in (0, ${LIMITS.caloriesPerServing}]`);
  }
  for (const [label, grams] of [
    ['protein_g', proteinG],
    ['carbs_g', carbsG],
    ['fat_g', fatG],
  ] as const) {
    if (grams < 0 || grams > LIMITS.macroGramsPerServing) {
      return fail(`${label} must be in [0, ${LIMITS.macroGramsPerServing}]`);
    }
  }

  // Atwater check catches swapped/shifted columns without rejecting real
  // foods (fibre, alcohol and rounding keep real data within 40%).
  const macroEnergy = 4 * proteinG + 4 * carbsG + 9 * fatG;
  if (Math.abs(macroEnergy - calories) > Math.max(50, calories * 0.4)) {
    return fail(
      `macros (${Math.round(macroEnergy)} kcal) do not match calories (${calories}) — check for swapped columns`,
    );
  }

  const servingGramsRaw = get('serving_grams').trim();
  const servingGrams = parseNumber(servingGramsRaw);
  if (
    servingGramsRaw &&
    (servingGrams === null ||
      servingGrams <= 0 ||
      servingGrams > LIMITS.servingGrams)
  ) {
    return fail(`serving_grams must be in (0, ${LIMITS.servingGrams}]`);
  }

  const nameEn = get('name_en').trim() || null;
  const aliases = get('aliases')
    .split('|')
    .map((a) => a.trim())
    .filter(Boolean);
  const keys = [
    ...new Set(
      [nameTh, nameEn ?? '', ...aliases]
        .map(normalizeFoodKey)
        .filter((k) => k.length >= 2),
    ),
  ];

  return {
    nameTh,
    nameEn,
    servingUnit,
    servingDesc: get('serving_desc').trim() || null,
    servingGrams,
    calories,
    proteinG,
    carbsG,
    fatG,
    source,
    sourceRef: get('source_ref').trim() || null,
    license,
    keys,
  };
}

/**
 * Validates a whole file. Callers must treat any issue as "import nothing":
 * partial imports of health data are harder to audit than a rejected file.
 */
export function parseThaiFoodCsv(text: string): {
  rows: ThaiFoodRow[];
  issues: ImportIssue[];
} {
  const issues: ImportIssue[] = [];
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], issues: [{ line: 1, message: 'file is empty' }] };
  }

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [{ line: 1, message: `missing columns: ${missing.join(', ')}` }],
    };
  }

  const rows: ThaiFoodRow[] = [];
  const seenItems = new Map<string, number>();
  const keyOwner = new Map<string, { item: string; line: number }>();

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (column: string): string => {
      const at = header.indexOf(column);
      return at >= 0 ? (cells[at] ?? '') : '';
    };
    const row = parseRow(get, line, issues);
    if (!row) {
      return;
    }

    const itemId = `${row.source}\u0000${row.nameTh}`;
    const firstLine = seenItems.get(itemId);
    if (firstLine !== undefined) {
      issues.push({
        line,
        message: `duplicate item "${row.nameTh}" for source (first on line ${firstLine})`,
      });
      return;
    }
    seenItems.set(itemId, line);

    for (const key of row.keys) {
      const owner = keyOwner.get(key);
      if (owner && owner.item !== itemId) {
        issues.push({
          line,
          message: `lookup key "${key}" already used by line ${owner.line} — aliases must be unique`,
        });
        return;
      }
    }
    for (const key of row.keys) {
      keyOwner.set(key, { item: itemId, line });
    }
    rows.push(row);
  });

  return { rows, issues };
}
