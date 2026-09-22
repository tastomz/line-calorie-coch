import {
  AiOperation,
  FREE_AI_LIMITS,
  PRO_AI_LIMITS,
  PRO_MONTHLY_PRICE_THB,
} from './plan.config';
import {
  DailyUsageSnapshot,
  EffectiveEntitlement,
} from './subscription-entitlement.service';
import { AiQuotaExceededError } from './membership.errors';

export const MEMBERSHIP_COMMANDS = [
  'สมาชิก',
  'แพ็กเกจ',
  'สิทธิ์',
  '👤 สมาชิก',
] as const;

export function isMembershipCommand(text: string): boolean {
  const t = text.trim();
  return (MEMBERSHIP_COMMANDS as readonly string[]).includes(t);
}

/** Parse "ใช้โค้ด CODE" / "ใช้โค้ดCODE". */
export function parsePromoCommand(text: string): string | null {
  const m = text.trim().match(/^ใช้โค้ด\s+(.+)$/i);
  if (!m) {
    return null;
  }
  const code = m[1].trim();
  return code.length > 0 ? code : null;
}

function opUsed(usage: DailyUsageSnapshot, op: AiOperation): number {
  switch (op) {
    case 'FOOD_TEXT':
      return usage.foodTextCalls;
    case 'FOOD_VISION':
      return usage.visionCalls;
    case 'COMPOSITION_ADJUSTMENT':
      return usage.adjustmentCalls;
    case 'COACH':
      return usage.coachCalls;
    case 'CLASSIFY':
      return usage.classifyCalls;
    case 'BODY_SCAN':
      return usage.bodyScanCalls;
    case 'MEAL_PLAN':
      return usage.mealPlanCalls;
    case 'WEEKLY_REVIEW':
      return usage.weeklyReviewCalls;
  }
}

function formatDateTh(d: Date | null): string {
  if (!d) {
    return '-';
  }
  return d.toLocaleString('th-TH', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function buildMembershipStatusMessage(
  entitlement: EffectiveEntitlement,
  usage: DailyUsageSnapshot,
  opts?: { upgradeUrl?: string | null; paymentConfigured?: boolean },
): string {
  const limits = entitlement.plan === 'PRO' ? PRO_AI_LIMITS : FREE_AI_LIMITS;

  const usageBlock = `AI วันนี้:
🍚 อาหารข้อความ ${opUsed(usage, 'FOOD_TEXT')}/${limits.FOOD_TEXT}
📸 รูปอาหาร ${opUsed(usage, 'FOOD_VISION')}/${limits.FOOD_VISION}
🧍 Body Scan ${opUsed(usage, 'BODY_SCAN')}/${limits.BODY_SCAN}
🍱 Meal ideas ${opUsed(usage, 'MEAL_PLAN')}/${limits.MEAL_PLAN}
🔧 แก้ไขอาหาร ${opUsed(usage, 'COMPOSITION_ADJUSTMENT')}/${limits.COMPOSITION_ADJUSTMENT}
🤖 AI Coach ${opUsed(usage, 'COACH')}/${limits.COACH}
📈 Weekly ${opUsed(usage, 'WEEKLY_REVIEW')}/${limits.WEEKLY_REVIEW}`;

  if (entitlement.hasProAccess) {
    const statusLabel =
      entitlement.status === 'TRIALING'
        ? 'ทดลองใช้ (Trial)'
        : entitlement.status === 'CANCELED'
          ? 'ยกเลิกแล้ว (ใช้ได้ถึงสิ้นรอบบิล)'
          : 'ใช้งานอยู่';
    return `👑 Tastom Pro

${PRO_MONTHLY_PRICE_THB} บาท/เดือน
สถานะ: ${statusLabel}

${usageBlock}

หมดอายุ: ${formatDateTh(entitlement.periodEnd)}

Pro ใช้งาน AI ได้มากขึ้น`;
  }

  const upgrade =
    opts?.upgradeUrl != null
      ? `\n\n👑 Pro\n${PRO_MONTHLY_PRICE_THB} บาท/เดือน\nใช้งาน AI ได้มากขึ้น\n\nสมัคร Pro:\n${opts.upgradeUrl}`
      : `\n\n👑 Pro\n${PRO_MONTHLY_PRICE_THB} บาท/เดือน\nใช้งาน AI ได้มากขึ้น\n(ตั้งค่า MEMBERSHIP_WEB_URL เพื่อเปิดลิงก์สมัคร)`;

  const payNote = opts?.paymentConfigured
    ? ''
    : '\n(Stripe ยังเป็นโหมดทดสอบ / ยังไม่เปิด LIVE)';

  return `👤 สมาชิก

แพ็กเกจ: Free
${usageBlock}

Core nutrition tracking ใช้งานฟรี${upgrade}${payNote}`;
}

export function buildQuotaExceededMessage(
  error: AiQuotaExceededError,
  upgradeUrl?: string | null,
): string {
  const labels: Record<AiOperation, string> = {
    FOOD_TEXT: 'วิเคราะห์ข้อความ',
    FOOD_VISION: 'วิเคราะห์รูป',
    COMPOSITION_ADJUSTMENT: 'แก้ไขอาหาร',
    COACH: 'AI Coach',
    CLASSIFY: 'จัดประเภทข้อความ',
    BODY_SCAN: 'Body Scan',
    MEAL_PLAN: 'แนะนำมื้ออาหาร',
    WEEKLY_REVIEW: 'สรุปสัปดาห์',
  };
  const emoji =
    error.operation === 'FOOD_VISION'
      ? '📸'
      : error.operation === 'FOOD_TEXT'
        ? '🍽️'
        : '⚠️';

  const upgrade =
    error.plan === 'FREE'
      ? `\n\n👑 Pro ${PRO_MONTHLY_PRICE_THB} บาท/เดือน\nใช้งาน AI ได้มากขึ้น${
          upgradeUrl ? `\n${upgradeUrl}` : ''
        }`
      : '';

  return `${emoji} โควต้า${labels[error.operation]}วันนี้ครบแล้ว

ใช้ไปแล้ว ${error.used}/${error.limit} ครั้ง

โควต้าจะรีเซ็ตวันพรุ่งนี้${upgrade}`;
}

export function buildPromoSuccessMessage(params: {
  code: string;
  trialDays: number;
  expiresAt: Date;
}): string {
  return `🎉 ใช้โค้ดสำเร็จ!

คุณได้รับ Pro ฟรี ${params.trialDays} วัน

หมดอายุ: ${formatDateTh(params.expiresAt)}`;
}

export function buildPromoErrorMessage(
  code:
    | 'invalid'
    | 'expired'
    | 'inactive'
    | 'max_reached'
    | 'already_redeemed'
    | 'already_pro'
    | 'trial_active',
): string {
  switch (code) {
    case 'already_redeemed':
      return 'คุณเคยใช้โค้ดนี้ไปแล้วครับ';
    case 'max_reached':
      return 'โค้ดนี้ถูกใช้ครบจำนวนแล้วครับ';
    case 'already_pro':
      return 'คุณมี Pro อยู่แล้วครับ\nไม่สามารถใช้โค้ดนี้เพื่อแทนที่สมาชิกปัจจุบันได้';
    case 'trial_active':
      return 'คุณกำลังใช้ Pro ทดลองอยู่แล้วครับ\nยังไม่สามารถซ้อนโค้ดเพิ่มได้';
    case 'expired':
    case 'inactive':
    case 'invalid':
    default:
      return 'โค้ดนี้ไม่ถูกต้องหรือหมดอายุแล้วครับ';
  }
}
