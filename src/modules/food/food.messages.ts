import { PendingFoodAnalysis } from '@prisma/client';
import { FoodAnalysisResult } from './food-analysis.types';
import { DailySummary } from './daily-totals.service';
import { quantityUnitLabelTh } from './quantity-adjustment';
import { buildDailyMacroReport } from './nutrition-display';

export const FOOD_CONFIRM_CHOICES = [
  { label: '✓ บันทึก', text: 'บันทึก' },
  { label: '✎ แก้ไข', text: 'แก้ไข' },
  { label: '✕ ยกเลิก', text: 'ยกเลิก' },
];

export const REPLACE_PENDING_CHOICES = [
  { label: 'ยกเลิกรายการเดิม', text: 'ยกเลิกรายการเดิม' },
  { label: 'กลับไปยืนยัน', text: 'กลับไปยืนยัน' },
];

export const COMPLETE_PROFILE_FIRST_TEXT =
  'กรุณาตั้งค่าโปรไฟล์ให้เสร็จก่อนนะครับ\nพิมพ์ "เริ่ม" หรือกดปุ่มด้านล่าง';

export const INCOMPLETE_ONBOARDING_CHOICES = [
  { label: 'ตั้งค่าโปรไฟล์', text: 'เริ่ม' },
  { label: 'เริ่มต้นใช้งาน', text: 'เริ่ม' },
];

export const FOOD_ANALYSIS_FAILED_TEXT =
  'ตอนนี้ระบบวิเคราะห์อาหารมีปัญหาชั่วคราวครับ\nลองใหม่อีกครั้งได้เลย';

export const SYSTEM_BUSY_TEXT =
  'ระบบกำลังมีปัญหาชั่วคราวครับ\nลองใหม่อีกครั้งในอีกสักครู่';

export const NO_PENDING_FOOD_TEXT =
  'ยังไม่มีมื้ออาหารที่รอยืนยันครับ\nส่งชื่ออาหารหรือรูปอาหารมาได้เลย';

export const FOOD_CANCELLED_TEXT = '✕ ยกเลิกการบันทึกแล้วครับ';

export const FOOD_INVALID_CONFIRM_TEXT =
  'เลือกได้เลยครับ: ✓ บันทึก · ✎ แก้ไข · ✕ ยกเลิก';

export const FOOD_QUANTITY_CLARIFY_TEXT =
  'ประมาณเท่าไรครับ?\nเช่น กินแค่ 3 ชิ้น · กินครึ่งหนึ่ง · กินแค่ 50%';

export const FOOD_EDIT_HELP_TEXT = `แก้ไขได้เลยครับ เช่น
• กินแค่ 3 ชิ้น
• กินครึ่งหนึ่ง
• แคลน่าจะ 500
• ไม่ใช่ไก่ เป็นหมู

หรือกด บันทึก / ยกเลิก`;

export const FOOD_RATE_LIMITED_TEXT =
  'ส่งคำขอถี่เกินไปนิดนึงครับ\nรอสักครู่แล้วลองใหม่ได้เลย';

export const AMBIGUOUS_NUMBER_TEXT =
  'หมายถึงน้ำหนักหรือจำนวนอาหารครับ?\n• น้ำหนัก เช่น "น้ำหนัก 84.2"\n• จำนวนอาหาร ส่งชื่อ/รูปก่อน แล้วพิมพ์ เช่น "3"';

export const LOG_FOOD_HINT_TEXT =
  'ส่งชื่ออาหารหรือรูปอาหารมาได้เลยครับ\nเช่น "ข้าวกะเพราไก่ไข่ดาว"';

export const FOOD_EDIT_NOT_FOUND_TEXT =
  'ไม่พบมื้ออาหารนี้ในรายการวันนี้ครับ\nพิมพ์ "ประวัติ" เพื่อดูมื้อวันนี้';

export const FOOD_EDIT_CANCELLED_TEXT = 'ยกเลิกการแก้ไขแล้วครับ';

export const FOOD_EDIT_QTY_PROMPT_TEXT = `พิมพ์ปริมาณใหม่ได้เลยครับ เช่น
• ครึ่งหนึ่ง
• กินแค่ 50%
• 0.5
• กิน 2 เท่า (พิมพ์ 2)`;

export const FOOD_EDIT_NAME_PROMPT_TEXT =
  'พิมพ์ชื่ออาหารใหม่ได้เลยครับ\nจะประมาณสารอาหารใหม่ให้ก่อน แล้วยืนยันอีกครั้ง';

export const FOOD_EDIT_NUT_PROMPT_TEXT = `พิมพ์สารอาหารใหม่ได้เลยครับ เช่น
• kcal 650 protein 35 carbs 70 fat 20
• 650 35 70 20`;

export const FOOD_EDIT_NUT_INVALID_TEXT =
  'รูปแบบสารอาหารไม่ถูกต้องครับ\nเช่น kcal 650 protein 35 carbs 70 fat 20';

export const FOOD_EDIT_QTY_INVALID_TEXT =
  'ยังจับปริมาณไม่ชัดครับ\nลองพิมพ์ เช่น ครึ่งหนึ่ง · 50% · 0.5';

export const FOOD_EDIT_DELETED_TEXT = (foodName: string): string =>
  `🗑️ ลบ "${foodName}" แล้วครับ`;

