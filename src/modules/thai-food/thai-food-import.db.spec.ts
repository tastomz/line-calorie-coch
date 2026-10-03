import { PrismaClient } from '@prisma/client';
import { ThaiFoodRow } from './thai-food-import';
import {
  ThaiFoodKeyConflictError,
  importThaiFoodRows,
} from './thai-food-import.db';

function row(nameTh: string, keys: string[], source = 'TEST'): ThaiFoodRow {
  return {
    nameTh,
    nameEn: null,
    servingUnit: 'plate',
    servingDesc: null,
    servingGrams: null,
    calories: 600,
    proteinG: 30,
    carbsG: 70,
    fatG: 20,
    source,
    sourceRef: null,
    license: 'fixture',
    keys,
  };
}

describe('importThaiFoodRows', () => {
  const tx = {
    thaiFoodItem: {
      upsert: jest.fn(({ create }: { create: { nameTh: string } }) =>
        Promise.resolve({ id: `id-${create?.nameTh ?? 'x'}` }),
      ),
    },
    thaiFoodKey: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    thaiFoodKey: { findMany: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) =>
      fn(tx),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.thaiFoodKey.findMany.mockResolvedValue([]);
  });

  it('upserts each item and replaces its keys in one transaction', async () => {
    const result = await importThaiFoodRows(prisma as unknown as PrismaClient, [
      row('ก', ['กก', 'aa']),
      row('ข', ['ขข']),
    ]);

    expect(result).toEqual({ items: 2, keys: 3 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.thaiFoodItem.upsert).toHaveBeenCalledTimes(2);
    expect(tx.thaiFoodItem.upsert.mock.calls[0][0]).toMatchObject({
      where: { source_nameTh: { source: 'TEST', nameTh: 'ก' } },
    });
    expect(tx.thaiFoodKey.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'id-ก' },
    });
    expect(tx.thaiFoodKey.createMany).toHaveBeenCalledWith({
      data: [
        { key: 'กก', itemId: 'id-ก' },
        { key: 'aa', itemId: 'id-ก' },
      ],
    });
  });

  it('is idempotent: keys already owned by the same item are not conflicts', async () => {
    prisma.thaiFoodKey.findMany.mockResolvedValue([
      { key: 'กก', item: { source: 'TEST', nameTh: 'ก' } },
    ]);
    await expect(
      importThaiFoodRows(prisma as unknown as PrismaClient, [row('ก', ['กก'])]),
    ).resolves.toEqual({ items: 1, keys: 1 });
  });

  it('aborts before writing when a key belongs to another item', async () => {
    prisma.thaiFoodKey.findMany.mockResolvedValue([
      { key: 'กก', item: { source: 'OTHER', nameTh: 'อื่น' } },
    ]);

    const attempt = importThaiFoodRows(prisma as unknown as PrismaClient, [
      row('ก', ['กก']),
    ]);

    await expect(attempt).rejects.toBeInstanceOf(ThaiFoodKeyConflictError);
    await expect(attempt).rejects.toMatchObject({
      conflicts: [expect.stringContaining('อื่น')],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
