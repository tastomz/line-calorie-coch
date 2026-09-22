import { OnboardingState } from '@prisma/client';
import { aiRateLimiter } from '../../common/ai-rate-limiter';
import { LineOutboundError } from '../line/line-outbound.error';
import { LineService } from '../line/line.service';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { WeightLogService } from '../weight/weight-log.service';
import { SheetsSyncService } from '../sheets/sheets-sync.service';
import { AiGatewayService } from '../membership/ai-gateway.service';
import { AiQuotaExceededError } from '../membership/membership.errors';
import { MembershipService } from '../membership/membership.service';
import { PROFILE_REQUIRED_TEXT } from './daily-coach.messages';
import {
  DailySummaryService,
  NutritionProfileMissingError,
} from './daily-summary.service';
import { DailyTotalsService } from './daily-totals.service';
import { FoodAnalysisService } from './food-analysis.service';
import { FoodLogService } from './food-log.service';
import { FoodLoggingService } from './food-logging.service';
import {
  AMBIGUOUS_NUMBER_TEXT,
  COMPLETE_PROFILE_FIRST_TEXT,
  FOOD_RATE_LIMITED_TEXT,
} from './food.messages';
import { MessageClassifyService } from './message-classify.service';
import { PendingFoodService } from './pending-food.service';

