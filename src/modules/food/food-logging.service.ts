import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FoodLog, OnboardingState, User } from '@prisma/client';
import OpenAI from 'openai';
import { aiRateLimiter } from '../../common/ai-rate-limiter';
import { LineOutboundError } from '../line/line-outbound.error';
import { LineService } from '../line/line.service';
import { AiGatewayService } from '../membership/ai-gateway.service';
import {
  reportAiTokenUsage,
  usageFromOpenAiCompletion,
} from '../membership/ai-token-capture';
import { AiQuotaExceededError } from '../membership/membership.errors';
import {
  buildQuotaExceededMessage,
  isMembershipCommand,
  parsePromoCommand,
} from '../membership/membership.messages';
import { MembershipService } from '../membership/membership.service';
import { SheetsSyncService } from '../sheets/sheets-sync.service';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { WeightLogService } from '../weight/weight-log.service';
import {
  HealthDashboardService,
  HealthInsightService,
} from '../health/health-dashboard.service';
import { HealthRoutingService } from '../health/health-routing.service';
import { isHealthCoachQuestion } from '../health/health-commands';
import { buildHealthDashboardFlex } from '../health/health.flex';
import {
  detectWeightQuestionIntent,
  isWeightDomainText,
  parseWeightInput,
} from '../weight/weight-parse';
import {
  buildLatestWeightMessage,
  buildProgressSinceFirstMessage,
  buildTargetProgressMessage,
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
  buildHistoryMessage,
  buildMealRecommendationFallback,
  buildProteinConsumedMessage,
  buildProteinRemainingMessage,
  DAILY_SUMMARY_ERROR_TEXT,
  PROFILE_REQUIRED_TEXT,
} from './daily-coach.messages';
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
import { isLikelyFoodText } from './food-text-heuristic';
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
  FOOD_EDIT_CANCELLED_TEXT,
  FOOD_EDIT_DELETED_TEXT,
  FOOD_EDIT_HELP_TEXT,
  FOOD_EDIT_NAME_PROMPT_TEXT,
  FOOD_EDIT_NOT_FOUND_TEXT,
  FOOD_EDIT_NUT_INVALID_TEXT,
  FOOD_EDIT_NUT_PROMPT_TEXT,
  FOOD_EDIT_QTY_INVALID_TEXT,
  FOOD_EDIT_QTY_PROMPT_TEXT,
  FOOD_EDIT_UPDATED_TEXT,
  FOOD_INVALID_CONFIRM_TEXT,
  FOOD_QUANTITY_CLARIFY_TEXT,
  FOOD_RATE_LIMITED_TEXT,
  GENERAL_HELP_TEXT,
  LOG_FOOD_HINT_TEXT,
  MEDICAL_ADVICE_TEXT,
  COACH_ENTRY_TEXT,
  NO_PENDING_FOOD_TEXT,
  REPLACE_PENDING_CHOICES,
  REPLACE_PENDING_TEXT,
  SYSTEM_BUSY_TEXT,
} from './food.messages';
import { parseFoodEdit } from './food-edit';
import {
  parseFoodEditCommand,
  FOOD_EDIT_CANCEL_TEXT,
  foodEditDelOkText,
  foodEditNameText,
  foodEditNutText,
  foodEditQtyText,
} from './food-edit.commands';
import {
  buildFoodDeleteConfirmFlex,
  buildFoodEditMenuFlex,
  buildTodayFoodEditListFlex,
} from './food-edit.flex';
import { parseNutritionEdit } from './food-edit.nutrition-parse';
import { foodEditSessionBuffer } from './food-edit.session';
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
  applyProportionalNutrition,
  parseQuantityAdjustment,
  resolveConsumedQuantity,
} from './quantity-adjustment';

