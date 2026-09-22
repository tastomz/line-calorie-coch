import { DailyCoachSummary, MacroTotals } from './daily-summary.service';

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** Eaten vs daily target — aligned scan format. */
export function formatEatenVsTarget(
  consumed: MacroTotals,
  target: MacroTotals,
): string {
  return [
    `🔥 พลังงาน      ${formatNumber(consumed.calories)} / ${formatNumber(target.calories)} kcal`,
    `🥩 โปรตีน        ${formatNumber(consumed.proteinG)} / ${formatNumber(target.proteinG)} g`,
    `🍚 คาร์บ         ${formatNumber(consumed.carbsG)} / ${formatNumber(target.carbsG)} g`,
    `🥑 ไขมัน         ${formatNumber(consumed.fatG)} / ${formatNumber(target.fatG)} g`,
  ].join('\n');
}

/**
 * Remaining budget ("จำนวนที่กินได้") for the rest of today.
 * Negative values show as over-target.
 */
export function formatRemainingBudget(remaining: MacroTotals): string {
  const cal =
    remaining.calories < 0
      ? `🔥 เกิน ${formatNumber(Math.abs(remaining.calories))} kcal`
      : `🔥 ${formatNumber(remaining.calories)} kcal`;
  const protein =
    remaining.proteinG < 0
      ? `🥩 โปรตีน เกิน ${formatNumber(Math.abs(remaining.proteinG))}g`
      : `🥩 โปรตีน ${formatNumber(remaining.proteinG)}g`;
  const carbs =
    remaining.carbsG < 0
      ? `🍚 คาร์บ เกิน ${formatNumber(Math.abs(remaining.carbsG))}g`
      : `🍚 คาร์บ ${formatNumber(remaining.carbsG)}g`;
  const fat =
    remaining.fatG < 0
      ? `🥑 ไขมัน เกิน ${formatNumber(Math.abs(remaining.fatG))}g`
      : `🥑 ไขมัน ${formatNumber(remaining.fatG)}g`;
  return [cal, protein, carbs, fat].join('\n');
}

/** Short next-meal coaching (1–2 lines, no emoji prefix). */
export function buildNextMealTip(summary: DailyCoachSummary): string {
  const { remaining, consumed } = summary;

  if (
    consumed.calories === 0 &&
    consumed.proteinG === 0 &&
    consumed.carbsG === 0 &&
    consumed.fatG === 0
  ) {
    return 'พอพร้อมก็กินมื้อแรกแล้วส่งมาบันทึกได้เลย';
  }

  if (remaining.calories < 0) {
    return 'ไม่ต้องอดมื้อถัดไป\nกลับมาตามเป้าปกติได้ครับ';
  }

  if (remaining.calories <= 200) {
    return 'ถ้าจะกินเพิ่ม เลือกมื้อเล็ก ๆ\nในช่วงนี้ได้ครับ';
  }

  if (remaining.proteinG >= 40) {
    return 'เน้นโปรตีนเป็นหลัก\nเช่น ไก่ / ปลา / ไข่ + ข้าวในปริมาณพอดี';
  }

  if (remaining.proteinG >= 20 && remaining.calories > 200) {
    return 'มื้อต่อไปลองเพิ่มแหล่งโปรตีน\nเช่น ไก่ / ไข่ / ปลา ได้ครับ';
  }

  if (remaining.calories > 500) {
    return 'จัดมื้อถัดไปให้สมดุลตามเป้าได้ครับ';
  }

  return 'บันทึกมื้อถัดไปได้เมื่อพร้อม';
}

/** Full block: eaten / remaining budget / next meal. */
export function buildDailyMacroReport(summary: DailyCoachSummary): string {
  return `${formatEatenVsTarget(summary.consumed, summary.target)}

เหลือวันนี้

${formatRemainingBudget(summary.remaining)}

💡 มื้อถัดไป
${buildNextMealTip(summary)}`;
}
