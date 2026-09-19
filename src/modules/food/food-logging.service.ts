import { Injectable, Logger } from '@nestjs/common';
import { OnboardingState, User } from '@prisma/client';
import { aiRateLimiter } from '../../common/ai-rate-limiter';
import { LineOutboundError } from '../line/line-outbound.error';
import { LineService } from '../line/line.service';
import { SheetsSyncService } from '../sheets/sheets-sync.service';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { WeightLogService } from '../weight/weight-log.service';
import {
  detectWeightQuestionIntent,
  isWeightDomainText,
  parseWeightInput,
} from '../weight/weight-parse';
import {
  buildLatestWeightMessage,
  buildProgressSinceFirstMessage,
  buildTargetProgressMessage,
  buildTodayWeightLine,
  buildTrendMessage,
  buildWeightOverviewMessage,
  buildWeightSavedMessage,
  INSUFFICIENT_TREND_TEXT,
  INVALID_WEIGHT_TEXT,
  NO_WEIGHT_DATA_TEXT,
  WEIGHT_HELP_TEXT,
  WEIGHT_QUERY_ERROR_TEXT,
  WEIGHT_SAVE_ERROR_TEXT,
} from '../weight/weight.messages';
import { detectCoachIntent } from './coach-intent';
import { parseCoachHint, CoachHint } from './coach-hint';
import {
  buildCaloriesConsumedMessage,
  buildCaloriesRemainingMessage,
  buildDailyCoachSummaryMessage,
  buildDeterministicCoachTip,
  buildHistoryMessage,
  buildProteinConsumedMessage,
  buildProteinRemainingMessage,
  DAILY_SUMMARY_ERROR_TEXT,
  PROFILE_REQUIRED_TEXT,
} from './daily-coach.messages';
import { DailyCoachService } from './daily-coach.service';
import {
  DailySummaryService,
  NutritionProfileMissingError,
} from './daily-summary.service';
import { DailyTotalsService } from './daily-totals.service';
import {
  FoodAnalysisError,
  FoodAnalysisService,
} from './food-analysis.service';
import { FoodAnalysisValidationError } from './food-analysis.validator';
import { FoodLogService } from './food-log.service';
import {
  AMBIGUOUS_NUMBER_TEXT,
  buildFoodEstimateMessage,
  buildFoodSavedMessage,
  buildProfileMessage,
  buildQuantityAdjustedMessage,
  COMPLETE_PROFILE_FIRST_TEXT,
  FOOD_ANALYSIS_FAILED_TEXT,
  FOOD_CANCELLED_TEXT,
  FOOD_CONFIRM_CHOICES,
  FOOD_EDIT_HELP_TEXT,
  FOOD_INVALID_CONFIRM_TEXT,
  FOOD_QUANTITY_CLARIFY_TEXT,
  FOOD_RATE_LIMITED_TEXT,
  GENERAL_HELP_TEXT,
  LOG_FOOD_HINT_TEXT,
  MEDICAL_ADVICE_TEXT,
  NO_PENDING_FOOD_TEXT,
  REPLACE_PENDING_CHOICES,
  REPLACE_PENDING_TEXT,
  SYSTEM_BUSY_TEXT,
} from './food.messages';
import { parseFoodEdit } from './food-edit';
import {
  MessageClassifyError,
  MessageClassifyService,
} from './message-classify.service';
import {
  PendingFoodConfirmError,
  PendingFoodService,
} from './pending-food.service';
import { pendingReplaceBuffer } from './pending-replace.buffer';
import {
  parseQuantityAdjustment,
  resolveConsumedQuantity,
} from './quantity-adjustment';

export const FOOD_COMMANDS = {
  START: ['เริ่ม', 'แก้ไขโปรไฟล์'],
  TODAY: ['วันนี้', '📊 วันนี้', '🍽️ วันนี้'],
  PROFILE: ['โปรไฟล์', '👤 โปรไฟล์', 'เป้าหมาย', '🎯 เป้าหมาย'],
  WEIGHT: ['น้ำหนัก', '⚖️ น้ำหนัก'],
  HISTORY: ['ประวัติ', '📋 ประวัติ'],
  LOG_FOOD_HINT: ['🍽️ บันทึกอาหาร', '📸 บันทึกอาหาร'],
  CONFIRM: 'บันทึก',
  CANCEL: ['ยกเลิก', 'ไม่บันทึก', 'cancel', 'แก้ไข/ยกเลิก'],
  EDIT: 'แก้ไข',
  REPLACE_OLD: 'ยกเลิกรายการเดิม',
  KEEP_PENDING: 'กลับไปยืนยัน',
} as const;

