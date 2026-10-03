#!/usr/bin/env node
/**
 * Reduce the Open Food Facts JSONL dump to Thai 7-Eleven / CP / Ezygo products.
 *
 *   node tools/off-extract-thailand.mjs <openfoodfacts-products.jsonl.gz> [out.jsonl] [--all-thailand]
 *
 * Input:  the OFF "JSONL" export (one product JSON per line, gzip), from
 *         https://world.openfoodfacts.org/data  — NOT the MongoDB dump.
 * Output: one compact JSON per line with only the fields we need.
 *
 * Data licence: ODbL 1.0, (c) Open Food Facts contributors. Keep the
 * attribution when the data is used (see docs/THAI_FOOD_DB.md).
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const allThailand = process.argv.includes('--all-thailand');
const [input, output = 'off-thailand.jsonl'] = args;

if (!input) {
  console.error(
    'Usage: node tools/off-extract-thailand.mjs <products.jsonl.gz> [out.jsonl] [--all-thailand]',
  );
  process.exit(2);
}

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

function isThai(product) {
  const tags = Array.isArray(product.countries_tags)
    ? product.countries_tags
    : [];
  return tags.includes('en:thailand');
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
    product_name: product.product_name ?? null,
    product_name_th: product.product_name_th ?? null,
    brands: product.brands ?? null,
    quantity: product.quantity ?? null,
    serving_size: product.serving_size ?? null,
    serving_quantity: product.serving_quantity ?? null,
    nutriments,
  };
}

const out = createWriteStream(output);
const lines = createInterface({
  input: createReadStream(input).pipe(createGunzip()),
  crlfDelay: Infinity,
});

let scanned = 0;
let badLines = 0;
let thai = 0;
let kept = 0;
const sampleKeys = new Set();

for await (const line of lines) {
  scanned += 1;
  if (scanned % 500_000 === 0) {
    console.error(`scanned ${scanned} lines, kept ${kept}`);
  }
  if (!line.trim()) continue;

  let product;
  try {
    product = JSON.parse(line);
  } catch {
    badLines += 1;
    continue;
  }
  if (scanned <= 3) {
    Object.keys(product).forEach((k) => sampleKeys.add(k));
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
    `No Thai products found. Is this the JSONL export? Fields seen on the first lines: ${[...sampleKeys].slice(0, 25).join(', ')}`,
  );
  process.exitCode = 1;
}
