import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleSheetsService } from './google-sheets.service';
import { SheetsSyncService } from './sheets-sync.service';
import { SHEET_TABS } from './sheets.constants';

describe('SheetsSyncService', () => {
  const upsertRowById = jest.fn().mockResolvedValue(undefined);
  const deleteRowById = jest.fn().mockResolvedValue(undefined);
  const googleSheets = {
    isEnabled: jest.fn().mockReturnValue(true),
    upsertRowById,
    deleteRowById,
  };

  const prisma = {
    foodLog: {
      findMany: jest.fn().mockResolvedValue([
        { calories: 600, proteinG: 30, carbsG: 70, fatG: 20 },
        { calories: 400, proteinG: 20, carbsG: 40, fatG: 10 },
      ]),
    },
    nutritionProfile: {
      findUnique: jest.fn().mockResolvedValue({
        dailyCalories: 2000,
        dailyProteinG: 140,
        dailyCarbsG: 220,
        dailyFatG: 55,
      }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    weightLog: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const service = new SheetsSyncService(
    googleSheets as unknown as GoogleSheetsService,
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    googleSheets.isEnabled.mockReturnValue(true);
    upsertRowById.mockResolvedValue(undefined);
    deleteRowById.mockResolvedValue(undefined);
  });

  it('upserts user by id', async () => {
    await service.upsertUser({
      id: 'u1',
      lineUserId: 'Uline',
      displayName: 'Ann',
      pictureUrl: null,
      onboardingState: 'COMPLETED',
      draftSex: null,
      draftAge: null,
      draftHeightCm: null,
      draftCurrentWeightKg: null,
      draftTargetWeightKg: null,
      draftActivityLevel: null,
      draftGoal: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as never);

    expect(upsertRowById).toHaveBeenCalledWith(
      SHEET_TABS.USERS,
      'u1',
      expect.arrayContaining(['u1', 'Uline', 'Ann', 'COMPLETED']),
    );
  });

  it('upserts nutrition profile by profile id', async () => {
    await service.upsertNutritionProfile({
      id: 'p1',
      userId: 'u1',
      sex: 'MALE',
      age: 30,
      heightCm: 180,
      currentWeightKg: 85,
      targetWeightKg: 74,
      activityLevel: 'MODERATE',
      goal: 'LOSE_WEIGHT',
      dailyCalories: 2000,
      dailyProteinG: 140,
      dailyCarbsG: 220,
      dailyFatG: 55,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(upsertRowById).toHaveBeenCalledWith(
      SHEET_TABS.NUTRITION_PROFILES,
      'p1',
      expect.arrayContaining(['p1', 'u1', 2000]),
    );
  });

  it('syncs food log by foodLog.id', async () => {
    const log = {
      id: 'f1',
      userId: 'u1',
      eatenAt: new Date('2026-09-19T10:00:00.000Z'),
      mealType: 'UNKNOWN',
      foodName: 'ข้าว',
      calories: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 15,
      aiConfidence: 0.8,
      notes: null,
      imageUrl: null,
      createdAt: new Date('2026-09-19T10:00:00.000Z'),
    };
    await service.appendFoodLog(log as never);
    expect(upsertRowById).toHaveBeenCalledWith(
      SHEET_TABS.FOOD_LOGS,
      'f1',
      expect.arrayContaining(['f1', 'u1', 'ข้าว', 500]),
    );
  });

  it('upsertFoodLog reuses FOOD_LOGS id key after edits', async () => {
    const log = {
      id: 'f1',
      userId: 'u1',
      eatenAt: new Date('2026-09-19T10:00:00.000Z'),
      mealType: 'UNKNOWN',
      foodName: 'ข้าวแก้',
      calories: 300,
      proteinG: 10,
      carbsG: 40,
      fatG: 8,
      aiConfidence: 0.8,
      notes: null,
      imageUrl: null,
      createdAt: new Date('2026-09-19T10:00:00.000Z'),
    };
    await service.upsertFoodLog(log as never);
    expect(upsertRowById).toHaveBeenCalledWith(
      SHEET_TABS.FOOD_LOGS,
      'f1',
      expect.arrayContaining(['f1', 'ข้าวแก้', 300]),
    );
  });

  it('deleteFoodLog removes FOOD_LOGS row by id', async () => {
    await service.deleteFoodLog('f1');
    expect(deleteRowById).toHaveBeenCalledWith(SHEET_TABS.FOOD_LOGS, 'f1');
  });

  it('syncs weight log by weightLog.id', async () => {
    await service.appendWeightLog({
      id: 'w1',
      userId: 'u1',
      weightKg: 84.2,
      recordedAt: new Date('2026-09-19T08:00:00.000Z'),
      createdAt: new Date('2026-09-19T08:00:00.000Z'),
    });

    expect(upsertRowById).toHaveBeenCalledWith(
      SHEET_TABS.WEIGHT_LOGS,
      'w1',
      expect.arrayContaining(['w1', 'u1', 84.2]),
    );
  });

  it('calculates DailySummary from DB not from sheet rows', async () => {
    await service.updateDailySummary(
      'u1',
      new Date('2026-09-19T10:00:00.000Z'),
    );

    expect(prisma.foodLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.nutritionProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(upsertRowById).toHaveBeenCalledWith(
      SHEET_TABS.DAILY_SUMMARY,
      expect.stringContaining('u1:'),
      expect.arrayContaining([1000, 2000, 50, 140]),
    );
  });

  it('enqueue swallows sync failures', async () => {
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();
    service.enqueue('boom', () => Promise.reject(new Error('sheets down')));
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Sheets sync failed (boom)'),
    );
    warn.mockRestore();
  });

  it('duplicate sync uses same id key (upsert, not blind append)', async () => {
    const log = {
      id: 'f-dup',
      userId: 'u1',
      eatenAt: new Date(),
      mealType: 'UNKNOWN',
      foodName: 'ไข่',
      calories: 140,
      proteinG: 12,
      carbsG: 1,
      fatG: 10,
      aiConfidence: null,
      notes: null,
      imageUrl: null,
      createdAt: new Date(),
    };
    await service.appendFoodLog(log as never);
    await service.appendFoodLog(log as never);
    expect(upsertRowById).toHaveBeenCalledTimes(2);
    const firstId = (upsertRowById.mock.calls[0] as [string, string])[1];
    const secondId = (upsertRowById.mock.calls[1] as [string, string])[1];
    expect(firstId).toBe('f-dup');
    expect(secondId).toBe('f-dup');
  });
});

describe('GoogleSheetsService disabled mode', () => {
  it('no-ops when credentials missing', async () => {
    const config = {
      get: jest.fn().mockReturnValue(''),
    };
    const service = new GoogleSheetsService(config as unknown as ConfigService);
    expect(service.isEnabled()).toBe(false);
    await expect(
      service.upsertRowById(SHEET_TABS.USERS, 'x', ['x']),
    ).resolves.toBeUndefined();
  });
});

describe('Food/Weight persist even when Sheets fails', () => {
  it('enqueue isolates Google failures from caller', () => {
    const sheetsSync = new SheetsSyncService(
      {
        isEnabled: () => true,
        upsertRowById: jest.fn().mockRejectedValue(new Error('429')),
      } as unknown as GoogleSheetsService,
      {} as PrismaService,
    );

    expect(() => {
      sheetsSync.enqueue('appendFoodLog', () =>
        sheetsSync.appendFoodLog({
          id: 'f1',
          userId: 'u1',
          eatenAt: new Date(),
          mealType: 'UNKNOWN',
          foodName: 'ข้าว',
          calories: 1,
          proteinG: 1,
          carbsG: 1,
          fatG: 1,
          aiConfidence: null,
          notes: null,
          imageUrl: null,
          createdAt: new Date(),
        } as never),
      );
    }).not.toThrow();
  });
});
