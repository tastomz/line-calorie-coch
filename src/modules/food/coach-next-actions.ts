import { DailyHealthSnapshot } from '../health/health-dashboard.service';
import { formatNumber } from './food.messages';

const MIN_REMAINING_KCAL = 150;
const MIN_REMAINING_PROTEIN_G = 15;
const TARGET_SLEEP_MINUTES = 7 * 60;
const STEPS_GOAL = 6000;
const MAX_ACTIONS = 4;

export const COACH_NEXT_ACTIONS_INVITE = `ถามผมได้เลย เช่น
• วันนี้กินโปรตีนพอไหม
• ควรกินอะไรเพิ่ม
• ช่วงนี้ควรปรับอะไรบ้าง`;

function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

/**
 * Deterministic "what to do next today" list. Only uses values that were
 * actually recorded; missing data produces a prompt to log it, never a guess.
 * Most useful action first, at most MAX_ACTIONS.
 */
export function buildNextActions(snap: DailyHealthSnapshot): string[] {
  const actions: string[] = [];

  if (snap.nutrition) {
    const { remaining } = snap.nutrition;
    if (remaining.calories < 0) {
      actions.push(
        `🍽️ พลังงานเกินเป้าประมาณ ${formatNumber(Math.abs(remaining.calories))} kcal มื้อถัดไปเน้นเบาและโปรตีน`,
      );
    } else if (
      remaining.proteinG >= MIN_REMAINING_PROTEIN_G ||
      remaining.calories >= MIN_REMAINING_KCAL
    ) {
      const parts: string[] = [];
      if (remaining.calories >= MIN_REMAINING_KCAL) {
        parts.push(`${formatNumber(remaining.calories)} kcal`);
      }
      if (remaining.proteinG >= MIN_REMAINING_PROTEIN_G) {
        parts.push(`โปรตีน ${formatNumber(remaining.proteinG)} g`);
      }
      actions.push(`🍽️ กินให้ถึงเป้า: ยังเหลือ ${parts.join(' · ')}`);
    }
  }

  if (snap.exerciseMinutes === 0) {
    actions.push('🏋️ ยังไม่ได้ออกกำลังกายวันนี้ ลองขยับ 20–30 นาที');
  }

  if (snap.steps != null && snap.steps < STEPS_GOAL) {
    actions.push(
      `👣 ก้าววันนี้ ${formatNumber(snap.steps)} ลองเดินเพิ่มให้ถึง ${formatNumber(STEPS_GOAL)}`,
    );
  }

  if (snap.waterMl < snap.waterTargetMl * 0.75) {
    const left = Math.max(0, snap.waterTargetMl - snap.waterMl);
    actions.push(`💧 ดื่มน้ำเพิ่มอีกประมาณ ${formatNumber(left)} ml`);
  }

  if (snap.sleepMinutes == null) {
    actions.push('😴 ยังไม่มีบันทึกการนอน พิมพ์ "นอน 00:30 ตื่น 07:30"');
  } else if (snap.sleepMinutes < TARGET_SLEEP_MINUTES) {
    actions.push(
      `😴 คืนล่าสุดนอน ${formatHoursMinutes(snap.sleepMinutes)} คืนนี้ลองเข้านอนเร็วขึ้น`,
    );
  }

  return actions.slice(0, MAX_ACTIONS);
}

export function buildCoachNextActionsText(snap: DailyHealthSnapshot): string {
  const actions = buildNextActions(snap);
  const body =
    actions.length > 0
      ? actions.map((line) => `• ${line}`).join('\n')
      : '• วันนี้ทำได้ครบตามเป้าที่บันทึกไว้แล้ว เยี่ยมมากครับ 👏';
  return `🧠 สิ่งที่ควรทำต่อวันนี้\n\n${body}\n\n${COACH_NEXT_ACTIONS_INVITE}`;
}
