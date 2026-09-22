import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import OpenAI from 'openai';
import {
  formatZonedTime,
  getZonedDateParts,
  zonedLocalToUtc,
} from '../food/day-bounds';
import { LineOutboundError } from '../line/line-outbound.error';
import { LineService } from '../line/line.service';
import { AiGatewayService } from '../membership/ai-gateway.service';
import { AiQuotaExceededError } from '../membership/membership.errors';
import { buildQuotaExceededMessage } from '../membership/membership.messages';
import { NutritionProfileService } from '../users/nutrition-profile.service';
import { bodyScanExpectBuffer } from './body-scan-expect.buffer';
import { BodyScanService } from './body-scan.service';
import {
  HEALTH_COMMANDS,
  isExactHealthCommand,
  isMealSuggestionRequest,
  parseExerciseCommand,
  parseHydrationCommand,
  parseRecoveryCommand,
  parseSleepCommand,
  parseStepsCommand,
} from './health-commands';
import {
  ActivityLogService,
  ExerciseLogService,
  HydrationLogService,
  RecoveryLogService,
  SleepLogService,
} from './health-logs.service';
import {
  BODY_SCAN_HELP,
  HEALTH_CONFIRM_CHOICES,
  buildBodyProgressMessage,
  buildBodyScanPreviewMessage,
  buildExerciseSavedMessage,
  buildHydrationMessage,
  buildMealPlanMessage,
  buildRecoverySavedMessage,
  buildSleepSavedMessage,
  buildStepsMessage,
  buildWeeklyReviewMessage,
} from './health.messages';
import {
  buildBodyProgressFlex,
  buildBodyScanPreviewFlex,
  buildHydrationFlex,
  buildMealPlanFlex,
  buildWeeklyReviewFlex,
} from './health.flex';
import { MealPlanService } from './meal-plan.service';
import {
  BodyScanAnalysisService,
  WeeklyReviewService,
} from './weekly-review.service';