@Injectable()
export class FoodLoggingService {
  private readonly logger = new Logger(FoodLoggingService.name);

  constructor(
    private readonly foodAnalysisService: FoodAnalysisService,
    private readonly messageClassifyService: MessageClassifyService,
    private readonly pendingFoodService: PendingFoodService,
    private readonly foodLogService: FoodLogService,
    private readonly dailyTotalsService: DailyTotalsService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly dailyCoachService: DailyCoachService,
    private readonly weightLogService: WeightLogService,
    private readonly sheetsSync: SheetsSyncService,
    private readonly nutritionProfileService: NutritionProfileService,
    private readonly lineService: LineService,
  ) {}

  isConfirm(text: string): boolean {
    return text.trim() === FOOD_COMMANDS.CONFIRM;
  }

  isCancel(text: string): boolean {
    return (FOOD_COMMANDS.CANCEL as readonly string[]).includes(text.trim());
  }

  isEdit(text: string): boolean {
    return text.trim() === FOOD_COMMANDS.EDIT;
  }

  async handleCompletedText(
    user: User,
    replyToken: string,
    text: string,
  ): Promise<'handled' | 'not_command'> {
    const normalized = text.trim();

    if (normalized === FOOD_COMMANDS.REPLACE_OLD) {
      await this.handleReplacePendingConfirm(user, replyToken);
      return 'handled';
    }

    if (normalized === FOOD_COMMANDS.KEEP_PENDING) {
      await this.handleKeepPending(user.id, replyToken);
      return 'handled';
    }

    if (this.isConfirm(normalized)) {
      await this.confirmPending(
        user.id,
        replyToken,
        user.lineUserId ?? undefined,
      );
      return 'handled';
    }

    if (this.isCancel(normalized)) {
      await this.cancelPending(user.id, replyToken);
      return 'handled';
    }

    if (this.isEdit(normalized)) {
      await this.lineService.replyText(replyToken, FOOD_EDIT_HELP_TEXT);
      return 'handled';
    }

    if ((FOOD_COMMANDS.TODAY as readonly string[]).includes(normalized)) {
      await this.replyTodaySummary(
        user.id,
        replyToken,
        user.lineUserId ?? user.id,
      );
      return 'handled';
    }

    if ((FOOD_COMMANDS.PROFILE as readonly string[]).includes(normalized)) {
      await this.replyProfile(user.id, replyToken);
      return 'handled';
    }

    if ((FOOD_COMMANDS.WEIGHT as readonly string[]).includes(normalized)) {
      await this.replyWeightOverview(user.id, replyToken);
      return 'handled';
    }

    if ((FOOD_COMMANDS.HISTORY as readonly string[]).includes(normalized)) {
      await this.replyHistory(user.id, replyToken);
      return 'handled';
    }

    if (
      (FOOD_COMMANDS.LOG_FOOD_HINT as readonly string[]).includes(normalized)
    ) {
      await this.lineService.replyText(replyToken, LOG_FOOD_HINT_TEXT);
      return 'handled';
    }

    if ((FOOD_COMMANDS.START as readonly string[]).includes(normalized)) {
      return 'not_command';
    }

    // Medical-safety gate before AI.
    if (detectCoachIntent(normalized) === 'medical') {
      await this.lineService.replyText(replyToken, MEDICAL_ADVICE_TEXT);
      return 'handled';
    }

    // Deterministic coach NL (DB facts) before classify — saves tokens.
    const coachIntent = detectCoachIntent(normalized);
    if (coachIntent !== 'none' && coachIntent !== 'medical') {
      await this.handleCoachIntent(
        user.id,
        replyToken,
        coachIntent,
        user.lineUserId ?? user.id,
        normalized,
      );
      return 'handled';
    }

    // If there is an active pending analysis, try quantity/edit first.
    const pending = await this.pendingFoodService.getActiveForUser(user.id);
    if (pending) {
      const handled = await this.handlePendingAdjustment(
        user.id,
        replyToken,
        normalized,
        user.lineUserId ?? user.id,
      );
      if (handled) {
        return 'handled';
      }
    }

    // Bare number without pending context is ambiguous (weight vs quantity).
    if (/^\d+(?:\.\d+)?$/.test(normalized)) {
      await this.lineService.replyText(replyToken, AMBIGUOUS_NUMBER_TEXT);
      return 'handled';
    }

    // Free fast-path: obvious weight number patterns (no classify tokens).
    const weightParsed = parseWeightInput(normalized);
    if (weightParsed.kind === 'invalid') {
      await this.lineService.replyText(replyToken, INVALID_WEIGHT_TEXT);
      return 'handled';
    }
    if (weightParsed.kind === 'weight') {
      await this.recordWeight(user.id, replyToken, weightParsed.weightKg);
      return 'handled';
    }

    // Ambiguous free text → cheap AI classify (type + optional weightKg).
    const lineUserId = user.lineUserId ?? user.id;
    if (!aiRateLimiter.tryConsume(lineUserId, 'classify')) {
      await this.lineService.replyText(replyToken, FOOD_RATE_LIMITED_TEXT);
      return 'handled';
    }
    await this.routeByClassification(
      user.id,
      replyToken,
      normalized,
      lineUserId,
    );
    return 'handled';
  }

