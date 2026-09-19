import { FoodLog } from '@prisma/client';
import { DailySummary } from './daily-totals.service';
import { DailyCoachSummary, MacroTotals } from './daily-summary.service';
import { formatZonedTime } from './day-bounds';
import { formatNumber } from './food.messages';

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
  const { consumed, target, remaining } = summary;

  return `📊 วันนี้

🔥 ${formatNumber(consumed.calories)} / ${formatNumber(target.calories)} kcal
${remainingLine(remaining.calories, 'kcal')}

🥩 Protein
${formatNumber(consumed.proteinG)} / ${formatNumber(target.proteinG)}g
${remainingLine(remaining.proteinG, 'g')}

🍚 Carbs
${formatNumber(consumed.carbsG)} / ${formatNumber(target.carbsG)}g

🥑 Fat
${formatNumber(consumed.fatG)} / ${formatNumber(target.fatG)}g`;
}

export function buildHistoryMessage(
  logs: Array<Pick<FoodLog, 'eatenAt' | 'foodName' | 'calories'>>,
): string {
  if (logs.length === 0) {
    return NO_FOOD_LOGS_TODAY_TEXT;
  }

  const lines = logs.map((log) => {
    const time = formatZonedTime(log.eatenAt);
    return `${time} · ${log.foodName} — ${formatNumber(log.calories)} kcal`;
  });

  const total = logs.reduce((sum, log) => sum + log.calories, 0);

  return `📋 ประวัติวันนี้

${lines.join('\n')}

รวม ${formatNumber(total)} kcal`;
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
  const { remaining, consumed, target } = summary;

  if (
    consumed.calories === 0 &&
    consumed.proteinG === 0 &&
    consumed.carbsG === 0 &&
    consumed.fatG === 0
  ) {
    return '💡 วันนี้ยังไม่มีรายการอาหารครับ พอพร้อมก็กินมื้อแรกแล้วส่งมาบันทึกได้เลย';
  }

  if (remaining.calories < 0) {
    const over = Math.abs(remaining.calories);
    return `💡 วันนี้เกินเป้าประมาณ ${formatNumber(over)} kcal
ไม่ต้องอดมื้อถัดไป — กลับมาตามเป้าปกติได้ครับ`;
  }

  if (remaining.calories <= 200) {
    return `💡 เหลือประมาณ ${formatNumber(remaining.calories)} kcal
ถ้าจะกินเพิ่ม เลือกมื้อเล็ก ๆ ในช่วงนี้ได้ครับ`;
  }

  const proteinGap = remaining.proteinG;
  if (proteinGap >= 40) {
    return `💡 ตอนนี้โปรตีนยังขาดประมาณ ${formatNumber(proteinGap)}g
มื้อต่อไปลองเน้นอาหารโปรตีนสูงได้ครับ`;
  }

  if (proteinGap >= 20 && remaining.calories > 200) {
    return `💡 โปรตีนยังเหลือประมาณ ${formatNumber(proteinGap)}g จากเป้า ${formatNumber(target.proteinG)}g
มื้อต่อไปลองเพิ่มแหล่งโปรตีนได้นะครับ`;
  }

  if (remaining.calories > 500) {
    return `💡 ยังเหลือประมาณ ${formatNumber(remaining.calories)} kcal
จัดมื้อต่อไปให้สมดุลตามเป้าได้ครับ`;
  }

  return `💡 กินไป ${formatNumber(consumed.calories)} / ${formatNumber(target.calories)} kcal แล้ว
เหลือประมาณ ${formatNumber(remaining.calories)} kcal ครับ`;
}

export function buildMealRecommendationFallback(
  remaining: MacroTotals,
): string {
  if (remaining.calories <= 0) {
    return `วันนี้แคลอรี่ใกล้หรือเกินเป้าแล้ว
ถ้าหิว เลือกของว่างโปรตีนสูงแคลต่ำ เช่น ไข่ต้ม หรือกรีกโยเกิร์ตไม่หวานจัดครับ
(ไม่ใช่คำแนะนำทางการแพทย์)`;
  }

  return `เหลือประมาณ:
${formatNumber(remaining.calories)} kcal
${formatNumber(Math.max(0, remaining.proteinG))}g protein
${formatNumber(Math.max(0, remaining.carbsG))}g carbs
${formatNumber(Math.max(0, remaining.fatG))}g fat

ไอเดียมื้อ (ประมาณคร่าว ๆ):
1) อกไก่ย่าง + ผัก
2) ไข่ + สลัด/ข้าวเล็กน้อย
3) ปลาอบ + ผัก
(เลือกให้พอดีช่วงที่เหลือ — ไม่ใช่สูตรแพทย์)`;
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
