import { NutritionTargets } from '../nutrition/nutrition.types';
import { formatNumber, goalLabel } from './onboarding.parser';
import { Goal } from '../nutrition/nutrition.types';

export const SEX_CHOICES = [
  { label: 'ชาย', text: 'ชาย' },
  { label: 'หญิง', text: 'หญิง' },
];

export const ACTIVITY_CHOICES = [
  { label: 'น้อยมาก', text: 'น้อยมาก' },
  { label: 'เบา', text: 'เบา' },
  { label: 'ปานกลาง', text: 'ปานกลาง' },
  { label: 'มาก', text: 'มาก' },
  { label: 'มากมาก', text: 'มากมาก' },
];

export const GOAL_CHOICES = [
  { label: 'ลดน้ำหนัก', text: 'ลดน้ำหนัก' },
  { label: 'รักษาน้ำหนัก', text: 'รักษาน้ำหนัก' },
  { label: 'เพิ่มน้ำหนัก', text: 'เพิ่มน้ำหนัก' },
];

export const CONFIRM_CHOICES = [
  { label: 'ยืนยัน', text: 'ยืนยัน' },
  { label: 'แก้ไข', text: 'แก้ไข' },
];

export const MAIN_MENU_CHOICES = [
  { label: '🍽️ วันนี้', text: '🍽️ วันนี้' },
  { label: '📸 บันทึกอาหาร', text: '📸 บันทึกอาหาร' },
  { label: '⚖️ น้ำหนัก', text: '⚖️ น้ำหนัก' },
  { label: '📋 ประวัติ', text: '📋 ประวัติ' },
  { label: '👤 โปรไฟล์', text: '👤 โปรไฟล์' },
];

export const INCOMPLETE_MENU_CHOICES = [
  { label: 'ตั้งค่าโปรไฟล์', text: 'เริ่ม' },
  { label: 'เริ่มต้นใช้งาน', text: 'เริ่ม' },
];

export const WELCOME_TEXT = `👋 สวัสดีครับ

ผมจะช่วยบันทึกอาหารและติดตามเป้าหมายของคุณ

ก่อนเริ่ม ขอข้อมูลเล็กน้อยเพื่อคำนวณเป้าหมายต่อวันครับ

คุณเป็นเพศอะไร?`;

export const ASK_AGE_TEXT = 'อายุเท่าไรครับ?';
export const ASK_HEIGHT_TEXT = `ส่วนสูงเท่าไรครับ?
ตัวอย่าง: 181`;
export const ASK_CURRENT_WEIGHT_TEXT = `น้ำหนักปัจจุบันเท่าไรครับ?
ตัวอย่าง: 84`;
export const ASK_TARGET_WEIGHT_TEXT = `น้ำหนักเป้าหมายเท่าไรครับ?
ตัวอย่าง: 74`;
export const ASK_ACTIVITY_TEXT = 'โดยปกติคุณมีกิจกรรมประมาณไหน?';
export const ASK_GOAL_TEXT = 'เป้าหมายของคุณคืออะไร?';

export const INVALID_AGE_TEXT = `⚠️ ขออายุระหว่าง 10–100 ปีนะครับ
เช่น 29`;
export const INVALID_HEIGHT_TEXT = `⚠️ ขอส่วนสูงระหว่าง 100–250 ซม. นะครับ
เช่น 181`;
export const INVALID_CURRENT_WEIGHT_TEXT = `⚠️ ขอน้ำหนักปัจจุบันระหว่าง 20–300 กก. นะครับ
เช่น 84`;
export const INVALID_TARGET_WEIGHT_TEXT = `⚠️ ขอน้ำหนักเป้าหมายระหว่าง 20–300 กก. นะครับ
เช่น 74`;
export const INVALID_SEX_TEXT = `⚠️ กรุณาเลือกเพศจากปุ่มนะครับ
ชาย หรือ หญิง`;
export const INVALID_ACTIVITY_TEXT = `⚠️ กรุณาเลือกระดับกิจกรรมจากปุ่มนะครับ`;
export const INVALID_GOAL_TEXT = `⚠️ กรุณาเลือกเป้าหมายจากปุ่มนะครับ`;
export const INVALID_CONFIRM_TEXT = `⚠️ กรุณาเลือก ยืนยัน หรือ แก้ไข นะครับ`;

export const FEATURE_WIP_TEXT = 'ฟีเจอร์นี้ยังไม่พร้อมครับ';

export const WELCOME_BACK_TEXT = 'ยินดีต้อนรับกลับครับ';

export const COMPLETED_TEXT = `🎉 ตั้งค่าเรียบร้อยครับ

จากนี้ส่งรูปหรือชื่ออาหารมาได้เลย`;

export function buildConfirmationText(params: {
  currentWeightKg: number;
  targetWeightKg: number;
  goal: Goal;
  targets: NutritionTargets;
}): string {
  return `🎯 เป้าหมายของคุณ

น้ำหนักปัจจุบัน
${formatNumber(params.currentWeightKg)} kg

น้ำหนักเป้าหมาย
${formatNumber(params.targetWeightKg)} kg

Calories
${formatNumber(params.targets.dailyCalories)} kcal/day

Protein
${formatNumber(params.targets.dailyProteinG)} g/day

Carbs
ประมาณ ${formatNumber(params.targets.dailyCarbsG)} g/day

Fat
ประมาณ ${formatNumber(params.targets.dailyFatG)} g/day

เป้าหมาย:
${goalLabel(params.goal)}

ใช้เป้าหมายนี้ไหมครับ?`;
}