  private async routeByClassification(
    userId: string,
    replyToken: string,
    text: string,
    lineUserId: string,
  ): Promise<void> {
    try {
      const classified = await this.messageClassifyService.classify(text);
      this.logger.log(
        `Classified type=${classified.type} weightKg=${classified.weightKg ?? '-'} query=${classified.weightQuery ?? '-'} coach=${classified.coachHint ?? '-'}`,
      );

      if (classified.type === 'weight_log') {
        if (classified.weightKg == null) {
          await this.lineService.replyText(replyToken, WEIGHT_HELP_TEXT);
          return;
        }
        await this.recordWeight(userId, replyToken, classified.weightKg);
        return;
      }

      if (classified.type === 'weight_query') {
        const query = classified.weightQuery ?? 'latest';
        if (query === 'overview') {
          await this.replyWeightOverview(userId, replyToken);
          return;
        }
        await this.handleWeightQuestion(userId, replyToken, query);
        return;
      }

      if (classified.type === 'coach') {
        const hint = parseCoachHint(classified.coachHint);
        if (hint) {
          await this.handleCoachIntent(
            userId,
            replyToken,
            hint,
            lineUserId,
            text,
          );
          return;
        }
        await this.replyTodaySummary(userId, replyToken, lineUserId);
        return;
      }

      if (classified.type === 'food') {
        await this.offerReplaceOrAnalyze(
          userId,
          replyToken,
          { kind: 'text', text },
          lineUserId,
        );
        return;
      }

      // other
      if (isWeightDomainText(text)) {
        await this.lineService.replyText(replyToken, WEIGHT_HELP_TEXT);
        return;
      }
      await this.lineService.replyText(replyToken, GENERAL_HELP_TEXT);
    } catch (error) {
      if (error instanceof MessageClassifyError) {
        this.logger.warn(`Classify unavailable, using rule fallback`);
        await this.routeWithoutClassify(userId, replyToken, text, lineUserId);
        return;
      }
      this.logger.error(
        `Classify route failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.lineService.replyText(replyToken, FOOD_ANALYSIS_FAILED_TEXT);
    }
  }

  /** Fallback when OpenAI classify is down — keep old deterministic routing. */
  private async routeWithoutClassify(
    userId: string,
    replyToken: string,
    text: string,
    lineUserId: string,
  ): Promise<void> {
    const weightQuestion = detectWeightQuestionIntent(text);
    if (weightQuestion !== 'none') {
      await this.handleWeightQuestion(userId, replyToken, weightQuestion);
      return;
    }
    if (isWeightDomainText(text)) {
      await this.lineService.replyText(replyToken, WEIGHT_HELP_TEXT);
      return;
    }
    const coachIntent = detectCoachIntent(text);
    if (coachIntent === 'medical') {
      await this.lineService.replyText(replyToken, MEDICAL_ADVICE_TEXT);
      return;
    }
    if (coachIntent !== 'none') {
      await this.handleCoachIntent(
        userId,
        replyToken,
        coachIntent,
        lineUserId,
        text,
      );
      return;
    }
    await this.offerReplaceOrAnalyze(
      userId,
      replyToken,
      { kind: 'text', text },
      lineUserId,
    );
  }

  async handleImage(
    user: User,
    replyToken: string,
    messageId: string,
  ): Promise<void> {
    if (user.onboardingState !== OnboardingState.COMPLETED) {
      await this.lineService.replyText(replyToken, COMPLETE_PROFILE_FIRST_TEXT);
      return;
    }

    try {
      await this.offerReplaceOrAnalyze(
        user.id,
        replyToken,
        { kind: 'image', messageId },
        user.lineUserId ?? user.id,
      );
    } catch (error) {
      if (error instanceof LineOutboundError) {
        throw error;
      }
      this.logger.error(
        `Image food analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, FOOD_ANALYSIS_FAILED_TEXT);
    }
  }

