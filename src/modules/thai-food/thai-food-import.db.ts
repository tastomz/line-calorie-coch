import { PrismaClient } from '@prisma/client';
import { ThaiFoodRow } from './thai-food-import';

export type ImportResult = { items: number; keys: number };

export class ThaiFoodKeyConflictError extends Error {
  constructor(readonly conflicts: string[]) {
    super(`${conflicts.length} lookup key(s) already belong to other items`);
    this.name = 'ThaiFoodKeyConflictError';
  }
}

/**
 * Upserts validated rows (idempotent per source + name_th) in ONE transaction.
 * A key already owned by a different item aborts everything: silently
 * re-pointing a key would change what users get for that dish.
 */
export async function importThaiFoodRows(
  prisma: PrismaClient,
  rows: ThaiFoodRow[],
): Promise<ImportResult> {
  const allKeys = rows.flatMap((row) => row.keys);
  const existing = await prisma.thaiFoodKey.findMany({
    where: { key: { in: allKeys } },
    include: { item: { select: { source: true, nameTh: true } } },
  });

  const incomingOwner = new Map<string, string>();
  for (const row of rows) {
    for (const key of row.keys) {
      incomingOwner.set(key, `${row.source}\u0000${row.nameTh}`);
    }
  }
  const conflicts = existing
    .filter(
      (e) =>
        incomingOwner.get(e.key) !== `${e.item.source}\u0000${e.item.nameTh}`,
    )
    .map((e) => `"${e.key}" is used by "${e.item.nameTh}" (${e.item.source})`);
  if (conflicts.length > 0) {
    throw new ThaiFoodKeyConflictError(conflicts);
  }

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const data = {
          nameEn: row.nameEn,
          servingUnit: row.servingUnit,
          servingDesc: row.servingDesc,
          servingGrams: row.servingGrams,
          calories: row.calories,
          proteinG: row.proteinG,
          carbsG: row.carbsG,
          fatG: row.fatG,
          sourceRef: row.sourceRef,
          license: row.license,
        };
        const item = await tx.thaiFoodItem.upsert({
          where: {
            source_nameTh: { source: row.source, nameTh: row.nameTh },
          },
          create: { nameTh: row.nameTh, source: row.source, ...data },
          update: data,
        });
        await tx.thaiFoodKey.deleteMany({ where: { itemId: item.id } });
        await tx.thaiFoodKey.createMany({
          data: row.keys.map((key) => ({ key, itemId: item.id })),
        });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  return { items: rows.length, keys: allKeys.length };
}
