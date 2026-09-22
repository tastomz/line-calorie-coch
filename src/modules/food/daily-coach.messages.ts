import { FoodLog } from '@prisma/client';
import { DailySummary } from './daily-totals.service';
import { DailyCoachSummary, MacroTotals } from './daily-summary.service';
import { formatZonedTime } from './day-bounds';
import { formatNumber } from './food.messages';
import {
  buildDailyMacroReport,
  buildNextMealTip,
  formatRemainingBudget,
} from './nutrition-display';

export const NO_FOOD_LOGS_TODAY_TEXT = 'วันนี้ยังไม่มีรายการอาหารครับ';

export const PROFILE_REQUIRED_TEXT =
  'กรุณาตั้งค่าโปรไฟล์ก่อนครับ\nพิมพ์ "เริ่ม" ได้เลย';

export const DAILY_SUMMARY_ERROR_TEXT =
  'ระบบกำลังมีปัญหาชั่วคราวครับ\nลองใหม่อีกครั้งในอีกสักครู่';

function remainingLine(remaining: number, unit: string): string {
  if (remaining >= 0) {
    return `เหลือ ${formatNumber(remaining)} ${unit}`;
  }
  return `เกิน ${formatNumber(Math.abs(remaining))} ${unit}`;
}

/** Compact daily summary for LINE. */
export function buildDailyCoachSummaryMessage(
  summary: DailyCoachSummary,
): string {
  return `📊 วันนี้

${buildDailyMacroReport(summary)}`;
}

export function buildHistoryMessage(
  logs: Array<Pick<FoodLog, 'eatenAt' | 'foodName' | 'calories'>>,
): string {
  if (logs.length === 0) {
    return NO_FOOD_LOGS_TODAY_TEXT;
  }

  const lines = logs.map((log) => {
    const time = formatZonedTime(log.eatenAt);
    return `${time}  ${log.foodName}   ${formatNumber(log.calories)} kcal`;
  });

  const total = logs.reduce((sum, log) => sum + log.calories, 0);

  return `🍽️ มื้อที่บันทึก

${lines.join('\n')}

รวม ${formatNumber(total)} kcal · ${logs.length} มื้อ`;
}

export function buildCaloriesConsumedMessage(
  summary: DailyCoachSummary,
): string {
  return `วันนี้กินไปแล้ว ${formatNumber(summary.consumed.calories)} / ${formatNumber(summary.target.calories)} kcal
${remainingLine(summary.remaining.calories, 'kcal')}`;
}

export function buildCaloriesRemainingMessage(
  summary: DailyCoachSummary,
): string {
  return `วันนี้${remainingLine(summary.remaining.calories, 'kcal')}`;
}

export function buildProteinConsumedMessage(
  summary: DailyCoachSummary,
): string {
  return `วันนี้กินโปรตีนไปแล้ว ${formatNumber(summary.consumed.proteinG)} / ${formatNumber(summary.target.proteinG)} g
${remainingLine(summary.remaining.proteinG, 'g')}`;
}

export function buildProteinRemainingMessage(
  summary: DailyCoachSummary,
): string {
  return `โปรตีน${remainingLine(summary.remaining.proteinG, 'g')}`;
}

/**
 * One concise insight from DB numbers — never invents totals.
 */
export function buildDeterministicCoachTip(summary: DailyCoachSummary): string {
  return `💡 มื้อถัดไป\n${buildNextMealTip(summary)}`;
}

export function buildMealRecommendationFallback(
  remaining: MacroTotals,
): string {
  if (remaining.calories <= 0) {
    return `วันนี้แคลอรี่ใกล้หรือเกินเป้าแล้ว
ถ้าหิว เลือกของว่างโปรตีนสูงแคลต่ำ เช่น ไข่ต้ม หรือกรีกโยเกิร์ตไม่หวานจัดครับ
(ไม่ใช่คำแนะนำทางการแพทย์)`;
  }

  return `เหลือวันนี้

${formatRemainingBudget(remaining)}

💡 มื้อถัดไป
เน้นโปรตีนเป็นหลัก
เช่น ไก่ / ปลา / ไข่ + ข้าวในปริมาณพอดี`;
}

/** Adapt Phase 3 DailySummary into coach tip when confirming food. */
export function toCoachSummary(
  summary: DailySummary,
): DailyCoachSummary | null {
  if (!summary.targets) {
    return null;
  }
  return {
    date: new Date(),
    consumed: {
      calories: summary.totals.calories,
      proteinG: summary.totals.proteinG,
      carbsG: summary.totals.carbsG,
      fatG: summary.totals.fatG,
    },
    target: {
      calories: summary.targets.dailyCalories,
      proteinG: summary.targets.dailyProteinG,
      carbsG: summary.targets.dailyCarbsG,
      fatG: summary.targets.dailyFatG,
    },
    remaining: {
      calories: summary.targets.dailyCalories - summary.totals.calories,
      proteinG: summary.targets.dailyProteinG - summary.totals.proteinG,
      carbsG: summary.targets.dailyCarbsG - summary.totals.carbsG,
      fatG: summary.targets.dailyFatG - summary.totals.fatG,
    },
  };
}