  async assertCompletedOrReply(
    user: User,
    replyToken: string,
  ): Promise<boolean> {
    if (user.onboardingState === OnboardingState.COMPLETED) {
      return true;
    }
    await this.lineService.replyText(replyToken, COMPLETE_PROFILE_FIRST_TEXT);
    return false;
  }

  private async replyTodaySummary(
    userId: string,
    replyToken: string,
    lineUserId?: string,
  ): Promise<void> {
    try {
      const summary = await this.dailySummaryService.getDailySummary(userId);
      const tip =
        lineUserId && !aiRateLimiter.tryConsume(lineUserId, 'coach')
          ? buildDeterministicCoachTip(summary)
          : await this.dailyCoachService.buildTodayCoachTip(summary);
      const todayWeightKg =
        await this.weightLogService.getTodayAverageKg(userId);
      const weightLine =
        todayWeightKg != null
          ? `\n\n${buildTodayWeightLine(todayWeightKg)}`
          : '';
      // AI failure must not break numeric summary — tip already falls back.
      await this.lineService.replyText(
        replyToken,
        `${buildDailyCoachSummaryMessage(summary)}${weightLine}\n\n${tip}`,
      );
    } catch (error) {
      if (error instanceof NutritionProfileMissingError) {
        await this.lineService.replyText(replyToken, PROFILE_REQUIRED_TEXT);
        return;
      }
      this.logger.error(
        `Today summary failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      // Last-resort: try Phase 3 totals path without AI.
      try {
        const legacy = await this.dailyTotalsService.getSummaryForUser(userId);
        if (!legacy.targets) {
          await this.lineService.replyText(replyToken, PROFILE_REQUIRED_TEXT);
          return;
        }
        const summary = {
          date: new Date(),
          consumed: {
            calories: legacy.totals.calories,
            proteinG: legacy.totals.proteinG,
            carbsG: legacy.totals.carbsG,
            fatG: legacy.totals.fatG,
          },
          target: {
            calories: legacy.targets.dailyCalories,
            proteinG: legacy.targets.dailyProteinG,
            carbsG: legacy.targets.dailyCarbsG,
            fatG: legacy.targets.dailyFatG,
          },
          remaining: {
            calories: legacy.targets.dailyCalories - legacy.totals.calories,
            proteinG: legacy.targets.dailyProteinG - legacy.totals.proteinG,
            carbsG: legacy.targets.dailyCarbsG - legacy.totals.carbsG,
            fatG: legacy.targets.dailyFatG - legacy.totals.fatG,
          },
        };
        await this.lineService.replyText(
          replyToken,
          `${buildDailyCoachSummaryMessage(summary)}\n\n${buildDeterministicCoachTip(summary)}`,
        );
      } catch {
        await this.lineService.replyText(replyToken, DAILY_SUMMARY_ERROR_TEXT);
      }
    }
  }

  private async recordWeight(
    userId: string,
    replyToken: string,
    weightKg: number,
  ): Promise<void> {
    try {
      const log = await this.weightLogService.createForUser(userId, weightKg);
      this.sheetsSync.enqueue('appendWeightLog', async () => {
        await this.sheetsSync.appendWeightLog(log);
      });
      await this.lineService.replyText(
        replyToken,
        buildWeightSavedMessage(log.weightKg, log.recordedAt),
      );
    } catch (error) {
      this.logger.error(
        `Weight save failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, WEIGHT_SAVE_ERROR_TEXT);
    }
  }

