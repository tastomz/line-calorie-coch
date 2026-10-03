import { PrismaService } from '../../prisma/prisma.service';
import {
  THAI_FOOD_CONFIDENCE,
  ThaiFoodLookupService,
} from './thai-food-lookup.service';

describe('ThaiFoodLookupService', () => {
  const findUnique = jest.fn();
  const prisma = { thaiFoodKey: { findUnique } };
  const service = new ThaiFoodLookupService(prisma as unknown as PrismaService);

  const item = {
    id: 'item-1',
    nameTh: 'ข้าวทดสอบ',
    servingUnit: 'plate',
    servingDesc: '1 จาน (300 g)',
    calories: 601.25,
    proteinG: 30.04,
    carbsG: 70,
    fatG: 20,
    source: 'TEST DATASET',
  };

  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue({ key: 'ข้าวทดสอบ', itemId: 'item-1', item });
  });

  it('returns the stored serving as an analysis, scaled by quantity', async () => {
    const result = await service.lookup('ข้าวทดสอบ 2 จาน');

    expect(findUnique).toHaveBeenCalledWith({
      where: { key: 'ข้าวทดสอบ' },
      include: { item: true },
    });
    expect(result).toEqual({
      foodName: 'ข้าวทดสอบ',
      estimatedCalories: 1202.5,
      proteinG: 60.1,
      carbsG: 140,
      fatG: 40,
      confidence: THAI_FOOD_CONFIDENCE,
      assumptions: ['ค่ามาตรฐาน 1 จาน (300 g) · TEST DATASET'],
      estimatedQuantity: 2,
      quantityUnit: 'plate',
    });
  });

  it('defaults to one serving and a generated label when none is stored', async () => {
    findUnique.mockResolvedValue({
      key: 'k',
      itemId: 'item-1',
      item: { ...item, servingDesc: null },
    });
    const result = await service.lookup('ข้าวทดสอบ');
    expect(result?.estimatedQuantity).toBe(1);
    expect(result?.estimatedCalories).toBe(601.3);
    expect(result?.assumptions[0]).toBe('ค่ามาตรฐาน 1 จาน · TEST DATASET');
  });

  it('supports fractional servings', async () => {
    const result = await service.lookup('ข้าวทดสอบครึ่งจาน');
    expect(result?.estimatedQuantity).toBe(0.5);
    expect(result?.estimatedCalories).toBe(300.6);
  });

  it('returns null on a miss', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.lookup('เมนูที่ไม่มี')).resolves.toBeNull();
  });

  it('does not convert between units (data is per plate, user said bowl)', async () => {
    await expect(service.lookup('ข้าวทดสอบ 1 ชาม')).resolves.toBeNull();
  });

  it('skips the query when the amount is ambiguous or implausible', async () => {
    await expect(service.lookup('ข้าวทดสอบ 2')).resolves.toBeNull();
    await expect(service.lookup('ข้าวทดสอบ 99 จาน')).resolves.toBeNull();
    await expect(service.lookup('ก')).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ignores rows whose stored unit is not a known unit', async () => {
    findUnique.mockResolvedValue({
      key: 'k',
      itemId: 'item-1',
      item: { ...item, servingUnit: 'bucket' },
    });
    await expect(service.lookup('ข้าวทดสอบ')).resolves.toBeNull();
  });
});
