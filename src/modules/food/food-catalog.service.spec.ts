import { FoodCatalogService } from './food-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FoodCatalogService.findByText', () => {
  const doritos = {
    id: 'cat-1',
    nameTh: 'โดริโทส ข้าวโพดแผ่นทอดกรอบ รสนาโชชีส',
    nameEn: 'Doritos Nacho Cheesier Flavoured',
    energyKcal: 160,
    proteinG: 2,
    carbohydrateG: 18,
    fatG: 9,
    servingQuantity: 1,
  };
  const hanami = {
    id: 'cat-2',
    nameTh: 'ฮานามิ ข้าวเกรียบกุ้ง',
    nameEn: 'Hanami Prawn Crackers',
    energyKcal: 140,
    proteinG: 2,
    carbohydrateG: 21,
    fatG: 5,
    servingQuantity: 1,
  };
  const lays = {
    id: 'cat-3',
    nameTh: 'เลย์ มันฝรั่งแท้ทอดกรอบแผ่นเรียบ รสซาวครีมและหัวหอม',
    nameEn: null,
    energyKcal: 430,
    proteinG: 5,
    carbohydrateG: 40,
    fatG: 28,
    servingQuantity: 1,
  };

  function makeService(items: unknown[]) {
    const prisma = {
      foodCatalogItem: {
        findMany: jest.fn().mockResolvedValue(items),
      },
    };
    return {
      service: new FoodCatalogService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('matches when the user text contains the full catalog name', async () => {
    const { service } = makeService([doritos, hanami]);

    const result = await service.findByText(
      'กินโดริโทส ข้าวโพดแผ่นทอดกรอบ รสนาโชชีสไปห่อนึง',
    );

    expect(result).toEqual({
      foodName: doritos.nameTh,
      estimatedCalories: 160,
      proteinG: 2,
      carbsG: 18,
      fatG: 9,
      confidence: 1,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'serving',
    });
  });

  it('matches when the catalog name contains the (short) user text', async () => {
    const { service } = makeService([doritos, hanami]);

    const result = await service.findByText('ฮานามิ ข้าวเกรียบกุ้ง');

    expect(result?.foodName).toBe(hanami.nameTh);
  });

  it('matches on the English name too', async () => {
    const { service } = makeService([doritos, hanami]);

    const result = await service.findByText(
      'eat some Doritos Nacho Cheesier Flavoured',
    );

    expect(result?.foodName).toBe(doritos.nameTh);
  });

  it('returns null when nothing matches', async () => {
    const { service } = makeService([doritos, hanami]);

    const result = await service.findByText('กินข้าวผัดกะเพราไก่');

    expect(result).toBeNull();
  });

  it('returns null rather than guess when text is too short to be confident', async () => {
    const { service } = makeService([doritos, hanami]);

    const result = await service.findByText('น้ำ');

    expect(result).toBeNull();
  });

  it('returns null when more than one catalog item matches (never guesses)', async () => {
    const twin = { ...doritos, id: 'cat-4', nameTh: doritos.nameTh };
    const { service } = makeService([doritos, twin]);

    const result = await service.findByText(doritos.nameTh);

    expect(result).toBeNull();
  });

  it('falls back to a brand-only match when the full name is not typed', async () => {
    const { service } = makeService([doritos, hanami, lays]);

    const result = await service.findByText('เลย์ห่อละ30 1ห่อ');

    expect(result?.foodName).toBe(lays.nameTh);
    expect(result?.estimatedCalories).toBe(430);
  });

  it('does not guess between two catalog items sharing the same brand word', async () => {
    const laysBbq = {
      ...lays,
      id: 'cat-5',
      nameTh: 'เลย์ มันฝรั่งแท้ทอดกรอบแผ่นเรียบ รสบาร์บีคิว',
    };
    const { service } = makeService([lays, laysBbq]);

    const result = await service.findByText('เลย์ห่อละ30 1ห่อ');

    expect(result).toBeNull();
  });

  it('falls back to null (not a throw) when the DB lookup fails', async () => {
    const prisma = {
      foodCatalogItem: {
        findMany: jest.fn().mockRejectedValue(new Error('db down')),
      },
    };
    const service = new FoodCatalogService(prisma as unknown as PrismaService);

    await expect(
      service.findByText('โดริโทส ข้าวโพดแผ่นทอดกรอบ รสนาโชชีส'),
    ).resolves.toBeNull();
  });

  it('returns null on an empty catalog (feature off until data is imported)', async () => {
    const { service } = makeService([]);

    const result = await service.findByText(
      'โดริโทส ข้าวโพดแผ่นทอดกรอบ รสนาโชชีส',
    );

    expect(result).toBeNull();
  });
});