  private async replyWeightOverview(
    userId: string,
    replyToken: string,
  ): Promise<void> {
    try {
      const [todayAverageKg, recentDays, trend, progress] = await Promise.all([
        this.weightLogService.getTodayAverageKg(userId),
        this.weightLogService.getRecentDailyAverages(userId, 7),
        this.weightLogService.getSevenDayTrend(userId),
        this.weightLogService.getTargetProgress(userId),
      ]);

      await this.lineService.replyText(
        replyToken,
        buildWeightOverviewMessage({
          todayAverageKg,
          recentDays,
          trend,
          progress,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Weight overview failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, WEIGHT_QUERY_ERROR_TEXT);
    }
  }

  private async handleWeightQuestion(
    userId: string,
    replyToken: string,
    intent: Exclude<ReturnType<typeof detectWeightQuestionIntent>, 'none'>,
  ): Promise<void> {
    try {
      if (intent === 'latest') {
        const latest = await this.weightLogService.getLatestForUser(userId);
        if (!latest) {
          await this.lineService.replyText(replyToken, NO_WEIGHT_DATA_TEXT);
          return;
        }
        await this.lineService.replyText(
          replyToken,
          buildLatestWeightMessage(latest.weightKg, latest.recordedAt),
        );
        return;
      }

      if (intent === 'trend') {
        const trend = await this.weightLogService.getSevenDayTrend(userId);
        if (!trend) {
          await this.lineService.replyText(replyToken, INSUFFICIENT_TREND_TEXT);
          return;
        }
        await this.lineService.replyText(replyToken, buildTrendMessage(trend));
        return;
      }

      if (intent === 'progress') {
        const change = await this.weightLogService.getChangeSinceFirst(userId);
        const target = await this.weightLogService.getTargetProgress(userId);
        if (!change) {
          await this.lineService.replyText(replyToken, NO_WEIGHT_DATA_TEXT);
          return;
        }
        const parts = [buildProgressSinceFirstMessage(change)];
        if (target) {
          parts.push(buildTargetProgressMessage(target));
        }
        await this.lineService.replyText(replyToken, parts.join('\n\n'));
      }
    } catch (error) {
      this.logger.error(
        `Weight question failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, WEIGHT_QUERY_ERROR_TEXT);
    }
  }

  private async replyHistory(
    userId: string,
    replyToken: string,
  ): Promise<void> {
    try {
      const logs = await this.foodLogService.listForUserOnDate(userId);
      await this.lineService.replyText(replyToken, buildHistoryMessage(logs));
    } catch (error) {
      this.logger.error(
        `History failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, DAILY_SUMMARY_ERROR_TEXT);
    }
  }

  private async handleCoachIntent(
    userId: string,
    replyToken: string,
    intent: CoachHint,
    lineUserId: string,
    userQuestion?: string,
  ): Promise<void> {
    try {
      if (intent === 'history' || intent === 'today_summary') {
        if (intent === 'history') {
          await this.replyHistory(userId, replyToken);
        } else {
          await this.replyTodaySummary(userId, replyToken, lineUserId);
        }
        return;
      }

      const summary = await this.dailySummaryService.getDailySummary(userId);

      if (intent === 'calories_consumed') {
        await this.lineService.replyText(
          replyToken,
          buildCaloriesConsumedMessage(summary),
        );
        return;
      }
      if (intent === 'calories_remaining') {
        await this.lineService.replyText(
          replyToken,
          buildCaloriesRemainingMessage(summary),
        );
        return;
      }
      if (intent === 'protein_consumed') {
        await this.lineService.replyText(
          replyToken,
          buildProteinConsumedMessage(summary),
        );
        return;
      }
      if (intent === 'protein_remaining') {
        await this.lineService.replyText(
          replyToken,
          buildProteinRemainingMessage(summary),
        );
        return;
      }
      if (intent === 'meal_recommendation') {
        if (!aiRateLimiter.tryConsume(lineUserId, 'coach')) {
          await this.lineService.replyText(replyToken, FOOD_RATE_LIMITED_TEXT);
          return;
        }
        const tip = await this.dailyCoachService.buildMealRecommendation(
          summary.remaining,
          userQuestion,
        );
        await this.lineService.replyText(replyToken, tip);
        return;
      }
    } catch (error) {
      if (error instanceof NutritionProfileMissingError) {
        await this.lineService.replyText(replyToken, PROFILE_REQUIRED_TEXT);
        return;
      }
      this.logger.error(
        `Coach intent failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, SYSTEM_BUSY_TEXT);
    }
  }

  private async handlePendingAdjustment(
    userId: string,
    replyToken: string,
    text: string,
    lineUserId: string,
  ): Promise<boolean> {
    const adjustment = parseQuantityAdjustment(text, {
      allowBareNumber: true,
    });

    if (adjustment.kind !== 'none') {
      if (adjustment.kind === 'ambiguous') {
        await this.lineService.replyText(
          replyToken,
          FOOD_QUANTITY_CLARIFY_TEXT,
        );
        return true;
      }

      if (adjustment.kind === 'composition') {
        await this.handleCompositionAdjustment(
          userId,
          replyToken,
          text,
          lineUserId,
        );
        return true;
      }

      try {
        const pending =
          await this.pendingFoodService.requireActiveForUser(userId);
        const originalQty = pending.originalQuantity ?? 1;

        if (adjustment.kind === 'all') {
          const restored =
            await this.pendingFoodService.restoreOriginalQuantity(userId);
          const analysis = this.pendingFoodService.toAnalysisResult(restored);
          await this.lineService.replyButtonsOrPush(
            replyToken,
            lineUserId,
            buildFoodEstimateMessage(analysis, restored),
            FOOD_CONFIRM_CHOICES,
          );
          return true;
        }

        const consumed = resolveConsumedQuantity(adjustment, originalQty);
        if (consumed == null || consumed <= 0) {
          await this.lineService.replyText(
            replyToken,
            FOOD_QUANTITY_CLARIFY_TEXT,
          );
          return true;
        }

        const updated = await this.pendingFoodService.applyConsumedQuantity(
          userId,
          consumed,
        );
        const analysis = this.pendingFoodService.toAnalysisResult(updated);
        await this.lineService.replyButtonsOrPush(
          replyToken,
          lineUserId,
          buildQuantityAdjustedMessage(analysis, updated),
          FOOD_CONFIRM_CHOICES,
        );
        return true;
      } catch (error) {
        this.logger.warn(
          `Quantity adjustment failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        await this.lineService.replyText(replyToken, NO_PENDING_FOOD_TEXT);
        return true;
      }
    }

    // Edit-before-save: calorie override / composition / clarify
    const edit = parseFoodEdit(text);
    if (edit.kind === 'none') {
      return false;
    }
    if (edit.kind === 'ambiguous') {
      await this.lineService.replyText(replyToken, FOOD_EDIT_HELP_TEXT);
      return true;
    }
    if (edit.kind === 'composition') {
      await this.handleCompositionAdjustment(
        userId,
        replyToken,
        edit.instruction,
        lineUserId,
      );
      return true;
    }
    if (edit.kind === 'calorie_override') {
      try {
        const updated = await this.pendingFoodService.applyCalorieOverride(
          userId,
          edit.calories,
        );
        const analysis = this.pendingFoodService.toAnalysisResult(updated);
        await this.lineService.replyButtonsOrPush(
          replyToken,
          lineUserId,
          buildFoodEstimateMessage(analysis, updated),
          FOOD_CONFIRM_CHOICES,
        );
      } catch {
        await this.lineService.replyText(replyToken, NO_PENDING_FOOD_TEXT);
      }
      return true;
    }
    return false;
  }

  private async handleCompositionAdjustment(
    userId: string,
    replyToken: string,
    instruction: string,
    lineUserId: string,
  ): Promise<void> {
    try {
      const pending =
        await this.pendingFoodService.requireActiveForUser(userId);
      const previous = this.pendingFoodService.toAnalysisResult({
        ...pending,
        calories: pending.originalCalories ?? pending.calories,
        proteinG: pending.originalProteinG ?? pending.proteinG,
        carbsG: pending.originalCarbsG ?? pending.carbsG,
        fatG: pending.originalFatG ?? pending.fatG,
        consumedQuantity: pending.originalQuantity,
      });

      const analysis =
        await this.foodAnalysisService.analyzeCompositionAdjustment({
          previous,
          instruction,
        });

      const updated =
        await this.pendingFoodService.replaceWithCompositionAnalysis(
          userId,
          analysis,
        );

      await this.lineService.replyButtonsOrPush(
        replyToken,
        lineUserId,
        buildFoodEstimateMessage(analysis, updated),
        FOOD_CONFIRM_CHOICES,
      );
    } catch (error) {
      this.logger.warn(
        `Composition adjustment failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, FOOD_ANALYSIS_FAILED_TEXT);
    }
  }

  /**
   * If pending exists, ask before replacing. Otherwise analyze immediately.
   */
  private async offerReplaceOrAnalyze(
    userId: string,
    replyToken: string,
    input:
      { kind: 'text'; text: string } | { kind: 'image'; messageId: string },
    lineUserId: string,
  ): Promise<void> {
    const pending = await this.pendingFoodService.getActiveForUser(userId);
    if (pending) {
      pendingReplaceBuffer.set(userId, input);
      await this.lineService.replyButtonsOrPush(
        replyToken,
        lineUserId,
        REPLACE_PENDING_TEXT,
        REPLACE_PENDING_CHOICES,
      );
      return;
    }

    if (input.kind === 'text') {
      await this.analyzeAndAskConfirmation(
        userId,
        replyToken,
        { kind: 'text', text: input.text },
        lineUserId,
      );
      return;
    }

    const imageBytes = await this.lineService.getMessageContentPreviewBytes(
      input.messageId,
    );
    await this.analyzeAndAskConfirmation(
      userId,
      replyToken,
      {
        kind: 'image',
        imageBytes,
        imageUrl: `line-message:${input.messageId}`,
      },
      lineUserId,
    );
  }

  private async handleReplacePendingConfirm(
    user: User,
    replyToken: string,
  ): Promise<void> {
    const buffered = pendingReplaceBuffer.take(user.id);
    await this.pendingFoodService.clearForUser(user.id);
    if (!buffered) {
      await this.lineService.replyText(replyToken, LOG_FOOD_HINT_TEXT);
      return;
    }

    const lineUserId = user.lineUserId ?? user.id;
    if (buffered.kind === 'text') {
      await this.analyzeAndAskConfirmation(
        user.id,
        replyToken,
        { kind: 'text', text: buffered.text },
        lineUserId,
      );
      return;
    }

    try {
      const imageBytes = await this.lineService.getMessageContentPreviewBytes(
        buffered.messageId,
      );
      await this.analyzeAndAskConfirmation(
        user.id,
        replyToken,
        {
          kind: 'image',
          imageBytes,
          imageUrl: `line-message:${buffered.messageId}`,
        },
        lineUserId,
      );
    } catch (error) {
      this.logger.error(
        `Replace-pending image failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.lineService.replyText(replyToken, FOOD_ANALYSIS_FAILED_TEXT);
    }
  }

  private async handleKeepPending(
    userId: string,
    replyToken: string,
  ): Promise<void> {
    pendingReplaceBuffer.clear(userId);
    const pending = await this.pendingFoodService.getActiveForUser(userId);
    if (!pending) {
      await this.lineService.replyText(replyToken, NO_PENDING_FOOD_TEXT);
      return;
    }
    const analysis = this.pendingFoodService.toAnalysisResult(pending);
    await this.lineService.replyButtons(
      replyToken,
      buildFoodEstimateMessage(analysis, pending),
      FOOD_CONFIRM_CHOICES,
    );
  }

  private async analyzeAndAskConfirmation(
    userId: string,
    replyToken: string,
    input:
      | { kind: 'text'; text: string }
      | { kind: 'image'; imageBytes: Buffer; imageUrl?: string },
    lineUserId?: string,
  ): Promise<void> {
    const rateKey = lineUserId ?? userId;
    const bucket = input.kind === 'image' ? 'food_image' : 'food_text';
    if (!aiRateLimiter.tryConsume(rateKey, bucket)) {
      await this.lineService.replyText(replyToken, FOOD_RATE_LIMITED_TEXT);
      return;
    }

    try {
      const analysis =
        input.kind === 'text'
          ? await this.foodAnalysisService.analyzeText(input.text)
          : await this.foodAnalysisService.analyzeImage({
              imageBytes: input.imageBytes,
            });

      const pending = await this.pendingFoodService.upsertPending(
        userId,
        analysis,
        input.kind === 'image' ? input.imageUrl : undefined,
      );

      await this.lineService.replyButtonsOrPush(
        replyToken,
        lineUserId ?? userId,
        buildFoodEstimateMessage(analysis, pending),
        FOOD_CONFIRM_CHOICES,
      );
    } catch (error) {
      if (error instanceof LineOutboundError) {
        throw error;
      }
      if (
        error instanceof FoodAnalysisValidationError ||
        error instanceof FoodAnalysisError
      ) {
        this.logger.warn(`Food analysis rejected: ${error.message}`);
      } else {
        this.logger.error(
          `Food analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      await this.lineService.replyText(replyToken, FOOD_ANALYSIS_FAILED_TEXT);
    }
  }

  private async confirmPending(
    userId: string,
    replyToken: string,
    lineUserId?: string,
  ): Promise<void> {
    let confirmed: Awaited<
      ReturnType<PendingFoodService['confirmPendingAtomic']>
    > | null = null;

    try {
      confirmed = await this.pendingFoodService.confirmPendingAtomic(userId);
    } catch (error) {
      if (error instanceof PendingFoodConfirmError) {
        this.logger.warn(
          `Confirm pending rejected code=${error.code} userPrefix=${userId.slice(0, 8)}`,
        );
      } else {
        this.logger.warn(
          `Confirm pending failed for userPrefix=${userId.slice(0, 8)}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      await this.lineService.replyText(replyToken, NO_PENDING_FOOD_TEXT);
      return;
    }

    const { foodLog, analysis } = confirmed;

    this.sheetsSync.enqueue('appendFoodLog', async () => {
      await this.sheetsSync.appendFoodLog(foodLog);
      await this.sheetsSync.updateDailySummary(userId, foodLog.eatenAt);
    });

    // Mutation is durable — reply failures must not undo or re-run confirm.
    try {
      const summary = await this.dailyTotalsService.getSummaryForUser(userId);
      const message = buildFoodSavedMessage(analysis, summary);
      if (lineUserId) {
        await this.lineService.replyTextOrPush(replyToken, lineUserId, message);
      } else {
        await this.lineService.replyText(replyToken, message);
      }
    } catch (error) {
      if (error instanceof LineOutboundError) {
        this.logger.warn(
          `LINE outbound failed after FoodLog confirm foodLogId=${foodLog.id}`,
        );
        throw error;
      }
      this.logger.warn(
        `Post-confirm reply path failed foodLogId=${foodLog.id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new LineOutboundError(
        'Post-confirm reply failed after durable FoodLog create',
        error,
      );
    }
  }

  private async cancelPending(
    userId: string,
    replyToken: string,
  ): Promise<void> {
    pendingReplaceBuffer.clear(userId);
    const pending = await this.pendingFoodService.getActiveForUser(userId);
    if (!pending) {
      await this.lineService.replyText(replyToken, NO_PENDING_FOOD_TEXT);
      return;
    }
    await this.pendingFoodService.clearForUser(userId);
    await this.lineService.replyText(replyToken, FOOD_CANCELLED_TEXT);
  }

  private async replyProfile(
    userId: string,
    replyToken: string,
  ): Promise<void> {
    try {
      const profile = await this.nutritionProfileService.findByUserId(userId);
      await this.lineService.replyText(
        replyToken,
        buildProfileMessage({
          currentWeightKg: profile.currentWeightKg,
          targetWeightKg: profile.targetWeightKg,
          dailyCalories: profile.dailyCalories,
          dailyProteinG: profile.dailyProteinG,
          dailyCarbsG: profile.dailyCarbsG,
          dailyFatG: profile.dailyFatG,
        }),
      );
    } catch {
      await this.lineService.replyText(replyToken, PROFILE_REQUIRED_TEXT);
    }
  }

  async replyInvalidConfirm(replyToken: string): Promise<void> {
    await this.lineService.replyButtons(
      replyToken,
      FOOD_INVALID_CONFIRM_TEXT,
      FOOD_CONFIRM_CHOICES,
    );
  }
}
