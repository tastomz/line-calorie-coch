import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyCoachSummary } from '../food/daily-summary.service';
import { formatNumber } from '../food/food.messages';
import { buildNextMealTip } from '../food/nutrition-display';
import {
  ActivityLogService,
  ExerciseLogService,
  HydrationLogService,
  RecoveryLogService,
  SleepLogService,
} from './health-logs.service';
import { getProgramWeekDay } from './program-week';

export type DailyHealthSnapshot = {
  programLabel: string;
  nutrition: DailyCoachSummary | null;
  weightKg: number | null;
  sleepMinutes: number | null;
  exerciseMinutes: number;
  steps: number | null;
  waterMl: number;
  waterTargetMl: number;
  recoveryScore: number | null;
  tip: string;
};

@Injectable()
export class HealthDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sleep: SleepLogService,
    private readonly exercise: ExerciseLogService,
    private readonly activity: ActivityLogService,
    private readonly hydration: HydrationLogService,
    private readonly recovery: RecoveryLogService,
  ) {}

  async buildToday(params: {
    userId: string;
    userCreatedAt: Date;
    nutrition: DailyCoachSummary | null;
    todayWeightKg: number | null;
  }): Promise<DailyHealthSnapshot> {
    const program = getProgramWeekDay(params.userCreatedAt);
    const [latestSleep, exerciseMinutes, activity, waterMl, recovery] =
      await Promise.all([
        this.sleep.latest(params.userId),
        this.exercise.todayTotalMinutes(params.userId),
        this.activity.getToday(params.userId),
        this.hydration.todayTotalMl(params.userId),
        this.recovery.getToday(params.userId),
      ]);

    const tip = params.nutrition
      ? buildNextMealTip(params.nutrition)
      : 'บันทึกมื้ออาหารและสุขภาพวันต่อวันได้เลยครับ';

    return {
      programLabel: program.label,
      nutrition: params.nutrition,
      weightKg: params.todayWeightKg,
      sleepMinutes: latestSleep?.durationMinutes ?? null,
      exerciseMinutes,
      steps: activity?.steps ?? null,
      waterMl,
      waterTargetMl: this.hydration.defaultTargetMl,
      recoveryScore: recovery?.recoveryScore ?? null,
      tip,
    };
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  formatDashboardText(snap: DailyHealthSnapshot): string {
    const lines = [`📊 วันนี้`, snap.programLabel, ''];
    if (snap.nutrition) {
      lines.push(
        `🔥 ${formatNumber(snap.nutrition.consumed.calories)} / ${formatNumber(snap.nutrition.target.calories)} kcal`,
      );
      lines.push(
        `🥩 ${formatNumber(snap.nutrition.consumed.proteinG)} / ${formatNumber(snap.nutrition.target.proteinG)} g`,
      );
      lines.push('');
    }
    if (snap.weightKg != null) {
      lines.push(`⚖️ ${snap.weightKg.toFixed(1)} kg`);
    }
    if (snap.sleepMinutes != null) {
      lines.push(`😴 ${this.formatDuration(snap.sleepMinutes)}`);
    }
    if (snap.exerciseMinutes > 0) {
      lines.push(`🏋️ ${snap.exerciseMinutes} min`);
    }
    if (snap.steps != null) {
      lines.push(`👣 ${formatNumber(snap.steps)}`);
    }
    lines.push(
      `💧 ${(snap.waterMl / 1000).toFixed(1)} / ${(snap.waterTargetMl / 1000).toFixed(1)} L`,
    );
    if (snap.recoveryScore != null) {
      lines.push(`❤️ Recovery ${snap.recoveryScore}/5`);
    }
    lines.push('', '💡 Coach Tip', snap.tip);
    return lines.join('\n');
  }
}

@Injectable()
export class HealthInsightService {
  /** Deterministic insights only — never invents missing data. */
  buildInsights(snap: DailyHealthSnapshot): string[] {
    const out: string[] = [];
    if (snap.nutrition) {
      if (snap.nutrition.remaining.proteinG >= 40) {
        out.push(
          `โปรตีนยังขาดประมาณ ${formatNumber(snap.nutrition.remaining.proteinG)}g จากเป้าวันนี้`,
        );
      }
      if (snap.nutrition.remaining.calories < 0) {
        out.push(
          `พลังงานเกินเป้าประมาณ ${formatNumber(Math.abs(snap.nutrition.remaining.calories))} kcal`,
        );
      }
    }
    if (snap.sleepMinutes != null && snap.sleepMinutes < 6 * 60) {
      out.push('การนอนคืนล่าสุดสั้นกว่า 6 ชั่วโมง');
    }
    if (snap.steps != null && snap.steps < 5000) {
      out.push('ก้าววันนี้ยังต่ำกว่า 5,000');
    }
    if (snap.waterMl < snap.waterTargetMl * 0.5) {
      out.push('น้ำดื่มยังไม่ถึงครึ่งเป้าวันนี้');
    }
    if (snap.exerciseMinutes === 0) {
      out.push('ยังไม่มีบันทึกออกกำลังกายวันนี้');
    }
    return out.slice(0, 3);
  }
}
