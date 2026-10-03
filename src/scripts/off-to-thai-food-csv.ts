import { readFileSync, writeFileSync } from 'node:fs';
import { OffProduct, buildImportCsv } from '../modules/thai-food/off-convert';

const USAGE = `Usage: npm run convert:off -- --file off-thailand.jsonl [--out thai-food-off.csv]

Converts the output of tools/off-extract-thailand.mjs into the CSV accepted by
npm run import:thai-food. Rows with missing/ambiguous data are skipped and counted.`;

function main(): number {
  const args = process.argv.slice(2);
  const valueOf = (flag: string): string | undefined => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const file = valueOf('--file');
  const out = valueOf('--out') ?? 'thai-food-off.csv';
  if (!file) {
    console.error(USAGE);
    return 2;
  }

  const products: OffProduct[] = [];
  let unparseable = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed && typeof parsed === 'object') {
        products.push(parsed);
      } else {
        unparseable += 1;
      }
    } catch {
      unparseable += 1;
    }
  }

  const result = buildImportCsv(products);
  console.log(
    `Read ${products.length} products (${unparseable} unreadable lines).`,
  );
  console.log(`Kept ${result.kept}. Skipped:`);
  for (const [reason, count] of Object.entries(result.skipped)) {
    console.log(`  ${reason}: ${count}`);
  }
  for (const item of result.rejected.slice(0, 20)) {
    console.log(`  rejected "${item.name}": ${item.message}`);
  }
  if (result.rejected.length > 20) {
    console.log(`  … and ${result.rejected.length - 20} more rejected`);
  }

  if (result.kept === 0) {
    console.error('Nothing usable to import; no file written.');
    return 1;
  }
  writeFileSync(out, result.csv, 'utf8');
  console.log(
    `Wrote ${out}. Next: npm run import:thai-food -- --file ${out} --dry-run`,
  );
  return 0;
}

process.exit(main());
