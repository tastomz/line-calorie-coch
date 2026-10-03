#!/usr/bin/env node
/**
 * Reduce an Open Food Facts product export to Thai 7-Eleven / CP / Ezygo products.
 *
 *   node tools/off-extract-thailand.mjs <export> [out.jsonl] [--all-thailand]
 *
 * <export> is one of (chosen by file name):
 *   - en.openfoodfacts.org.products.csv[.gz]   tab-separated CSV export
 *   - openfoodfacts-products.jsonl[.gz]        JSONL export (one product per line)
 * NOT the MongoDB dump.
 *
 * Output: one compact JSON per line with only the fields we need.
 *
 * Data licence: ODbL 1.0, (c) Open Food Facts contributors. Keep the
 * attribution when the data is used (see docs/THAI_FOOD_DB.md).
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const allThailand = flags.includes('--all-thailand');
const [input, output = 'off-thailand.jsonl'] = args;

if (!input) {
  console.error(
    'Usage: node tools/off-extract-thailand.mjs <export.csv|export.jsonl[.gz]> [out.jsonl] [--all-thailand]',
  );
  process.exit(2);
}

const isTsv = /\.(csv|tsv)(\.gz)?$/i.test(input);
const BRAND_RE = /7[\s-]?(?:11|eleven)|\bcp\b|cp[\s-]?delight|ezygo|เซเว่น|ซีพี/i;
const NUTRIENT_KEYS = [
  'energy-kcal_100g',
  'energy-kcal_serving',
  'proteins_100g',
  'proteins_serving',
  'carbohydrates_100g',
  'carbohydrates_serving',
  'fat_100g',
  'fat_serving',
];
const TEXT_COLUMNS = [
  'code',
  'product_name',
  'product_name_th',
  'brands',
  'brands_tags',
  'countries_tags',
  'countries_en',
  'countries',
  'quantity',
  'serving_size',
  'serving_quantity',
];

function splitList(value) {
  return value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

function isThai(product) {
  const tags = Array.isArray(product.countries_tags)
    ? product.countries_tags
    : [];
  if (tags.includes('en:thailand')) return true;
  // CSV fallback when the tags column is absent or empty.
  return /\bthailand\b/i.test(
    `${product.countries_en ?? ''},${product.countries ?? ''}`,
  );
}

function isTargetBrand(product) {
  const brands = [
    product.brands ?? '',
    ...(Array.isArray(product.brands_tags) ? product.brands_tags : []),
  ].join(' ');
  return BRAND_RE.test(brands);
}

function pick(product) {
  const nutriments = {};
  for (const key of NUTRIENT_KEYS) {
    const value = product.nutriments?.[key];
    if (value !== undefined && value !== null) {
      nutriments[key] = value;
    }
  }
  return {
    code: product.code,
    product_name: product.product_name || null,
    product_name_th: product.product_name_th || null,
    brands: product.brands || null,
    quantity: product.quantity || null,
    serving_size: product.serving_size || null,
    serving_quantity: product.serving_quantity ?? null,
    nutriments,
  };
}

const raw = createReadStream(input);
const source = /\.gz$/i.test(input) ? raw.pipe(createGunzip()) : raw;
const lines = createInterface({ input: source, crlfDelay: Infinity });
const out = createWriteStream(output);

let scanned = 0;
let badLines = 0;
let thai = 0;
let kept = 0;
let header = null; // TSV: column name -> index
const sampleKeys = new Set();

function fail(message) {
  console.error(message);
  out.end();
  process.exit(1);
}

function parseTsvHeader(line) {
  const names = line.replace(/^﻿/, '').split('\t').map((n) => n.trim());
  const index = new Map(names.map((name, i) => [name, i]));
  const hasCountry = ['countries_tags', 'countries_en', 'countries'].some((c) =>
    index.has(c),
  );
  const missing = ['code', 'product_name'].filter((c) => !index.has(c));
  if (!hasCountry) missing.push('countries_tags (or countries_en/countries)');
  if (missing.length > 0) {
    fail(
      `Missing columns: ${missing.join(', ')}.\nColumns found (first 40): ${names.slice(0, 40).join(', ')}`,
    );
  }
  const nutrientsFound = NUTRIENT_KEYS.filter((k) => index.has(k));
  if (nutrientsFound.length === 0) {
    const similar = names.filter((n) => /energy|kcal|protein|fat|carb/i.test(n));
    fail(
      `No nutrient columns found (expected e.g. energy-kcal_100g).\nSimilar columns: ${similar.slice(0, 30).join(', ') || '(none)'}`,
    );
  }
  console.error(
    `Columns OK. Nutrients found: ${nutrientsFound.join(', ')}` +
      (nutrientsFound.length < NUTRIENT_KEYS.length
        ? ` (missing: ${NUTRIENT_KEYS.filter((k) => !index.has(k)).join(', ')})`
        : ''),
  );
  return index;
}

function rowToProduct(cells) {
  const get = (name) => {
    const at = header.get(name);
    return at === undefined ? '' : (cells[at] ?? '').trim();
  };
  const product = {};
  for (const name of TEXT_COLUMNS) {
    product[name] = get(name);
  }
  product.countries_tags = splitList(product.countries_tags);
  product.brands_tags = splitList(product.brands_tags);
  product.serving_quantity = product.serving_quantity
    ? Number(product.serving_quantity)
    : null;
  product.nutriments = {};
  for (const key of NUTRIENT_KEYS) {
    const value = get(key);
    const n = value === '' ? NaN : Number(value);
    if (Number.isFinite(n)) {
      product.nutriments[key] = n;
    }
  }
  return product;
}

for await (const line of lines) {
  scanned += 1;
  if (scanned % 500_000 === 0) {
    console.error(`scanned ${scanned} lines, kept ${kept}`);
  }
  if (!line.trim()) continue;

  let product;
  if (isTsv) {
    if (header === null) {
      header = parseTsvHeader(line);
      continue;
    }
    product = rowToProduct(line.split('\t'));
  } else {
    try {
      product = JSON.parse(line);
    } catch {
      badLines += 1;
      continue;
    }
    if (scanned <= 3) {
      Object.keys(product).forEach((k) => sampleKeys.add(k));
    }
  }

  if (!isThai(product)) continue;
  thai += 1;
  if (!allThailand && !isTargetBrand(product)) continue;
  out.write(`${JSON.stringify(pick(product))}\n`);
  kept += 1;
}

out.end();
console.error(
  `Done. scanned=${scanned} unparseable=${badLines} thai=${thai} kept=${kept} -> ${output}`,
);
if (thai === 0) {
  console.error(
    isTsv
      ? 'No Thai products found. Check the countries columns in this export.'
      : `No Thai products found. Is this the JSONL export? Fields on the first lines: ${[...sampleKeys].slice(0, 25).join(', ')}`,
  );
  process.exitCode = 1;
}