/** Deterministic LINE health routing (AI only via AiGateway when needed). */
@Injectable()
export class HealthRoutingService {
  private readonly logger = new Logger(HealthRoutingService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly lineService: LineService,
    private readonly bodyScans: BodyScanService,
    private readonly bodyAnalysis: BodyScanAnalysisService,
    private readonly sleep: SleepLogService,
    private readonly exercise: ExerciseLogService,
    private readonly activity: ActivityLogService,
    private readonly hydration: HydrationLogService,
    private readonly recovery: RecoveryLogService,
    private readonly mealPlan: MealPlanService,
    private readonly weekly: WeeklyReviewService,
    private readonly nutritionProfile: NutritionProfileService,
    private readonly aiGateway: AiGatewayService,
    private readonly config: ConfigService,
  ) {
    const key = (this.config.get<string>('OPENAI_API_KEY') ?? '').trim();
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  async tryHandleText(
    user: User,
    replyToken: string,
    text: string,
  ): Promise<boolean> {
    const normalized = text.trim();

    if (normalized === HEALTH_COMMANDS.BODY_CONFIRM) {
      await this.confirmBodyScan(user.id, replyToken);
      return true;
    }
    if (normalized === HEALTH_COMMANDS.BODY_CANCEL) {
      await this.bodyScans.clearPending(user.id);
      bodyScanExpectBuffer.clear(user.id);
      await this.lineService.replyText(
        replyToken,
        'ยกเลิกผล Body Scan แล้วครับ',
      );
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.BODY)) {
      bodyScanExpectBuffer.arm(user.id);
      await this.lineService.replyText(replyToken, BODY_SCAN_HELP);
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.BODY_PROGRESS)) {
      await this.replyBodyProgress(user.id, replyToken);
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.WEEKLY)) {
      await this.replyWeeklyReview(user.id, replyToken);
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.MEAL_PLAN)) {
      await this.replyMealPlan(user.id, replyToken);
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.WATER)) {
      const total = await this.hydration.todayTotalMl(user.id);
      await this.replyHydration(replyToken, total);
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.SLEEP)) {
      await this.lineService.replyText(
        replyToken,
        '😴 บันทึกการนอนได้แบบนี้ครับ\n\nนอน 00:30 ตื่น 07:30',
      );
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.EXERCISE)) {
      await this.lineService.replyText(
        replyToken,
        '🏋️ บันทึกได้แบบนี้ครับ\n\nออกกำลังกาย strength 45\nออกกำลัง 30',
      );
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.STEPS)) {
      await this.lineService.replyText(
        replyToken,
        '👣 บันทึกก้าวได้แบบนี้ครับ\n\nก้าว 8420',
      );
      return true;
    }

    if (isExactHealthCommand(normalized, HEALTH_COMMANDS.RECOVERY)) {
      await this.lineService.replyText(
        replyToken,
        '❤️ เช็คอินวันนี้ได้แบบนี้ครับ\n\nฟื้นตัว 4 2 4 2\n(Energy Stress Recovery Soreness)',
      );
      return true;
    }

    const sleepParsed = parseSleepCommand(normalized);
    if (sleepParsed) {
      await this.saveSleep(user.id, replyToken, sleepParsed);
      return true;
    }

    const exerciseParsed = parseExerciseCommand(normalized);
    if (exerciseParsed) {
      await this.saveExercise(user.id, replyToken, exerciseParsed);
      return true;
    }

    const steps = parseStepsCommand(normalized);
    if (steps != null) {
      try {
        await this.activity.setSteps(user.id, steps);
        await this.lineService.replyText(replyToken, buildStepsMessage(steps));
      } catch {
        await this.lineService.replyText(replyToken, 'บันทึกก้าวไม่สำเร็จครับ');
      }
      return true;
    }

    const waterMl = parseHydrationCommand(normalized);
    if (waterMl != null) {
      try {
        await this.hydration.add(user.id, waterMl);
        const total = await this.hydration.todayTotalMl(user.id);
        await this.replyHydration(replyToken, total);
      } catch {
        await this.lineService.replyText(replyToken, 'บันทึกน้ำไม่สำเร็จครับ');
      }
      return true;
    }

    const recoveryParsed = parseRecoveryCommand(normalized);
    if (recoveryParsed) {
      try {
        await this.recovery.upsertToday({ userId: user.id, ...recoveryParsed });
        await this.lineService.replyText(
          replyToken,
          buildRecoverySavedMessage(recoveryParsed),
        );
      } catch {
        await this.lineService.replyText(
          replyToken,
          'บันทึก recovery ไม่สำเร็จครับ (คะแนน 1–5)',
        );
      }
      return true;
    }

    if (isMealSuggestionRequest(normalized)) {
      await this.replyMealSuggestion(user.id, replyToken, normalized);
      return true;
    }

    return false;
  }

  async tryHandleImage(
    user: User,
    replyToken: string,
    messageId: string,
  ): Promise<boolean> {
    if (!bodyScanExpectBuffer.consume(user.id)) {
      return false;
    }
    try {
      const bytes =
        await this.lineService.getMessageContentPreviewBytes(messageId);
      const draft = await this.bodyAnalysis.extractFromImage(user.id, bytes);
      const text = buildBodyScanPreviewMessage(draft);
      try {
        await this.lineService.replyFlex(
          replyToken,
          buildBodyScanPreviewFlex(draft),
        );
      } catch {
        await this.lineService.replyButtons(
          replyToken,
          text,
          HEALTH_CONFIRM_CHOICES,
        );
      }
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return true;
      }
      if (error instanceof LineOutboundError) throw error;
      this.logger.warn(
        `Body scan extract failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.lineService.replyText(
        replyToken,
        'อ่านผล Body Scan ไม่สำเร็จครับ ลองส่งรูปอีกครั้งหรือพิมพ์ค่าเองได้',
      );
    }
    return true;
  }

  private async confirmBodyScan(userId: string, replyToken: string) {
    const created = await this.bodyScans.confirmPending(userId);
    if (!created) {
      await this.lineService.replyText(
        replyToken,
        'ไม่มีผล Body Scan ที่รอบันทึกครับ',
      );
      return;
    }
    const scans = await this.bodyScans.latestTwo(userId);
    let msg = 'บันทึก Body Scan แล้วครับ';
    if (created.weightKg != null) {
      msg += `\nน้ำหนัก ${created.weightKg} kg`;
    }
    if (scans.length >= 2) {
      const deltas = this.bodyScans.compareProgress(scans[0], scans[1]);
      msg += `\n\n${buildBodyProgressMessage(deltas)}`;
      try {
        await this.lineService.replyFlex(
          replyToken,
          buildBodyProgressFlex(deltas),
        );
        return;
      } catch {
        /* fall through */
      }
    }
    await this.lineService.replyText(replyToken, msg);
  }

  private async replyBodyProgress(userId: string, replyToken: string) {
    const scans = await this.bodyScans.latestTwo(userId);
    if (scans.length < 2) {
      await this.lineService.replyText(
        replyToken,
        '📈 Body Progress\n\nยังมีผลสแกนไม่พอสำหรับเปรียบเทียบครับ',
      );
      return;
    }
    const deltas = this.bodyScans.compareProgress(scans[0], scans[1]);
    try {
      await this.lineService.replyFlex(
        replyToken,
        buildBodyProgressFlex(deltas),
      );
    } catch {
      await this.lineService.replyText(
        replyToken,
        buildBodyProgressMessage(deltas),
      );
    }
  }

  private async saveSleep(
    userId: string,
    replyToken: string,
    parsed: {
      bedtimeHour: number;
      bedtimeMinute: number;
      wakeHour: number;
      wakeMinute: number;
    },
  ) {
    try {
      const parts = getZonedDateParts(new Date());
      let bedtime = zonedLocalToUtc({
        ...parts,
        hour: parsed.bedtimeHour,
        minute: parsed.bedtimeMinute,
      });
      let wakeTime = zonedLocalToUtc({
        ...parts,
        hour: parsed.wakeHour,
        minute: parsed.wakeMinute,
      });
      if (parsed.bedtimeHour >= 18 && parsed.wakeHour < 14) {
        bedtime = new Date(bedtime.getTime() - 86_400_000);
      }
      if (wakeTime.getTime() <= bedtime.getTime()) {
        wakeTime = new Date(wakeTime.getTime() + 86_400_000);
      }
      const log = await this.sleep.create({ userId, bedtime, wakeTime });
      await this.lineService.replyText(
        replyToken,
        buildSleepSavedMessage({
          durationMinutes: log.durationMinutes,
          bedtimeLabel: formatZonedTime(log.bedtime),
          wakeLabel: formatZonedTime(log.wakeTime),
          score: log.sleepScore,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Sleep save failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.lineService.replyText(
        replyToken,
        'บันทึกการนอนไม่สำเร็จครับ ตรวจสอบเวลาอีกครั้งนะครับ',
      );
    }
  }

  private async saveExercise(
    userId: string,
    replyToken: string,
    parsed: {
      type: import('@prisma/client').ExerciseType;
      durationMinutes: number;
      name: string;
    },
  ) {
    try {
      await this.exercise.create({
        userId,
        type: parsed.type,
        durationMinutes: parsed.durationMinutes,
        workoutName: parsed.name,
      });
      await this.lineService.replyText(
        replyToken,
        buildExerciseSavedMessage({
          name: parsed.name,
          durationMinutes: parsed.durationMinutes,
        }),
      );
    } catch {
      await this.lineService.replyText(
        replyToken,
        'บันทึกออกกำลังกายไม่สำเร็จครับ',
      );
    }
  }

  private async replyHydration(replyToken: string, totalMl: number) {
    const target = this.hydration.defaultTargetMl;
    try {
      await this.lineService.replyFlex(
        replyToken,
        buildHydrationFlex(totalMl, target),
      );
    } catch {
      await this.lineService.replyButtons(
        replyToken,
        buildHydrationMessage(totalMl, target),
        [
          { label: '+250 ml', text: '+250 ml' },
          { label: '+500 ml', text: '+500 ml' },
        ],
      );
    }
  }

  private async replyMealPlan(userId: string, replyToken: string) {
    const profile = await this.nutritionProfile.findByUserId(userId);
    if (!profile) {
      await this.lineService.replyText(
        replyToken,
        'ต้องตั้งโปรไฟล์ก่อนใช้งานแผนอาหารครับ',
      );
      return;
    }
    const plan = await this.mealPlan.ensureTodayPlan({
      userId,
      dailyCalories: profile.dailyCalories,
      dailyProteinG: profile.dailyProteinG,
      dailyCarbsG: profile.dailyCarbsG,
      dailyFatG: profile.dailyFatG,
    });
    try {
      await this.lineService.replyFlex(
        replyToken,
        buildMealPlanFlex(plan.slots),
      );
    } catch {
      await this.lineService.replyText(
        replyToken,
        buildMealPlanMessage(plan.slots),
      );
    }
  }

  private async replyMealSuggestion(
    userId: string,
    replyToken: string,
    question: string,
  ) {
    if (!this.openai) {
      await this.lineService.replyText(
        replyToken,
        'ยังตั้งค่า AI ไม่ได้ครับ — ดูแผนมื้อจากคำสั่ง "แผนอาหาร" ได้ก่อน',
      );
      return;
    }
    try {
      const profile = await this.nutritionProfile.findByUserId(userId);
      const suggestion = await this.aiGateway.run(
        userId,
        'MEAL_PLAN',
        async () => {
          const completion = await this.openai!.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.5,
            max_tokens: 320,
            messages: [
              {
                role: 'system',
                content:
                  'You are Tastom meal coach. Suggest 1-3 practical Thai-friendly meal ideas. No diagnosis. Respect calorie/protein budgets if provided. Reply in Thai, concise.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  question,
                  dailyCalories: profile?.dailyCalories ?? null,
                  dailyProteinG: profile?.dailyProteinG ?? null,
                }),
              },
            ],
          });
          return (
            completion.choices[0]?.message?.content?.trim() ||
            'ยังนึกเมนูไม่ออกครับ ลองระบุงบแคลอรี่มาอีกครั้ง'
          );
        },
      );
      await this.lineService.replyText(
        replyToken,
        `🍱 แนะนำมื้อ\n\n${suggestion}`,
      );
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
        'แนะนำมื้อไม่สำเร็จครับ ลองใหม่อีกครั้งนะครับ',
      );
    }
  }

  private async replyWeeklyReview(userId: string, replyToken: string) {
    try {
      const review = await this.weekly.getOrCreateReview(userId);
      try {
        await this.lineService.replyFlex(
          replyToken,
          buildWeeklyReviewFlex(review),
        );
      } catch {
        await this.lineService.replyText(
          replyToken,
          buildWeeklyReviewMessage(review),
        );
      }
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        await this.lineService.replyText(
          replyToken,
          buildQuotaExceededMessage(error),
        );
        return;
      }
      this.logger.warn(
        `Weekly review failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      await this.lineService.replyText(
        replyToken,
        'สรุปสัปดาห์ไม่สำเร็จครับ ลองใหม่ภายหลังนะครับ',
      );
    }
  }
}