export const FOOD_COMMANDS = {
  START: ['เริ่ม', 'แก้ไขโปรไฟล์'],
  TODAY: ['วันนี้', '📊 วันนี้', '🍽️ วันนี้'],
  /** Rich Menu 🍽️ อาหาร — entry hint only; never Food AI. */
  FOOD_ENTRY: ['อาหาร', '🍽️ อาหาร'],
  /** Rich Menu 🧠 โค้ช — entry hint only; never Daily / AI. */
  COACH_ENTRY: ['โค้ช', '🧠 โค้ช'],
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

/** Exact Rich Menu / shortcut command (trim only — no partial match). */
export function isExactFoodCommand(
  text: string,
  list: readonly string[],
): boolean {
  const t = text.trim();
  return list.includes(t);
}

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
    private readonly weightLogService: WeightLogService,
    private readonly sheetsSync: SheetsSyncService,
    private readonly nutritionProfileService: NutritionProfileService,
    private readonly lineService: LineService,
    private readonly aiGateway: AiGatewayService,
    private readonly membershipService: MembershipService,
    private readonly healthRouting: HealthRoutingService,
    private readonly healthDashboard: HealthDashboardService,
    private readonly healthInsights: HealthInsightService,
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

    // Today's FoodLog edit/delete — exact foodeedit:* commands first.
    const editCmd = parseFoodEditCommand(normalized);
    if (editCmd) {
      await this.handleFoodEditCommand(user, replyToken, editCmd);
      return 'handled';
    }

    // Active edit-session free-text (qty / name / nutrition) before other AI.
    const editSession = foodEditSessionBuffer.get(user.id);
    if (
      editSession &&
      (editSession.kind === 'await_quantity' ||
        editSession.kind === 'await_name' ||
        editSession.kind === 'await_nutrition')
    ) {
      if (this.isCancel(normalized) || normalized === FOOD_EDIT_CANCEL_TEXT) {
        foodEditSessionBuffer.clear(user.id);
        await this.lineService.replyText(replyToken, FOOD_EDIT_CANCELLED_TEXT);
        return 'handled';
      }
      await this.handleFoodEditSessionInput(user, replyToken, normalized);
      return 'handled';
    }

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

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.TODAY)) {
      await this.replyTodaySummary(user, replyToken);
      return 'handled';
    }

    // Rich Menu entry points — must run before Food AI / classify / coach NL.
    if (isExactFoodCommand(normalized, FOOD_COMMANDS.FOOD_ENTRY)) {
      await this.lineService.replyText(replyToken, LOG_FOOD_HINT_TEXT);
      return 'handled';
    }

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.COACH_ENTRY)) {
      await this.lineService.replyText(replyToken, COACH_ENTRY_TEXT);
      return 'handled';
    }

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.PROFILE)) {
      await this.replyProfile(user.id, replyToken);
      return 'handled';
    }

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.WEIGHT)) {
      await this.replyWeightOverview(user.id, replyToken);
      return 'handled';
    }

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.HISTORY)) {
      await this.replyHistory(user.id, replyToken);
      return 'handled';
    }

    if (isMembershipCommand(normalized)) {
      const textOut = await this.membershipService.buildStatusText(user.id);
      await this.lineService.replyText(replyToken, textOut);
      return 'handled';
    }

    const promoCode = parsePromoCommand(normalized);
    if (promoCode) {
      const textOut = await this.membershipService.redeemPromo(
        user.id,
        promoCode,
      );
      await this.lineService.replyText(replyToken, textOut);
      return 'handled';
    }

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.LOG_FOOD_HINT)) {
      await this.lineService.replyText(replyToken, LOG_FOOD_HINT_TEXT);
      return 'handled';
    }

    if (isExactFoodCommand(normalized, FOOD_COMMANDS.START)) {
      return 'not_command';
    }

    // Health trackers / body / sleep / etc. (deterministic-first).
    if (await this.healthRouting.tryHandleText(user, replyToken, normalized)) {
      return 'handled';
    }

    // Medical-safety gate before AI.
    if (detectCoachIntent(normalized) === 'medical') {
      await this.lineService.replyText(replyToken, MEDICAL_ADVICE_TEXT);
      return 'handled';
    }

    // Cross-data health coach questions (structured facts → AI COACH).
    if (isHealthCoachQuestion(normalized)) {
      await this.replyCrossHealthCoach(user, replyToken, normalized);
      return 'handled';
    }

    // Pending quantity/edit BEFORE coach or any AI routing.
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

    // Deterministic coach NL (DB facts) — no classify.
    const coachIntent = detectCoachIntent(normalized);
    if (coachIntent !== 'none' && coachIntent !== 'medical') {
      await this.handleCoachIntent(user.id, replyToken, coachIntent);
      return 'handled';
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

    const lineUserId = user.lineUserId ?? user.id;

    // High-confidence food text → analyze once (skip classify).
    if (isLikelyFoodText(normalized)) {
      await this.offerReplaceOrAnalyze(
        user.id,
        replyToken,
        { kind: 'text', text: normalized },
        lineUserId,
      );
      return 'handled';
    }

    // Ambiguous free text → cheap AI classify fallback.
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
      const classified = await this.aiGateway.run(userId, 'CLASSIFY', () =>
        this.messageClassifyService.classify(text),
      );
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
          await this.handleCoachIntent(userId, replyToken, hint);
          return;
        }
        await this.replyTodaySummary(userId, replyToken);
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
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return;
      }
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
      await this.handleCoachIntent(userId, replyToken, coachIntent);
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

    if (await this.healthRouting.tryHandleImage(user, replyToken, messageId)) {
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
    userOrId: User | string,
    replyToken: string,
  ): Promise<void> {
    const userId = typeof userOrId === 'string' ? userOrId : userOrId.id;
    const userCreatedAt =
      typeof userOrId === 'string' ? new Date() : userOrId.createdAt;
    try {
      const summary = await this.dailySummaryService.getDailySummary(userId);
      const todayWeightKg =
        await this.weightLogService.getTodayAverageKg(userId);
      const snap = await this.healthDashboard.buildToday({
        userId,
        userCreatedAt,
        nutrition: summary,
        todayWeightKg,
      });
      const insights = this.healthInsights.buildInsights(snap);
      if (insights.length > 0) {
        snap.tip = insights[0];
      }
      try {
        await this.lineService.replyFlex(
          replyToken,
          buildHealthDashboardFlex(snap, (m) =>
            this.healthDashboard.formatDuration(m),
          ),
        );
      } catch {
        await this.lineService.replyText(
          replyToken,
          this.healthDashboard.formatDashboardText(snap),
        );
      }
    } catch (error) {
      if (error instanceof NutritionProfileMissingError) {
        await this.lineService.replyText(replyToken, PROFILE_REQUIRED_TEXT);
        return;
      }
      this.logger.error(
        `Today summary failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
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
          buildDailyCoachSummaryMessage(summary),
        );
      } catch {
        await this.lineService.replyText(replyToken, DAILY_SUMMARY_ERROR_TEXT);
      }
    }
  }

  private async replyCrossHealthCoach(
    user: User,
    replyToken: string,
    question: string,
  ): Promise<void> {
    let nutrition = null;
    try {
      nutrition = await this.dailySummaryService.getDailySummary(user.id);
    } catch {
      nutrition = null;
    }
    const todayWeightKg = await this.weightLogService.getTodayAverageKg(
      user.id,
    );
    const snap = await this.healthDashboard.buildToday({
      userId: user.id,
      userCreatedAt: user.createdAt,
      nutrition,
      todayWeightKg,
    });
    const deterministic = this.healthInsights.buildInsights(snap);
    const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();
    if (!apiKey) {
      await this.lineService.replyText(
        replyToken,
        deterministic.length > 0
          ? `💡 จากข้อมูลที่มี\n\n${deterministic.map((d) => `• ${d}`).join('\n')}`
          : 'ข้อมูลยังไม่พอสำหรับวิเคราะห์ครับ',
      );
      return;
    }
    try {
      const openai = new OpenAI({ apiKey });
      const answer = await this.aiGateway.run(user.id, 'COACH', async () => {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.4,
          max_tokens: 280,
          messages: [
            {
              role: 'system',
              content:
                'You are Tastom personal health coach. Use only provided facts. Thai, short, practical. No diagnosis, no medication. Distinguish measured vs estimated.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                question,
                snapshot: {
                  calories: snap.nutrition?.consumed.calories ?? null,
                  calorieTarget: snap.nutrition?.target.calories ?? null,
                  proteinG: snap.nutrition?.consumed.proteinG ?? null,
                  proteinTarget: snap.nutrition?.target.proteinG ?? null,
                  weightKg: snap.weightKg,
                  sleepMinutes: snap.sleepMinutes,
                  exerciseMinutes: snap.exerciseMinutes,
                  steps: snap.steps,
                  waterMl: snap.waterMl,
                  recoveryScore: snap.recoveryScore,
                },
                insights: deterministic,
              }),
            },
          ],
        });
        const meta = usageFromOpenAiCompletion(completion, 'gpt-4o-mini');
        if (meta) reportAiTokenUsage(meta);
        return (
          completion.choices[0]?.message?.content?.trim() ||
          deterministic.join('\n') ||
          'ยังสรุปจากข้อมูลที่มีไม่ชัดครับ'
        );
      });
      await this.lineService.replyText(replyToken, `💡 Coach\n\n${answer}`);
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return;
      }
      await this.lineService.replyText(
        replyToken,
        deterministic.length > 0
          ? `💡 จากข้อมูลที่มี\n\n${deterministic.map((d) => `• ${d}`).join('\n')}`
          : 'ตอบคำถามสุขภาพไม่สำเร็จครับ',
      );
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
      const flex = buildTodayFoodEditListFlex(logs);
      try {
        await this.lineService.replyFlex(replyToken, flex);
      } catch {
        await this.lineService.replyText(replyToken, buildHistoryMessage(logs));
      }
    } catch (error) {
      this.logger.error(
        `History failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      await this.lineService.replyText(replyToken, DAILY_SUMMARY_ERROR_TEXT);
    }
  }

  private async replyTodayFoodList(
    userId: string,
    replyToken: string,
    preface?: string,
  ): Promise<void> {
    const logs = await this.foodLogService.listForUserOnDate(userId);
    const flex = buildTodayFoodEditListFlex(logs);
    try {
      await this.lineService.replyFlex(replyToken, flex);
    } catch {
      const body = buildHistoryMessage(logs);
      await this.lineService.replyText(
        replyToken,
        preface ? `${preface}\n\n${body}` : body,
      );
    }
  }

  private async handleFoodEditCommand(
    user: User,
    replyToken: string,
    cmd: NonNullable<ReturnType<typeof parseFoodEditCommand>>,
  ): Promise<void> {
    if (cmd.type === 'cancel') {
      foodEditSessionBuffer.clear(user.id);
      await this.pendingFoodService.clearForUser(user.id);
      await this.lineService.replyText(replyToken, FOOD_EDIT_CANCELLED_TEXT);
      return;
    }

    const log = await this.foodLogService.findTodayByIdForUser(
      user.id,
      cmd.foodLogId,
    );
    if (!log) {
      foodEditSessionBuffer.clear(user.id);
      await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
      return;
    }

    switch (cmd.type) {
      case 'menu':
        foodEditSessionBuffer.clear(user.id);
        try {
          await this.lineService.replyFlex(
            replyToken,
            buildFoodEditMenuFlex(log),
          );
        } catch {
          await this.lineService.replyButtons(
            replyToken,
            `✏️ แก้ไข ${log.foodName}`,
            [
              { label: 'ปริมาณ', text: foodEditQtyText(log.id) },
              { label: 'ชื่ออาหาร', text: foodEditNameText(log.id) },
              { label: 'สารอาหาร', text: foodEditNutText(log.id) },
              { label: 'ยกเลิก', text: FOOD_EDIT_CANCEL_TEXT },
            ],
          );
        }
        return;
      case 'qty':
        foodEditSessionBuffer.set(user.id, {
          kind: 'await_quantity',
          foodLogId: log.id,
        });
        await this.lineService.replyText(replyToken, FOOD_EDIT_QTY_PROMPT_TEXT);
        return;
      case 'name':
        foodEditSessionBuffer.set(user.id, {
          kind: 'await_name',
          foodLogId: log.id,
        });
        await this.lineService.replyText(
          replyToken,
          FOOD_EDIT_NAME_PROMPT_TEXT,
        );
        return;
      case 'nut':
        foodEditSessionBuffer.set(user.id, {
          kind: 'await_nutrition',
          foodLogId: log.id,
        });
        await this.lineService.replyText(replyToken, FOOD_EDIT_NUT_PROMPT_TEXT);
        return;
      case 'del':
        // Clear any in-flight qty/name/nut session so typed input cannot
        // mutate a different FoodLog while delete confirm is showing.
        foodEditSessionBuffer.clear(user.id);
        try {
          await this.lineService.replyFlex(
            replyToken,
            buildFoodDeleteConfirmFlex(log),
          );
        } catch {
          await this.lineService.replyButtons(
            replyToken,
            `ต้องการลบ ${log.foodName} · ${Math.round(log.calories)} kcal ใช่ไหม?`,
            [
              { label: 'ยืนยันลบ', text: foodEditDelOkText(log.id) },
              { label: 'ยกเลิก', text: FOOD_EDIT_CANCEL_TEXT },
            ],
          );
        }
        return;
      case 'delok':
        await this.deleteTodayFoodLog(user.id, replyToken, log.id);
        return;
      default:
        return;
    }
  }

  private async handleFoodEditSessionInput(
    user: User,
    replyToken: string,
    text: string,
  ): Promise<void> {
    const session = foodEditSessionBuffer.get(user.id);
    if (!session) {
      return;
    }

    if (session.kind === 'await_quantity') {
      await this.applyTodayQuantityEdit(
        user.id,
        replyToken,
        session.foodLogId,
        text,
      );
      return;
    }
    if (session.kind === 'await_nutrition') {
      await this.applyTodayNutritionEdit(
        user.id,
        replyToken,
        session.foodLogId,
        text,
      );
      return;
    }
    if (session.kind === 'await_name') {
      await this.startTodayNameReplacement(
        user,
        replyToken,
        session.foodLogId,
        text,
      );
    }
  }

  private async applyTodayQuantityEdit(
    userId: string,
    replyToken: string,
    foodLogId: string,
    text: string,
  ): Promise<void> {
    const log = await this.foodLogService.findTodayByIdForUser(
      userId,
      foodLogId,
    );
    if (!log) {
      foodEditSessionBuffer.clear(userId);
      await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
      return;
    }

    // Saved logs have no stored quantity — treat current row as 1.0 baseline.
    const adjustment = parseQuantityAdjustment(text, { allowBareNumber: true });
    if (
      adjustment.kind === 'none' ||
      adjustment.kind === 'ambiguous' ||
      adjustment.kind === 'composition'
    ) {
      await this.lineService.replyText(replyToken, FOOD_EDIT_QTY_INVALID_TEXT);
      return;
    }

    const baselineQty = 1;
    const consumed = resolveConsumedQuantity(adjustment, baselineQty);
    if (consumed == null || consumed <= 0) {
      await this.lineService.replyText(replyToken, FOOD_EDIT_QTY_INVALID_TEXT);
      return;
    }

    const ratio = consumed / baselineQty;
    const scaled = applyProportionalNutrition(
      {
        calories: log.calories,
        proteinG: log.proteinG,
        carbsG: log.carbsG,
        fatG: log.fatG,
      },
      ratio,
    );

    try {
      const updated = await this.foodLogService.updateNutritionForUserToday(
        userId,
        foodLogId,
        scaled,
      );
      foodEditSessionBuffer.clear(userId);
      this.enqueueFoodLogSheetSync('upsert', updated);
      await this.replyTodayFoodList(
        userId,
        replyToken,
        FOOD_EDIT_UPDATED_TEXT(updated.foodName),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        foodEditSessionBuffer.clear(userId);
        await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
        return;
      }
      throw error;
    }
  }

  private async applyTodayNutritionEdit(
    userId: string,
    replyToken: string,
    foodLogId: string,
    text: string,
  ): Promise<void> {
    const parsed = parseNutritionEdit(text);
    if (!parsed.ok) {
      await this.lineService.replyText(replyToken, FOOD_EDIT_NUT_INVALID_TEXT);
      return;
    }

    try {
      const updated = await this.foodLogService.updateNutritionForUserToday(
        userId,
        foodLogId,
        parsed.nutrition,
      );
      foodEditSessionBuffer.clear(userId);
      this.enqueueFoodLogSheetSync('upsert', updated);
      await this.replyTodayFoodList(
        userId,
        replyToken,
        FOOD_EDIT_UPDATED_TEXT(updated.foodName),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        foodEditSessionBuffer.clear(userId);
        await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
        return;
      }
      throw error;
    }
  }

  private async startTodayNameReplacement(
    user: User,
    replyToken: string,
    foodLogId: string,
    foodNameText: string,
  ): Promise<void> {
    const log = await this.foodLogService.findTodayByIdForUser(
      user.id,
      foodLogId,
    );
    if (!log) {
      foodEditSessionBuffer.clear(user.id);
      await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
      return;
    }

    const lineUserId = user.lineUserId ?? user.id;
    if (!aiRateLimiter.tryConsume(lineUserId, 'food_text')) {
      await this.lineService.replyText(replyToken, FOOD_RATE_LIMITED_TEXT);
      return;
    }

    try {
      const analysis = await this.aiGateway.run(user.id, 'FOOD_TEXT', () =>
        this.foodAnalysisService.analyzeText(foodNameText),
      );
      const pending = await this.pendingFoodService.upsertPending(
        user.id,
        analysis,
      );
      foodEditSessionBuffer.set(user.id, {
        kind: 'name_replace_pending',
        foodLogId,
      });
      await this.lineService.replyButtonsOrPush(
        replyToken,
        lineUserId,
        `✏️ แทนที่ "${log.foodName}" ด้วยรายการใหม่\n\n${buildFoodEstimateMessage(analysis, pending)}`,
        FOOD_CONFIRM_CHOICES,
      );
    } catch (error) {
      foodEditSessionBuffer.set(user.id, {
        kind: 'await_name',
        foodLogId,
      });
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return;
      }
      this.logger.error(
        `Name replace analysis failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.lineService.replyText(replyToken, FOOD_ANALYSIS_FAILED_TEXT);
    }
  }

  private async deleteTodayFoodLog(
    userId: string,
    replyToken: string,
    foodLogId: string,
  ): Promise<void> {
    try {
      const deleted = await this.foodLogService.deleteForUserToday(
        userId,
        foodLogId,
      );
      foodEditSessionBuffer.clear(userId);
      this.enqueueFoodLogSheetSync('delete', deleted);
      await this.replyTodayFoodList(
        userId,
        replyToken,
        FOOD_EDIT_DELETED_TEXT(deleted.foodName),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
        return;
      }
      throw error;
    }
  }

  /**
   * Keep FOOD_LOGS row + DailySummary in sync after edit/delete.
   * DB remains source of truth; Sheets errors are swallowed by enqueue.
   */
  private enqueueFoodLogSheetSync(
    action: 'upsert' | 'delete',
    log: FoodLog,
  ): void {
    this.sheetsSync.enqueue(`foodLog:${action}`, async () => {
      if (action === 'upsert') {
        await this.sheetsSync.upsertFoodLog(log);
      } else {
        await this.sheetsSync.deleteFoodLog(log.id);
      }
      await this.sheetsSync.updateDailySummary(log.userId, log.eatenAt);
    });
  }

  private async handleCoachIntent(
    userId: string,
    replyToken: string,
    intent: CoachHint,
  ): Promise<void> {
    try {
      if (intent === 'history' || intent === 'today_summary') {
        if (intent === 'history') {
          await this.replyHistory(userId, replyToken);
        } else {
          await this.replyTodaySummary(userId, replyToken);
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
        // Template-first — no OpenAI for meal suggestions on the hot path.
        const tip = buildMealRecommendationFallback(summary.remaining);
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

      const analysis = await this.aiGateway.run(
        userId,
        'COMPOSITION_ADJUSTMENT',
        () =>
          this.foodAnalysisService.analyzeCompositionAdjustment({
            previous,
            instruction,
          }),
      );

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
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return;
      }
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
    // New meal analysis is not a name-replace of an existing FoodLog.
    const edit = foodEditSessionBuffer.get(userId);
    if (edit?.kind === 'name_replace_pending') {
      foodEditSessionBuffer.clear(userId);
    }

    const rateKey = lineUserId ?? userId;
    const bucket = input.kind === 'image' ? 'food_image' : 'food_text';
    if (!aiRateLimiter.tryConsume(rateKey, bucket)) {
      await this.lineService.replyText(replyToken, FOOD_RATE_LIMITED_TEXT);
      return;
    }

    try {
      const analysis =
        input.kind === 'text'
          ? await this.aiGateway.run(userId, 'FOOD_TEXT', () =>
              this.foodAnalysisService.analyzeText(input.text),
            )
          : await this.aiGateway.run(userId, 'FOOD_VISION', () =>
              this.foodAnalysisService.analyzeImage({
                imageBytes: input.imageBytes,
              }),
            );

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
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return;
      }
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
    const editSession = foodEditSessionBuffer.get(userId);
    if (editSession?.kind === 'name_replace_pending') {
      await this.confirmNameReplacement(
        userId,
        replyToken,
        editSession.foodLogId,
        lineUserId,
      );
      return;
    }

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

  private async confirmNameReplacement(
    userId: string,
    replyToken: string,
    foodLogId: string,
    lineUserId?: string,
  ): Promise<void> {
    const pending = await this.pendingFoodService.getActiveForUser(userId);
    if (!pending) {
      foodEditSessionBuffer.clear(userId);
      await this.lineService.replyText(replyToken, NO_PENDING_FOOD_TEXT);
      return;
    }

    const analysis = this.pendingFoodService.toAnalysisResult(pending);
    try {
      const updated = await this.foodLogService.replaceFromAnalysisForUserToday(
        userId,
        foodLogId,
        analysis,
      );
      await this.pendingFoodService.clearForUser(userId);
      foodEditSessionBuffer.clear(userId);
      this.enqueueFoodLogSheetSync('upsert', updated);

      const summary = await this.dailyTotalsService.getSummaryForUser(userId);
      const message = `${FOOD_EDIT_UPDATED_TEXT(updated.foodName)}\n\n${buildFoodSavedMessage(analysis, summary)}`;
      if (lineUserId) {
        await this.lineService.replyTextOrPush(replyToken, lineUserId, message);
      } else {
        await this.lineService.replyText(replyToken, message);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        foodEditSessionBuffer.clear(userId);
        await this.pendingFoodService.clearForUser(userId);
        await this.lineService.replyText(replyToken, FOOD_EDIT_NOT_FOUND_TEXT);
        return;
      }
      throw error;
    }
  }

  private async cancelPending(
    userId: string,
    replyToken: string,
  ): Promise<void> {
    pendingReplaceBuffer.clear(userId);
    const nameReplace = foodEditSessionBuffer.get(userId);
    foodEditSessionBuffer.clear(userId);
    const pending = await this.pendingFoodService.getActiveForUser(userId);
    if (!pending) {
      await this.lineService.replyText(
        replyToken,
        nameReplace ? FOOD_EDIT_CANCELLED_TEXT : NO_PENDING_FOOD_TEXT,
      );
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
