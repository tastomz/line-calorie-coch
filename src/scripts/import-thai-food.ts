import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { parseThaiFoodCsv } from '../modules/thai-food/thai-food-import';
import {
  ThaiFoodKeyConflictError,
  importThaiFoodRows,
} from '../modules/thai-food/thai-food-import.db';

const USAGE = `Usage: npm run import:thai-food -- --file <data.csv> [--dry-run]

Imports a LICENSED Thai food nutrition CSV (see docs/THAI_FOOD_DB.md).
Validates the whole file first; any problem aborts with nothing written.`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf('--file');
  const file = fileFlag >= 0 ? args[fileFlag + 1] : undefined;
  const dryRun = args.includes('--dry-run');
  if (!file) {
    console.error(USAGE);
    return 2;
  }

  const { rows, issues } = parseThaiFoodCsv(readFileSync(file, 'utf8'));
  if (issues.length > 0) {
    console.error(
      `Rejected: ${issues.length} problem(s). Nothing was written.`,
    );
    for (const issue of issues.slice(0, 50)) {
      console.error(`  line ${issue.line}: ${issue.message}`);
    }
    if (issues.length > 50) {
      console.error(`  … and ${issues.length - 50} more`);
    }
    return 1;
  }

  const keyCount = rows.reduce((sum, row) => sum + row.keys.length, 0);
  console.log(`Validated ${rows.length} items, ${keyCount} lookup keys.`);
  if (dryRun) {
    console.log('Dry run: nothing written.');
    return 0;
  }

  const prisma = new PrismaClient();
  try {
    const result = await importThaiFoodRows(prisma, rows);
    console.log(`Imported ${result.items} items, ${result.keys} keys.`);
    return 0;
  } catch (error) {
    if (error instanceof ThaiFoodKeyConflictError) {
      console.error(`Rejected: ${error.message}. Nothing was written.`);
      for (const conflict of error.conflicts.slice(0, 50)) {
        console.error(`  ${conflict}`);
      }
      return 1;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'import failed');
    process.exit(1);
  });