describe('FoodLoggingService', () => {
  const foodAnalysisService = {
    analyzeText: jest.fn(),
    analyzeImage: jest.fn(),
    analyzeCompositionAdjustment: jest.fn(),
  };
  const messageClassifyService = {
    classify: jest.fn(),
  };
  const pendingFoodService = {
    upsertPending: jest.fn(),
    requireActiveForUser: jest.fn(),
    getActiveForUser: jest.fn(),
    clearForUser: jest.fn(),
    toAnalysisResult: jest.fn(),
    applyConsumedQuantity: jest.fn(),
    restoreOriginalQuantity: jest.fn(),
    replaceWithCompositionAnalysis: jest.fn(),
    quantityNotes: jest.fn(),
    confirmPendingAtomic: jest.fn(),
    applyCalorieOverride: jest.fn(),
  };
  const foodLogService = {
    createFromAnalysis: jest.fn(),
    listForUserOnDate: jest.fn(),
  };
  const dailyTotalsService = {
    getSummaryForUser: jest.fn(),
  };
  const dailySummaryService = {
    getDailySummary: jest.fn(),
  };
  const weightLogService = {
    createForUser: jest.fn(),
    getTodayAverageKg: jest.fn(),
    getRecentDailyAverages: jest.fn(),
    getSevenDayTrend: jest.fn(),
    getTargetProgress: jest.fn(),
    getLatestForUser: jest.fn(),
    getChangeSinceFirst: jest.fn(),
  };
  const sheetsSync = {
    enqueue: jest.fn((label: string, work: () => Promise<void>) => {
      void work().catch(() => undefined);
    }),
    appendFoodLog: jest.fn().mockResolvedValue(undefined),
    appendWeightLog: jest.fn().mockResolvedValue(undefined),
    updateDailySummary: jest.fn().mockResolvedValue(undefined),
  };
  const nutritionProfileService = {
    findByUserId: jest.fn(),
  };
  const lineService = {
    replyText: jest.fn(),
    replyButtons: jest.fn(),
    replyTextOrPush: jest.fn(),
    replyButtonsOrPush: jest.fn(),
    replyFlex: jest
      .fn()
      .mockRejectedValue(new Error('flex disabled in unit test')),
    replyFlexOrPush: jest.fn(),
    getMessageContentBytes: jest.fn(),
    getMessageContentPreviewBytes: jest.fn(),
  };
  const aiGateway = {
    run: jest.fn(
      async (_userId: string, _op: string, work: () => Promise<unknown>) =>
        work(),
    ),
  };
  const membershipService = {
    buildStatusText: jest.fn(),
    redeemPromo: jest.fn(),
  };
  const healthRouting = {
    tryHandleText: jest.fn().mockResolvedValue(false),
    tryHandleImage: jest.fn().mockResolvedValue(false),
  };
  const healthDashboard = {
    buildToday: jest.fn((params: Record<string, unknown>) =>
      Promise.resolve({
        programLabel: 'Week 1 · Day 1',
        nutrition: params.nutrition ?? null,
        weightKg: (params.todayWeightKg as number | null) ?? null,
        sleepMinutes: null,
        exerciseMinutes: 0,
        steps: null,
        waterMl: 0,
        waterTargetMl: 2500,
        recoveryScore: null,
        tip: 'บันทึกมื้ออาหารและสุขภาพวันต่อวันได้เลยครับ',
      }),
    ),
    formatDuration: jest.fn((m: number) => `${m}m`),
    formatDashboardText: jest.fn((snap: Record<string, unknown>) => {
      const nutrition = snap.nutrition as {
        consumed: { calories: number; proteinG: number };
        target: { calories: number; proteinG: number };
      } | null;
      const weightKg = snap.weightKg as number | null;
      const lines = [`📊 วันนี้`, String(snap.programLabel), ''];
      if (nutrition) {
        lines.push(
          `🔥 ${nutrition.consumed.calories.toLocaleString('en-US')} / ${nutrition.target.calories.toLocaleString('en-US')} kcal`,
        );
        lines.push(
          `🥩 ${nutrition.consumed.proteinG} / ${nutrition.target.proteinG} g`,
        );
        lines.push('');
      }
      if (weightKg != null) {
        lines.push(`⚖️ ${weightKg.toFixed(1)} kg`);
      }
      lines.push('💧 0.0 / 2.5 L');
      lines.push('', '💡 Coach Tip', String(snap.tip));
      return lines.join('\n');
    }),
  };
  const healthInsights = {
    buildInsights: jest.fn().mockReturnValue([]),
  };

  const service = new FoodLoggingService(
    foodAnalysisService as unknown as FoodAnalysisService,
    messageClassifyService as unknown as MessageClassifyService,
    pendingFoodService as unknown as PendingFoodService,
    foodLogService as unknown as FoodLogService,
    dailyTotalsService as unknown as DailyTotalsService,
    dailySummaryService as unknown as DailySummaryService,
    weightLogService as unknown as WeightLogService,
    sheetsSync as unknown as SheetsSyncService,
    nutritionProfileService as unknown as NutritionProfileService,
    lineService as unknown as LineService,
    aiGateway as unknown as AiGatewayService,
    membershipService as unknown as MembershipService,
    healthRouting as unknown as import('../health/health-routing.service').HealthRoutingService,
    healthDashboard as unknown as import('../health/health-dashboard.service').HealthDashboardService,
    healthInsights,
  );

  const completedUser = {
    id: 'user-a',
    lineUserId: 'U-line-a',
    onboardingState: OnboardingState.COMPLETED,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const sampleSummary = {
    date: new Date(),
    consumed: { calories: 1250, proteinG: 82, carbsG: 120, fatG: 42 },
    target: { calories: 2000, proteinG: 140, carbsG: 220, fatG: 55 },
    remaining: { calories: 750, proteinG: 58, carbsG: 100, fatG: 13 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    aiRateLimiter.reset();
    pendingFoodService.getActiveForUser.mockResolvedValue(null);
    healthRouting.tryHandleText.mockResolvedValue(false);
    healthRouting.tryHandleImage.mockResolvedValue(false);
    healthInsights.buildInsights.mockReturnValue([]);
    weightLogService.getTodayAverageKg.mockResolvedValue(null);
    weightLogService.getRecentDailyAverages.mockResolvedValue([]);
    weightLogService.getSevenDayTrend.mockResolvedValue(null);
    weightLogService.getTargetProgress.mockResolvedValue(null);
    aiGateway.run.mockImplementation(
      async (_userId: string, _op: string, work: () => Promise<unknown>) =>
        work(),
    );
    messageClassifyService.classify.mockResolvedValue({
      type: 'food',
      weightKg: null,
      weightQuery: null,
      coachHint: null,
    });
  });

  it('analyzes text food and asks for confirmation without saving', async () => {
    foodAnalysisService.analyzeText.mockResolvedValue({
      foodName: 'ข้าวกะเพราไก่ไข่ดาว',
      estimatedCalories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      confidence: 0.8,
      assumptions: ['ข้าว 200g'],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.upsertPending.mockResolvedValue({
      originalQuantity: 1,
      consumedQuantity: 1,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ข้าวกะเพราไก่ไข่ดาว 1 จาน',
    );

    expect(pendingFoodService.upsertPending).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ foodName: 'ข้าวกะเพราไก่ไข่ดาว' }),
      undefined,
    );
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).toHaveBeenCalledTimes(1);
    expect(lineService.replyButtonsOrPush).toHaveBeenCalled();
    expect(foodLogService.createFromAnalysis).not.toHaveBeenCalled();
  });

  it('handles สมาชิก command with zero AI', async () => {
    membershipService.buildStatusText.mockResolvedValue(
      '👤 สมาชิก\nแพ็กเกจ: Free',
    );

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'สมาชิก',
    );

    expect(membershipService.buildStatusText).toHaveBeenCalledWith('user-a');
    expect(aiGateway.run).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
  });

  it('handles แพ็กเกจ and สิทธิ์ as membership commands', async () => {
    membershipService.buildStatusText.mockResolvedValue('status');
    await service.handleCompletedText(
      completedUser as never,
      'token',
      'แพ็กเกจ',
    );
    await service.handleCompletedText(
      completedUser as never,
      'token',
      'สิทธิ์',
    );
    expect(membershipService.buildStatusText).toHaveBeenCalledTimes(2);
    expect(aiGateway.run).not.toHaveBeenCalled();
  });

  it('handles ใช้โค้ด promo command with zero AI', async () => {
    membershipService.redeemPromo.mockResolvedValue('🎉 ใช้โค้ดสำเร็จ!');

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ใช้โค้ด WELCOME30',
    );

    expect(membershipService.redeemPromo).toHaveBeenCalledWith(
      'user-a',
      'WELCOME30',
    );
    expect(aiGateway.run).not.toHaveBeenCalled();
  });

  it('replies with quota exceeded message when FOOD_TEXT quota is full', async () => {
    aiGateway.run.mockRejectedValue(
      new AiQuotaExceededError('FOOD_TEXT', 'FREE', 5, 5),
    );

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ข้าวกะเพราไก่',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('โควต้า'),
    );
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('routes food analysis through AI gateway FOOD_TEXT', async () => {
    foodAnalysisService.analyzeText.mockResolvedValue({
      foodName: 'ข้าวกะเพราไก่',
      estimatedCalories: 500,
      proteinG: 30,
      carbsG: 55,
      fatG: 18,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.upsertPending.mockResolvedValue({
      originalQuantity: 1,
      consumedQuantity: 1,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ข้าวกะเพราไก่',
    );

    expect(aiGateway.run).toHaveBeenCalledWith(
      'user-a',
      'FOOD_TEXT',
      expect.any(Function),
    );
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).toHaveBeenCalledTimes(1);
    expect(foodAnalysisService.analyzeText).toHaveBeenCalledWith(
      'ข้าวกะเพราไก่',
    );
  });

  it('confirms pending analysis and saves FoodLog + daily totals', async () => {
    const analysis = {
      foodName: 'ข้าวกะเพราไก่ไข่ดาว',
      estimatedCalories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    };
    pendingFoodService.confirmPendingAtomic.mockResolvedValue({
      foodLog: {
        id: 'food-1',
        userId: 'user-a',
        eatenAt: new Date(),
        mealType: 'UNKNOWN',
        foodName: analysis.foodName,
        calories: analysis.estimatedCalories,
        proteinG: analysis.proteinG,
        carbsG: analysis.carbsG,
        fatG: analysis.fatG,
        aiConfidence: analysis.confidence,
        notes: null,
        imageUrl: null,
        createdAt: new Date(),
      },
      analysis,
      pendingId: 'pending-1',
    });
    dailyTotalsService.getSummaryForUser.mockResolvedValue({
      totals: { calories: 1250, proteinG: 82, carbsG: 140, fatG: 40 },
      targets: {
        dailyCalories: 2000,
        dailyProteinG: 140,
        dailyCarbsG: 220,
        dailyFatG: 60,
      },
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'บันทึก',
    );

    expect(pendingFoodService.confirmPendingAtomic).toHaveBeenCalledWith(
      'user-a',
    );
    expect(foodLogService.createFromAnalysis).not.toHaveBeenCalled();
    expect(lineService.replyTextOrPush).toHaveBeenCalledWith(
      'token',
      'U-line-a',
      expect.stringContaining('บันทึกแล้ว'),
    );
    expect(sheetsSync.enqueue).toHaveBeenCalled();
  });

  it('keeps FoodLog success path when Sheets sync rejects', async () => {
    const analysis = {
      foodName: 'ข้าว',
      estimatedCalories: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 15,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    };
    pendingFoodService.confirmPendingAtomic.mockResolvedValue({
      foodLog: {
        id: 'food-ok',
        userId: 'user-a',
        eatenAt: new Date(),
        mealType: 'UNKNOWN',
        foodName: 'ข้าว',
        calories: 500,
        proteinG: 20,
        carbsG: 60,
        fatG: 15,
        aiConfidence: 0.8,
        notes: null,
        imageUrl: null,
        createdAt: new Date(),
      },
      analysis,
      pendingId: 'pending-ok',
    });
    dailyTotalsService.getSummaryForUser.mockResolvedValue({
      totals: { calories: 500, proteinG: 20, carbsG: 60, fatG: 15 },
      targets: {
        dailyCalories: 2000,
        dailyProteinG: 140,
        dailyCarbsG: 220,
        dailyFatG: 60,
      },
    });
    sheetsSync.appendFoodLog.mockRejectedValue(new Error('sheets 503'));
    sheetsSync.updateDailySummary.mockRejectedValue(new Error('sheets 503'));

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'บันทึก',
    );

    expect(pendingFoodService.confirmPendingAtomic).toHaveBeenCalled();
    expect(lineService.replyTextOrPush).toHaveBeenCalledWith(
      'token',
      'U-line-a',
      expect.stringContaining('บันทึกแล้ว'),
    );
  });

  it('does not reverse FoodLog when LINE reply fails after confirm', async () => {
    const analysis = {
      foodName: 'ข้าว',
      estimatedCalories: 500,
      proteinG: 20,
      carbsG: 60,
      fatG: 15,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    };
    pendingFoodService.confirmPendingAtomic.mockResolvedValue({
      foodLog: {
        id: 'food-reply-fail',
        userId: 'user-a',
        eatenAt: new Date(),
        mealType: 'UNKNOWN',
        foodName: 'ข้าว',
        calories: 500,
        proteinG: 20,
        carbsG: 60,
        fatG: 15,
        aiConfidence: 0.8,
        notes: null,
        imageUrl: null,
        createdAt: new Date(),
      },
      analysis,
      pendingId: 'pending-rf',
    });
    dailyTotalsService.getSummaryForUser.mockResolvedValue({
      totals: { calories: 500, proteinG: 20, carbsG: 60, fatG: 15 },
      targets: {
        dailyCalories: 2000,
        dailyProteinG: 140,
        dailyCarbsG: 220,
        dailyFatG: 60,
      },
    });
    lineService.replyTextOrPush.mockRejectedValueOnce(
      new LineOutboundError('LINE replyMessage failed'),
    );

    await expect(
      service.handleCompletedText(completedUser as never, 'token', 'บันทึก'),
    ).rejects.toBeInstanceOf(LineOutboundError);

    expect(pendingFoodService.confirmPendingAtomic).toHaveBeenCalledTimes(1);
  });

  it('cancels pending analysis without saving', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'แก้ไข/ยกเลิก',
    );

    expect(foodLogService.createFromAnalysis).not.toHaveBeenCalled();
    expect(pendingFoodService.clearForUser).toHaveBeenCalledWith('user-a');
  });

  it('blocks food image logging when profile incomplete via assert helper', async () => {
    const incomplete = {
      id: 'user-x',
      onboardingState: OnboardingState.WAITING_SEX,
    };
    const ok = await service.assertCompletedOrReply(
      incomplete as never,
      'token',
    );
    expect(ok).toBe(false);
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      COMPLETE_PROFILE_FIRST_TEXT,
    );
  });

  it('applies proportional quantity adjustment without calling OpenAI', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 10,
      quantityUnit: 'piece',
    });
    pendingFoodService.requireActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 10,
      quantityUnit: 'piece',
    });
    pendingFoodService.applyConsumedQuantity.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 10,
      consumedQuantity: 3,
      quantityUnit: 'piece',
      calories: 180,
      proteinG: 7.5,
      carbsG: 24,
      fatG: 6,
      confidence: 0.8,
      foodName: 'Sushi',
      assumptions: '[]',
    });
    pendingFoodService.toAnalysisResult.mockReturnValue({
      foodName: 'Sushi',
      estimatedCalories: 180,
      proteinG: 7.5,
      carbsG: 24,
      fatG: 6,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 3,
      quantityUnit: 'piece',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'กินแค่ 3 ชิ้น',
    );

    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(pendingFoodService.applyConsumedQuantity).toHaveBeenCalledWith(
      'user-a',
      3,
    );
    expect(lineService.replyButtonsOrPush).toHaveBeenCalled();
  });

  it('applies percentage adjustment without calling OpenAI', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.requireActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.applyConsumedQuantity.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      consumedQuantity: 0.5,
      quantityUnit: 'plate',
      calories: 325,
      proteinG: 20,
      carbsG: 35,
      fatG: 12,
      confidence: 0.8,
      foodName: 'ข้าวมันไก่',
      assumptions: '[]',
    });
    pendingFoodService.toAnalysisResult.mockReturnValue({
      foodName: 'ข้าวมันไก่',
      estimatedCalories: 325,
      proteinG: 20,
      carbsG: 35,
      fatG: 12,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 0.5,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'กินแค่ 50%',
    );

    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(pendingFoodService.applyConsumedQuantity).toHaveBeenCalledWith(
      'user-a',
      0.5,
    );
    expect(lineService.replyButtonsOrPush).toHaveBeenCalled();
  });

  it('asks clarification for กิน 50 without unit and does not call OpenAI', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'กิน 50',
    );

    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(pendingFoodService.applyConsumedQuantity).not.toHaveBeenCalled();
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('ประมาณเท่าไร'),
    );
  });

  it('applies half and unit quantity on pending with zero AI', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.requireActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.applyConsumedQuantity.mockResolvedValue({
      originalQuantity: 1,
      consumedQuantity: 0.5,
      quantityUnit: 'plate',
    });
    pendingFoodService.toAnalysisResult.mockReturnValue({
      foodName: 'ข้าว',
      estimatedCalories: 300,
      proteinG: 10,
      carbsG: 40,
      fatG: 8,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 0.5,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'กินครึ่ง',
    );
    expect(pendingFoodService.applyConsumedQuantity).toHaveBeenCalledWith(
      'user-a',
      0.5,
    );
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();

    pendingFoodService.applyConsumedQuantity.mockClear();
    pendingFoodService.applyConsumedQuantity.mockResolvedValue({
      originalQuantity: 1,
      consumedQuantity: 2,
      quantityUnit: 'plate',
    });
    pendingFoodService.toAnalysisResult.mockReturnValue({
      foodName: 'ข้าว',
      estimatedCalories: 600,
      proteinG: 20,
      carbsG: 80,
      fatG: 16,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 2,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'กิน 2 จาน',
    );
    expect(pendingFoodService.applyConsumedQuantity).toHaveBeenCalledWith(
      'user-a',
      2,
    );
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
  });

  it('uses one composition AI call for natural-language pending correction', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
      originalCalories: 650,
      originalProteinG: 35,
      originalCarbsG: 70,
      originalFatG: 25,
      calories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      foodName: 'ข้าวกะเพราไก่',
    });
    pendingFoodService.requireActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 1,
      quantityUnit: 'plate',
      originalCalories: 650,
      originalProteinG: 35,
      originalCarbsG: 70,
      originalFatG: 25,
      calories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      foodName: 'ข้าวกะเพราไก่',
    });
    pendingFoodService.toAnalysisResult.mockReturnValue({
      foodName: 'ข้าวกะเพราไก่',
      estimatedCalories: 650,
      proteinG: 35,
      carbsG: 70,
      fatG: 25,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    foodAnalysisService.analyzeCompositionAdjustment.mockResolvedValue({
      foodName: 'ข้าวกะเพราหมู',
      estimatedCalories: 700,
      proteinG: 32,
      carbsG: 70,
      fatG: 30,
      confidence: 0.75,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.replaceWithCompositionAnalysis.mockResolvedValue({
      foodName: 'ข้าวกะเพราหมู',
      originalQuantity: 1,
      consumedQuantity: 1,
      quantityUnit: 'plate',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ไม่ใช่ไก่ เป็นหมู',
    );

    expect(
      foodAnalysisService.analyzeCompositionAdjustment,
    ).toHaveBeenCalledTimes(1);
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('uses classify fallback once for ambiguous non-food text', async () => {
    messageClassifyService.classify.mockResolvedValue({
      type: 'other',
      weightKg: null,
      weightQuery: null,
      coachHint: null,
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'อะไรสักอย่าง',
    );

    expect(messageClassifyService.classify).toHaveBeenCalledTimes(1);
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('classifier FOOD leads to exactly one food analysis', async () => {
    messageClassifyService.classify.mockResolvedValue({
      type: 'food',
      weightKg: null,
      weightQuery: null,
      coachHint: null,
    });
    foodAnalysisService.analyzeText.mockResolvedValue({
      foodName: 'อะไรสักอย่าง',
      estimatedCalories: 400,
      proteinG: 20,
      carbsG: 40,
      fatG: 10,
      confidence: 0.5,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'serving',
    });
    pendingFoodService.upsertPending.mockResolvedValue({
      originalQuantity: 1,
      consumedQuantity: 1,
      quantityUnit: 'serving',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'อะไรสักอย่าง',
    );

    expect(messageClassifyService.classify).toHaveBeenCalledTimes(1);
    expect(foodAnalysisService.analyzeText).toHaveBeenCalledTimes(1);
  });

  it('handles วันนี้ command with deterministic tip and zero OpenAI', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้',
    );

    expect(dailySummaryService.getDailySummary).toHaveBeenCalledWith('user-a');
    expect(healthDashboard.buildToday).toHaveBeenCalled();
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeImage).not.toHaveBeenCalled();
    expect(aiGateway.run).not.toHaveBeenCalled();
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringMatching(/📊 วันนี้[\s\S]*1,250 \/ 2,000 kcal[\s\S]*💡/),
    );
  });

  it('handles อาหาร as FOOD_ENTRY hint with zero AI and no FoodLog', async () => {
    await service.handleCompletedText(completedUser as never, 'token', 'อาหาร');

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringMatching(/🍽️ บันทึกอาหาร[\s\S]*ข้าวมันไก่ 1 จาน/),
    );
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeImage).not.toHaveBeenCalled();
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(aiGateway.run).not.toHaveBeenCalled();
    expect(foodLogService.createFromAnalysis).not.toHaveBeenCalled();
    expect(pendingFoodService.upsertPending).not.toHaveBeenCalled();
    expect(dailySummaryService.getDailySummary).not.toHaveBeenCalled();
    expect(healthDashboard.buildToday).not.toHaveBeenCalled();
  });

  it('handles whitespace-padded อาหาร as FOOD_ENTRY', async () => {
    await service.handleCompletedText(
      completedUser as never,
      'token',
      ' อาหาร ',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('🍽️ บันทึกอาหาร'),
    );
    expect(aiGateway.run).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('handles โค้ช as COACH_ENTRY welcome with zero AI and no Daily', async () => {
    await service.handleCompletedText(completedUser as never, 'token', 'โค้ช');

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringMatching(/🧠 Kcal Coach[\s\S]*มีอะไรอยากถามผมไหม/),
    );
    expect(dailySummaryService.getDailySummary).not.toHaveBeenCalled();
    expect(healthDashboard.buildToday).not.toHaveBeenCalled();
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(aiGateway.run).not.toHaveBeenCalled();
  });

  it('handles whitespace-padded โค้ช as COACH_ENTRY', async () => {
    await service.handleCompletedText(
      completedUser as never,
      'token',
      ' โค้ช ',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('🧠 Kcal Coach'),
    );
    expect(dailySummaryService.getDailySummary).not.toHaveBeenCalled();
    expect(aiGateway.run).not.toHaveBeenCalled();
  });

  it('does not treat natural-language อาหาร/โค้ช/วันนี้ phrases as exact commands', async () => {
    messageClassifyService.classify.mockResolvedValue({
      type: 'coach',
      weightKg: null,
      weightQuery: null,
      coachHint: 'meal_recommendation',
    });
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'อาหารเช้านี้กินอะไรดี',
    );
    expect(lineService.replyText).not.toHaveBeenCalledWith(
      'token',
      expect.stringMatching(/^🍽️ บันทึกอาหาร/),
    );
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();

    lineService.replyText.mockClear();
    healthDashboard.buildToday.mockClear();
    await service.handleCompletedText(
      completedUser as never,
      'token',
      'โค้ชช่วยดูน้ำหนักให้หน่อย',
    );
    expect(lineService.replyText).not.toHaveBeenCalledWith(
      'token',
      expect.stringMatching(/^🧠 Kcal Coach/),
    );
    expect(healthDashboard.buildToday).not.toHaveBeenCalled();

    lineService.replyText.mockClear();
    healthDashboard.buildToday.mockClear();
    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้กินอะไรดี',
    );
    expect(healthDashboard.buildToday).not.toHaveBeenCalled();
  });

  it('handles ประวัติ command with today FoodLogs only for that user', async () => {
    foodLogService.listForUserOnDate.mockResolvedValue([
      {
        eatenAt: new Date('2026-09-19T01:30:00.000Z'),
        foodName: 'ไข่ 2 ฟอง',
        calories: 140,
      },
    ]);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ประวัติ',
    );

    expect(foodLogService.listForUserOnDate).toHaveBeenCalledWith('user-a');
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('ไข่ 2 ฟอง'),
    );
  });

  it('answers natural-language calorie question from DB', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);
    messageClassifyService.classify.mockResolvedValue({
      type: 'coach',
      weightKg: null,
      weightQuery: null,
      coachHint: 'calories_consumed',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้กินไปกี่แคล',
    );

    expect(dailySummaryService.getDailySummary).toHaveBeenCalledWith('user-a');
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('1,250'),
    );
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('answers natural-language protein remaining from DB', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);
    messageClassifyService.classify.mockResolvedValue({
      type: 'coach',
      weightKg: null,
      weightQuery: null,
      coachHint: 'protein_remaining',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'โปรตีนเหลือเท่าไร',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('58'),
    );
  });

  it('meal recommendation uses template without OpenAI', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'มื้อเย็นกินอะไรดี',
    );

    expect(dailySummaryService.getDailySummary).toHaveBeenCalledWith('user-a');
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringMatching(/เหลือวันนี้[\s\S]*มื้อถัดไป[\s\S]*ไก่/),
    );
  });

  it('keeps numeric today summary with deterministic tip', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('1,250 / 2,000 kcal'),
    );
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
  });

  it('asks for profile when NutritionProfile is missing', async () => {
    dailySummaryService.getDailySummary.mockRejectedValue(
      new NutritionProfileMissingError(),
    );

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      PROFILE_REQUIRED_TEXT,
    );
  });

  it('does not query another user when answering coach questions', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);
    messageClassifyService.classify.mockResolvedValue({
      type: 'coach',
      weightKg: null,
      weightQuery: null,
      coachHint: 'calories_remaining',
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้เหลือกี่แคล',
    );

    expect(dailySummaryService.getDailySummary).toHaveBeenCalledTimes(1);
    expect(dailySummaryService.getDailySummary).toHaveBeenCalledWith('user-a');
    expect(dailySummaryService.getDailySummary).not.toHaveBeenCalledWith(
      'user-b',
    );
  });

  it('records natural-language weight for the authenticated user only', async () => {
    weightLogService.createForUser.mockResolvedValue({
      id: 'w1',
      userId: 'user-a',
      weightKg: 84.2,
      recordedAt: new Date('2026-09-19T10:00:00.000Z'),
      createdAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'น้ำหนัก 84.2',
    );

    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(weightLogService.createForUser).toHaveBeenCalledWith('user-a', 84.2);
    expect(weightLogService.createForUser).not.toHaveBeenCalledWith(
      'user-b',
      expect.anything(),
    );
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('บันทึกน้ำหนักแล้ว'),
    );
    expect(sheetsSync.enqueue).toHaveBeenCalled();
  });

  it('keeps WeightLog success when Sheets sync fails', async () => {
    weightLogService.createForUser.mockResolvedValue({
      id: 'w2',
      userId: 'user-a',
      weightKg: 83,
      recordedAt: new Date(),
      createdAt: new Date(),
    });
    sheetsSync.appendWeightLog.mockRejectedValue(new Error('sheets down'));

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'น้ำหนัก 83',
    );

    expect(weightLogService.createForUser).toHaveBeenCalled();
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('บันทึกน้ำหนักแล้ว'),
    );
  });

  it('shows weight overview for น้ำหนัก command', async () => {
    weightLogService.getTodayAverageKg.mockResolvedValue(84.2);
    weightLogService.getRecentDailyAverages.mockResolvedValue([
      {
        dateKey: '2026-09-19',
        parts: { year: 2026, month: 9, day: 19 },
        averageKg: 84.2,
        count: 1,
      },
    ]);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'น้ำหนัก',
    );

    expect(weightLogService.getRecentDailyAverages).toHaveBeenCalledWith(
      'user-a',
      7,
    );
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('วันนี้: 84.2 kg'),
    );
  });

  it('answers น้ำหนักล่าสุด from DB for current user', async () => {
    weightLogService.getLatestForUser.mockResolvedValue({
      weightKg: 83.8,
      recordedAt: new Date('2026-09-19T08:00:00.000Z'),
    });
    messageClassifyService.classify.mockResolvedValue({
      type: 'weight_query',
      weightKg: null,
      weightQuery: 'latest',
      coachHint: null,
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'น้ำหนักล่าสุด',
    );

    expect(weightLogService.getLatestForUser).toHaveBeenCalledWith('user-a');
    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('83.8'),
    );
  });

  it('uses AI classify for ambiguous weight log (not food analysis)', async () => {
    messageClassifyService.classify.mockResolvedValue({
      type: 'weight_log',
      weightKg: 84.5,
      weightQuery: null,
      coachHint: null,
    });
    weightLogService.createForUser.mockResolvedValue({
      weightKg: 84.5,
      recordedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'เมื่อเช้าชั่งเครื่องชั่งได้ประมาณแปดสิบสี่จุดห้า',
    );

    expect(messageClassifyService.classify).toHaveBeenCalled();
    expect(weightLogService.createForUser).toHaveBeenCalledWith('user-a', 84.5);
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('does not send weight-domain text to food analysis', async () => {
    messageClassifyService.classify.mockResolvedValue({
      type: 'weight_query',
      weightKg: null,
      weightQuery: 'latest',
      coachHint: null,
    });
    weightLogService.getLatestForUser.mockResolvedValue({
      weightKg: 84,
      recordedAt: new Date('2026-09-19T08:00:00.000Z'),
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'น้ำหนักของฉันเท่าไรตอนนี้แล้ว',
    );

    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
    expect(weightLogService.getLatestForUser).toHaveBeenCalledWith('user-a');
  });

  it('includes today weight line in วันนี้ when present', async () => {
    dailySummaryService.getDailySummary.mockResolvedValue(sampleSummary);
    weightLogService.getTodayAverageKg.mockResolvedValue(84.2);

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'วันนี้',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      expect.stringContaining('⚖️ 84.2 kg'),
    );
  });

  it('asks for clarification on bare number without pending food', async () => {
    await service.handleCompletedText(completedUser as never, 'token', '84.2');

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      AMBIGUOUS_NUMBER_TEXT,
    );
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(weightLogService.createForUser).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('treats bare number as quantity when pending food exists', async () => {
    pendingFoodService.getActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 10,
      quantityUnit: 'piece',
    });
    pendingFoodService.requireActiveForUser.mockResolvedValue({
      userId: 'user-a',
      originalQuantity: 10,
      quantityUnit: 'piece',
    });
    pendingFoodService.applyConsumedQuantity.mockResolvedValue({
      originalQuantity: 10,
      consumedQuantity: 3,
      quantityUnit: 'piece',
    });
    pendingFoodService.toAnalysisResult.mockReturnValue({
      foodName: 'ซูชิ',
      estimatedCalories: 180,
      proteinG: 12,
      carbsG: 20,
      fatG: 4,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 3,
      quantityUnit: 'piece',
    });

    await service.handleCompletedText(completedUser as never, 'token', '3');

    expect(pendingFoodService.applyConsumedQuantity).toHaveBeenCalledWith(
      'user-a',
      3,
    );
    expect(lineService.replyButtonsOrPush).toHaveBeenCalled();
  });

  it('analyzes photo with exactly one vision call and no classify', async () => {
    lineService.getMessageContentPreviewBytes.mockResolvedValue(
      Buffer.from('fake-image'),
    );
    foodAnalysisService.analyzeImage.mockResolvedValue({
      foodName: 'ข้าวมันไก่',
      estimatedCalories: 600,
      proteinG: 30,
      carbsG: 60,
      fatG: 20,
      confidence: 0.8,
      assumptions: [],
      estimatedQuantity: 1,
      quantityUnit: 'plate',
    });
    pendingFoodService.upsertPending.mockResolvedValue({
      originalQuantity: 1,
      consumedQuantity: 1,
      quantityUnit: 'plate',
    });

    await service.handleImage(completedUser as never, 'token', 'msg-img-1');

    expect(foodAnalysisService.analyzeImage).toHaveBeenCalledTimes(1);
    expect(messageClassifyService.classify).not.toHaveBeenCalled();
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('rate-limits expensive food analysis with a friendly message', async () => {
    messageClassifyService.classify.mockResolvedValue({
      type: 'food',
      weightKg: null,
      weightQuery: null,
      coachHint: null,
    });
    for (let i = 0; i < 8; i++) {
      aiRateLimiter.tryConsume('U-line-a', 'food_text');
    }

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'ข้าวผัดกุ้ง',
    );

    expect(lineService.replyText).toHaveBeenCalledWith(
      'token',
      FOOD_RATE_LIMITED_TEXT,
    );
    expect(foodAnalysisService.analyzeText).not.toHaveBeenCalled();
  });

  it('still accepts explicit weight phrases like น้ำหนัก 84.2', async () => {
    weightLogService.createForUser.mockResolvedValue({
      weightKg: 84.2,
      recordedAt: new Date('2026-09-19T10:00:00.000Z'),
    });

    await service.handleCompletedText(
      completedUser as never,
      'token',
      'น้ำหนัก 84.2',
    );

    expect(weightLogService.createForUser).toHaveBeenCalledWith('user-a', 84.2);
  });
});
