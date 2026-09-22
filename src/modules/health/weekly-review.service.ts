import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { AiGatewayService } from '../membership/ai-gateway.service';
import {
  reportAiTokenUsage,
  usageFromOpenAiCompletion,
} from '../membership/ai-token-capture';
import {
  ActivityLogService,
  ExerciseLogService,
  HydrationLogService,
  RecoveryLogService,
  SleepLogService,
} from './health-logs.service';
import { BodyScanDraft, BodyScanService } from './body-scan.service';
import { dateKeyFromParts } from './program-week';
import { getZonedDateParts } from '../food/day-bounds';

export type WeeklyMetrics = {
  weightChangeKg: number | null;
  bodyFatChangePct: number | null;
  waistChangeCm: number | null;
  muscleChangeKg: number | null;
  avgCalories: number | null;
  avgProteinG: number | null;
  avgSleepHours: number | null;
  workouts: number;
  avgSteps: number | null;
  avgWaterMl: number | null;
  avgRecovery: number | null;
};

@Injectable()
export class WeeklyReviewService {
  private readonly logger = new Logger(WeeklyReviewService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly body: BodyScanService,
    private readonly sleep: SleepLogService,
    private readonly exercise: ExerciseLogService,
    private readonly activity: ActivityLogService,
    private readonly hydration: HydrationLogService,
    private readonly recovery: RecoveryLogService,
    private readonly config: ConfigService,
  ) {
    const key = (this.config.get<string>('OPENAI_API_KEY') ?? '').trim();
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  weekBounds(now = new Date()): { start: string; end: string; since: Date } {
    const parts = getZonedDateParts(now);
    const end = dateKeyFromParts(parts);
    const since = new Date(Date.now() - 7 * 86_400_000);
    const startParts = getZonedDateParts(since);
    const start = dateKeyFromParts(startParts);
    return { start, end, since };
  }

  async aggregate(userId: string): Promise<WeeklyMetrics> {
    const { since } = this.weekBounds();
    const scans = await this.body.latestTwo(userId);
    let weightChangeKg: number | null = null;
    let bodyFatChangePct: number | null = null;
    let waistChangeCm: number | null = null;
    let muscleChangeKg: number | null = null;
    if (scans.length >= 2) {
      const [newer, older] = scans;
      const deltas = this.body.compareProgress(newer, older);
      weightChangeKg =
        deltas.find((d) => d.field === 'weightKg')?.delta ?? null;
      bodyFatChangePct =
        deltas.find((d) => d.field === 'bodyFatPercent')?.delta ?? null;
      waistChangeCm = deltas.find((d) => d.field === 'waistCm')?.delta ?? null;
      muscleChangeKg =
        deltas.find((d) => d.field === 'skeletalMuscleMassKg')?.delta ?? null;
    }

    const foodLogs = await this.prisma.foodLog.findMany({
      where: { userId, eatenAt: { gte: since } },
      select: { calories: true, proteinG: true, eatenAt: true },
    });
    const dayMap = new Map<string, { cal: number; protein: number }>();
    for (const log of foodLogs) {
      const key = dateKeyFromParts(getZonedDateParts(log.eatenAt));
      const cur = dayMap.get(key) ?? { cal: 0, protein: 0 };
      cur.cal += log.calories;
      cur.protein += log.proteinG;
      dayMap.set(key, cur);
    }
    const days = [...dayMap.values()];
    const avgCalories =
      days.length > 0
        ? Math.round(days.reduce((s, d) => s + d.cal, 0) / days.length)
        : null;
    const avgProteinG =
      days.length > 0
        ? Math.round(
            (days.reduce((s, d) => s + d.protein, 0) / days.length) * 10,
          ) / 10
        : null;

    const avgSleepMin = await this.sleep.averageDurationMinutes(userId, 7);
    const workouts = await this.exercise.countSince(userId, since);

    const activities = await this.prisma.activityDailyLog.findMany({
      where: {
        userId,
        activityDate: { gte: dateKeyFromParts(getZonedDateParts(since)) },
      },
    });
    const avgSteps =
      activities.length > 0
        ? Math.round(
            activities.reduce((s, a) => s + a.steps, 0) / activities.length,
          )
        : null;

    const hydrations = await this.prisma.hydrationLog.findMany({
      where: { userId, recordedAt: { gte: since } },
      select: { amountMl: true, recordedAt: true },
    });
    const waterByDay = new Map<string, number>();
    for (const h of hydrations) {
      const key = dateKeyFromParts(getZonedDateParts(h.recordedAt));
      waterByDay.set(key, (waterByDay.get(key) ?? 0) + h.amountMl);
    }
    const waterDays = [...waterByDay.values()];
    const avgWaterMl =
      waterDays.length > 0
        ? Math.round(waterDays.reduce((s, v) => s + v, 0) / waterDays.length)
        : null;

    const recoveries = await this.prisma.recoveryLog.findMany({
      where: {
        userId,
        recoveryDate: { gte: dateKeyFromParts(getZonedDateParts(since)) },
      },
    });
    const avgRecovery =
      recoveries.length > 0
        ? Math.round(
            (recoveries.reduce((s, r) => s + r.recoveryScore, 0) /
              recoveries.length) *
              10,
          ) / 10
        : null;

    return {
      weightChangeKg,
      bodyFatChangePct,
      waistChangeCm,
      muscleChangeKg,
      avgCalories,
      avgProteinG,
      avgSleepHours:
        avgSleepMin != null ? Math.round((avgSleepMin / 60) * 100) / 100 : null,
      workouts,
      avgSteps,
      avgWaterMl,
      avgRecovery,
    };
  }

  async getOrCreateReview(userId: string): Promise<{
    metrics: WeeklyMetrics;
    aiSummary: string | null;
    focus: string[];
    reused: boolean;
  }> {
    const { start, end } = this.weekBounds();
    const existing = await this.prisma.weeklyHealthReview.findUnique({
      where: { userId_weekStartDate: { userId, weekStartDate: start } },
    });
    if (existing) {
      return {
        metrics: JSON.parse(existing.metricsJson) as WeeklyMetrics,
        aiSummary: existing.aiSummary,
        focus: existing.focusJson
          ? (JSON.parse(existing.focusJson) as string[])
          : [],
        reused: true,
      };
    }

    const metrics = await this.aggregate(userId);
    let aiSummary: string | null = null;
    let focus: string[] = this.deterministicFocus(metrics);

    if (this.openai) {
      try {
        const result = await this.aiGateway.run(
          userId,
          'WEEKLY_REVIEW',
          async () => {
            const completion = await this.openai!.chat.completions.create({
              model: 'gpt-4o-mini',
              temperature: 0.4,
              max_tokens: 280,
              messages: [
                {
                  role: 'system',
                  content:
                    'You are Tastom personal health coach. Thai language. Short weekly summary, 1 positive observation, 1-3 practical focus actions. No diagnosis. No medication. Reply JSON: {"summary":"...","focus":["..."]}',
                },
                {
                  role: 'user',
                  content: JSON.stringify(metrics),
                },
              ],
            });
            const meta = usageFromOpenAiCompletion(completion, 'gpt-4o-mini');
            if (meta) reportAiTokenUsage(meta);
            const raw = completion.choices[0]?.message?.content ?? '{}';
            return JSON.parse(raw.replace(/```json|```/g, '').trim()) as {
              summary?: string;
              focus?: string[];
            };
          },
        );
        aiSummary = result.summary?.trim() || null;
        if (Array.isArray(result.focus) && result.focus.length > 0) {
          focus = result.focus.slice(0, 3).map(String);
        }
      } catch (error) {
        this.logger.warn(
          `Weekly AI review failed: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        aiSummary = this.fallbackSummary(metrics);
      }
    } else {
      aiSummary = this.fallbackSummary(metrics);
    }

    await this.prisma.weeklyHealthReview.create({
      data: {
        userId,
        weekStartDate: start,
        weekEndDate: end,
        metricsJson: JSON.stringify(metrics),
        aiSummary,
        focusJson: JSON.stringify(focus),
      },
    });

    return { metrics, aiSummary, focus, reused: false };
  }

  private deterministicFocus(m: WeeklyMetrics): string[] {
    const focus: string[] = [];
    if (m.avgProteinG != null && m.avgProteinG < 100) {
      focus.push('เพิ่มโปรตีนให้ใกล้เป้าทุกวัน');
    }
    if (m.avgSleepHours != null && m.avgSleepHours < 7) {
      focus.push('นอนให้ได้อย่างน้อย 7 ชั่วโมง');
    }
    if (m.workouts < 2) {
      focus.push('ออกกำลังกายอย่างน้อย 2–3 ครั้งสัปดาห์นี้');
    }
    if (focus.length === 0) {
      focus.push('รักษาความสม่ำเสมอในการบันทึกและตามเป้า');
    }
    return focus.slice(0, 3);
  }

  private fallbackSummary(m: WeeklyMetrics): string {
    const bits: string[] = [];
    if (m.weightChangeKg != null) {
      bits.push(
        `น้ำหนัก ${m.weightChangeKg > 0 ? '+' : ''}${m.weightChangeKg} kg`,
      );
    }
    if (m.avgCalories != null) {
      bits.push(`แคลเฉลี่ย ${m.avgCalories} kcal/วัน`);
    }
    if (m.workouts > 0) {
      bits.push(`ออกกำลังกาย ${m.workouts} ครั้ง`);
    }
    return bits.length > 0
      ? `สรุปสัปดาห์: ${bits.join(' · ')}`
      : 'ข้อมูลสัปดาห์นี้ยังน้อย — ลองบันทึกต่อเนื่องอีกหน่อยนะครับ';
  }
}

/** Body-scan extraction via vision — confirm before save. */
@Injectable()
export class BodyScanAnalysisService {
  private readonly logger = new Logger(BodyScanAnalysisService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly config: ConfigService,
    private readonly aiGateway: AiGatewayService,
    private readonly bodyScans: BodyScanService,
  ) {
    const key = (this.config.get<string>('OPENAI_API_KEY') ?? '').trim();
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  async extractFromImage(
    userId: string,
    imageBytes: Buffer,
    imageUrl?: string,
  ) {
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY missing');
    }
    const draft = await this.aiGateway.run(userId, 'BODY_SCAN', async () => {
      const b64 = imageBytes.toString('base64');
      const completion = await this.openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract body composition report numbers into JSON. Fields may be null. Keys: weightKg, bodyFatPercent, bodyFatMassKg, skeletalMuscleMassKg, leanBodyMassKg, visceralFatAreaCm2, waistCm, waistToHipRatio, bmrKcal, teeKcal, heightCm, reportVendor, reportedCaloriesMin, reportedCaloriesMax, reportedProteinMinG, reportedProteinMaxG, reportedCarbsMinG, reportedCarbsMaxG, reportedFatMinG, reportedFatMaxG. Numbers only. No diagnosis.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract measurable fields from this report.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${b64}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
      });
      const meta = usageFromOpenAiCompletion(completion, 'gpt-4o-mini');
      if (meta) reportAiTokenUsage(meta);
      const raw = completion.choices[0]?.message?.content ?? '{}';
      return JSON.parse(raw) as BodyScanDraft;
    });

    await this.bodyScans.upsertPending(userId, draft, imageUrl);
    return draft;
  }
}