export const FOOD_EDIT_UPDATED_TEXT = (foodName: string): string =>
  `✏️ อัปเดต "${foodName}" แล้วครับ`;

export const GENERAL_HELP_TEXT =
  'ส่งได้เลยครับ เช่น น้ำหนัก 84.2 · ชื่อ/รูปอาหาร · หรือพิมพ์ "วันนี้"';

export const REPLACE_PENDING_TEXT =
  'มีรายการอาหารที่กำลังรอยืนยันอยู่ครับ\nต้องการยกเลิกรายการเดิมแล้วเริ่มรายการใหม่ไหม?';

export const MEDICAL_ADVICE_TEXT =
  'เรื่องสุขภาพเฉพาะบุคคลควรปรึกษาแพทย์หรือนักโภชนาการนะครับ\nผมช่วยติดตามแคลอรี่/มื้ออาหารในชีวิตประจำวันได้ แต่ไม่ใช่คำแนะนำทางการแพทย์';

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatMacro(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Concise estimate card for LINE. */
export function buildFoodEstimateMessage(
  analysis: FoodAnalysisResult,
  pending?: Pick<
    PendingFoodAnalysis,
    'originalQuantity' | 'consumedQuantity' | 'quantityUnit'
  > | null,
): string {
  const confidencePct = Math.round(analysis.confidence * 100);
  const unit = quantityUnitLabelTh(
    pending?.quantityUnit ?? analysis.quantityUnit,
  );
  const originalQty = pending?.originalQuantity ?? analysis.estimatedQuantity;
  const consumedQty = pending?.consumedQuantity ?? analysis.estimatedQuantity;
  const qtyChanged =
    pending != null &&
    pending.originalQuantity != null &&
    pending.consumedQuantity != null &&
    pending.consumedQuantity !== pending.originalQuantity;

  const qtyLine = qtyChanged
    ? `${formatMacro(consumedQty)} / ${formatMacro(originalQty)} ${unit}`
    : `${formatMacro(originalQty)} ${unit}`;

  const assumptionLine =
    analysis.assumptions.length > 0
      ? `\n\n💬 สมมติฐาน: ${analysis.assumptions.slice(0, 2).join(' · ')}`
      : '';

  return `🍽️ ประเมินมื้อนี้

${analysis.foodName}
🔥 ประมาณ ${formatNumber(analysis.estimatedCalories)} kcal
📏 ${qtyLine}

🥩 ${formatMacro(analysis.proteinG)}g · 🍚 ${formatMacro(analysis.carbsG)}g · 🥑 ${formatMacro(analysis.fatG)}g

✨ ความมั่นใจ ${confidencePct}%${assumptionLine}

ถ้ากินไม่หมด พิมพ์จำนวนได้ เช่น กินแค่ 3 ชิ้น`;
}

/** After proportional quantity adjustment (no AI). */
export function buildQuantityAdjustedMessage(
  analysis: FoodAnalysisResult,
  pending: Pick<
    PendingFoodAnalysis,
    'originalQuantity' | 'consumedQuantity' | 'quantityUnit'
  >,
): string {
  const unit = quantityUnitLabelTh(
    pending.quantityUnit ?? analysis.quantityUnit,
  );
  const consumed = pending.consumedQuantity ?? analysis.estimatedQuantity;
  const original = pending.originalQuantity ?? analysis.estimatedQuantity;

  return `🍣 ปรับเป็น ${formatMacro(consumed)} ${unit}

📏 ${formatMacro(consumed)} / ${formatMacro(original)} ${unit}
🔥 ${formatNumber(analysis.estimatedCalories)} kcal
🥩 ${formatMacro(analysis.proteinG)}g · 🍚 ${formatMacro(analysis.carbsG)}g · 🥑 ${formatMacro(analysis.fatG)}g`;
}

export function buildFoodSavedMessage(
  analysis: FoodAnalysisResult,
  summary: DailySummary,
): string {
  const coach = toCoachSummaryFromDaily(summary);
  const mealBlock = `✅ บันทึกแล้ว

🍽️ ${analysis.foodName}
🔥 ${formatNumber(analysis.estimatedCalories)} kcal
🥩 ${formatMacro(analysis.proteinG)}g · 🍚 ${formatMacro(analysis.carbsG)}g · 🥑 ${formatMacro(analysis.fatG)}g`;

  if (!coach) {
    return mealBlock;
  }

  return `${mealBlock}

📊 วันนี้
${buildDailyMacroReport(coach)}`;
}

function toCoachSummaryFromDaily(summary: DailySummary) {
  if (!summary.targets) return null;
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

export function buildProfileMessage(params: {
  currentWeightKg: number;
  targetWeightKg: number;
  dailyCalories: number;
  dailyProteinG: number;
  dailyCarbsG: number;
  dailyFatG: number;
}): string {
  return `👤 โปรไฟล์

⚖️ ปัจจุบัน ${formatMacro(params.currentWeightKg)} kg
🎯 เป้า ${formatMacro(params.targetWeightKg)} kg

🔥 พลังงาน ${formatNumber(params.dailyCalories)} kcal/วัน
🥩 โปรตีน ${formatNumber(params.dailyProteinG)} g
🍚 คาร์บ ${formatNumber(params.dailyCarbsG)} g
🥑 ไขมัน ${formatNumber(params.dailyFatG)} g

พิมพ์ "แก้ไขโปรไฟล์" เพื่อตั้งค่าใหม่`;
}
