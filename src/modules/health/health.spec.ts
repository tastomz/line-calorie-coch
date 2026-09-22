import { BodyScan } from '@prisma/client';
import { BodyScanService } from './body-scan.service';
import {
  isExactHealthCommand,
  parseExerciseCommand,
  parseHydrationCommand,
  parseRecoveryCommand,
  parseSleepCommand,
  parseStepsCommand,
} from './health-commands';
import { MEAL_ALLOCATION, MealPlanService } from './meal-plan.service';
import { getProgramWeekDay } from './program-week';
import { HealthInsightService } from './health-dashboard.service';

describe('health-commands parsers', () => {
  it('parses sleep bedtime/wake', () => {
    expect(parseSleepCommand('นอน 00:30 ตื่น 07:30')).toEqual({
      bedtimeHour: 0,
      bedtimeMinute: 30,
      wakeHour: 7,
      wakeMinute: 30,
    });
    expect(parseSleepCommand('นอน 23:00-06:00')).toEqual({
      bedtimeHour: 23,
      bedtimeMinute: 0,
      wakeHour: 6,
      wakeMinute: 0,
    });
  });

  it('parses exercise duration and type', () => {
    const e = parseExerciseCommand('ออกกำลังกาย strength 45');
    expect(e?.durationMinutes).toBe(45);
    expect(e?.type).toBe('STRENGTH');
    expect(parseExerciseCommand('ออกกำลัง 30')?.durationMinutes).toBe(30);
  });

  it('parses steps / water / recovery', () => {
    expect(parseStepsCommand('ก้าว 8420')).toBe(8420);
    expect(parseHydrationCommand('น้ำ 250')).toBe(250);
    expect(parseHydrationCommand('+500 ml')).toBe(500);
    expect(parseRecoveryCommand('ฟื้นตัว 4 2 4 2')).toEqual({
      energyScore: 4,
      stressScore: 2,
      recoveryScore: 4,
      sorenessScore: 2,
    });
  });

  it('matches exact health commands', () => {
    expect(isExactHealthCommand('ร่างกาย', ['ร่างกาย', 'body'])).toBe(true);
    expect(isExactHealthCommand('สรุปสัปดาห์', ['สรุปสัปดาห์'])).toBe(true);
  });
});

describe('BodyScanService.compareProgress', () => {
  const svc = new BodyScanService({} as never);

  it('compares numeric fields deterministically', () => {
    const older = {
      weightKg: 80.5,
      bodyFatPercent: 20.9,
      skeletalMuscleMassKg: 35.5,
      waistCm: 88.3,
      bodyFatMassKg: null,
      leanBodyMassKg: null,
      visceralFatAreaCm2: null,
      waistToHipRatio: null,
    } as BodyScan;
    const newer = {
      weightKg: 78.8,
      bodyFatPercent: 18.9,
      skeletalMuscleMassKg: 35.8,
      waistCm: 85.5,
      bodyFatMassKg: null,
      leanBodyMassKg: null,
      visceralFatAreaCm2: null,
      waistToHipRatio: null,
    } as BodyScan;

    const deltas = svc.compareProgress(newer, older);
    expect(deltas.find((d) => d.field === 'weightKg')?.delta).toBe(-1.7);
    expect(deltas.find((d) => d.field === 'bodyFatPercent')?.delta).toBe(-2);
    expect(deltas.find((d) => d.field === 'skeletalMuscleMassKg')?.delta).toBe(
      0.3,
    );
    expect(deltas.find((d) => d.field === 'waistCm')?.delta).toBe(-2.8);
  });

  it('keeps missing fields null without fabricating', () => {
    const older = { weightKg: 80 } as BodyScan;
    const newer = { weightKg: 79, bodyFatPercent: 20 } as BodyScan;
    const fat = svc
      .compareProgress(newer, older)
      .find((d) => d.field === 'bodyFatPercent');
    expect(fat?.delta).toBeNull();
  });
});

describe('MealPlanService allocation', () => {
  it('allocates 25/30/30/15 deterministically', () => {
    expect(MEAL_ALLOCATION.BREAKFAST).toBe(0.25);
    expect(MEAL_ALLOCATION.LUNCH).toBe(0.3);
    expect(MEAL_ALLOCATION.DINNER).toBe(0.3);
    expect(MEAL_ALLOCATION.SNACK).toBe(0.15);
    const sum = Object.values(MEAL_ALLOCATION).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('creates slot targets from daily macros', async () => {
    const created: { data: { slots: { create: unknown[] } } } = {
      data: { slots: { create: [] } },
    };
    const prisma = {
      mealPlan: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: typeof created) => {
          created.data = args.data;
          return Promise.resolve({
            ...args.data,
            slots: args.data.slots.create,
          });
        }),
      },
    };
    const svc = new MealPlanService(prisma as never);
    const plan = await svc.ensureTodayPlan({
      userId: 'user-a',
      dailyCalories: 1800,
      dailyProteinG: 130,
      dailyCarbsG: 180,
      dailyFatG: 50,
      planDate: '2026-09-22',
    });
    const slots = plan.slots as Array<{
      mealType: string;
      calorieTarget: number;
      proteinTargetG: number;
    }>;
    expect(slots.find((s) => s.mealType === 'BREAKFAST')?.calorieTarget).toBe(
      450,
    );
    expect(slots.find((s) => s.mealType === 'LUNCH')?.calorieTarget).toBe(540);
    expect(slots.find((s) => s.mealType === 'SNACK')?.calorieTarget).toBe(270);
    expect(slots.find((s) => s.mealType === 'BREAKFAST')?.proteinTargetG).toBe(
      32.5,
    );
  });
});

describe('program week + insights', () => {
  it('labels week/day from start date', () => {
    const start = new Date('2026-09-01T00:00:00+07:00');
    const now = new Date('2026-09-08T12:00:00+07:00');
    const p = getProgramWeekDay(start, now);
    expect(p.week).toBe(2);
    expect(p.day).toBe(1);
    expect(p.label).toBe('Week 2 · Day 1');
  });

  it('builds insights only from available snapshot data', () => {
    const svc = new HealthInsightService();
    const tips = svc.buildInsights({
      programLabel: 'Week 1 · Day 1',
      nutrition: {
        date: new Date(),
        consumed: { calories: 2000, proteinG: 50, carbsG: 100, fatG: 40 },
        target: { calories: 1800, proteinG: 130, carbsG: 180, fatG: 50 },
        remaining: { calories: -200, proteinG: 80, carbsG: 80, fatG: 10 },
      },
      weightKg: null,
      sleepMinutes: 5 * 60,
      exerciseMinutes: 0,
      steps: 3000,
      waterMl: 500,
      waterTargetMl: 2500,
      recoveryScore: null,
      tip: 'x',
    });
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.length).toBeLessThanOrEqual(3);
    expect(tips.some((t) => t.includes('โปรตีน'))).toBe(true);
  });
});
