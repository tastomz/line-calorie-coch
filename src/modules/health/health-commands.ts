import { ExerciseType } from '@prisma/client';

export const HEALTH_COMMANDS = {
  BODY: ['ร่างกาย', 'body scan', 'bodyscan', 'ผลตรวจ', 'body'],
  BODY_PROGRESS: ['เปรียบเทียบร่างกาย', 'body progress', 'ความคืบหน้า body'],
  BODY_CONFIRM: 'บันทึกผลตรวจ',
  BODY_CANCEL: 'ยกเลิกผลตรวจ',
  SLEEP: ['การนอน', 'นอน', 'sleep'],
  EXERCISE: ['ออกกำลังกาย', 'ออกกำลัง', 'exercise', 'workout'],
  STEPS: ['ก้าว', 'steps', 'activity'],
  WATER: ['น้ำ', 'ดื่มน้ำ', 'hydration', 'water'],
  RECOVERY: ['recovery', 'ฟื้นตัว', 'เช็คอิน'],
  MEAL_PLAN: ['แผนอาหาร', 'meal plan', 'mealplan'],
  WEEKLY: ['สรุปสัปดาห์', 'weekly review', 'weekly'],
} as const;

export function isExactHealthCommand(
  text: string,
  list: readonly string[],
): boolean {
  const t = text.trim().toLowerCase();
  return list.some((c) => c.toLowerCase() === t);
}

/** นอน 00:30 ตื่น 07:30 | นอน 00:30-07:30 | นอน 0:30 7:30 */
export function parseSleepCommand(text: string): {
  bedtimeHour: number;
  bedtimeMinute: number;
  wakeHour: number;
  wakeMinute: number;
} | null {
  const t = text.trim();
  const m1 = t.match(
    /^นอน\s+(\d{1,2}):(\d{2})\s*(?:ตื่น|-|–|ถึง)\s*(\d{1,2}):(\d{2})$/i,
  );
  if (m1) {
    return {
      bedtimeHour: Number(m1[1]),
      bedtimeMinute: Number(m1[2]),
      wakeHour: Number(m1[3]),
      wakeMinute: Number(m1[4]),
    };
  }
  return null;
}

const EXERCISE_TYPE_MAP: Record<string, ExerciseType> = {
  strength: ExerciseType.STRENGTH,
  แรง: ExerciseType.STRENGTH,
  เวท: ExerciseType.STRENGTH,
  running: ExerciseType.RUNNING,
  วิ่ง: ExerciseType.RUNNING,
  walking: ExerciseType.WALKING,
  เดิน: ExerciseType.WALKING,
  cycling: ExerciseType.CYCLING,
  จักรยาน: ExerciseType.CYCLING,
  swimming: ExerciseType.SWIMMING,
  ว่ายน้ำ: ExerciseType.SWIMMING,
  sports: ExerciseType.SPORTS,
  กีฬา: ExerciseType.SPORTS,
  mobility: ExerciseType.MOBILITY,
  โยคะ: ExerciseType.MOBILITY,
  other: ExerciseType.OTHER,
};

/** ออกกำลังกาย strength 45 | ออกกำลัง 45 | workout running 30 */
export function parseExerciseCommand(text: string): {
  type: ExerciseType;
  durationMinutes: number;
  name: string;
} | null {
  const t = text.trim();
  const m = t.match(
    /^(?:ออกกำลังกาย|ออกกำลัง|exercise|workout)\s+(?:([a-zA-Zก-๙]+)\s+)?(\d{1,3})\s*(?:นาที|min|mins)?$/i,
  );
  if (!m) return null;
  const typeKey = (m[1] ?? 'other').toLowerCase();
  const type = EXERCISE_TYPE_MAP[typeKey] ?? ExerciseType.OTHER;
  const durationMinutes = Number(m[2]);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  const name =
    type === ExerciseType.STRENGTH
      ? 'Strength Training'
      : type.charAt(0) + type.slice(1).toLowerCase();
  return { type, durationMinutes, name };
}

/** ก้าว 8420 | steps 8420 */
export function parseStepsCommand(text: string): number | null {
  const m = text.trim().match(/^(?:ก้าว|steps|activity)\s+(\d{1,6})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

/** น้ำ 250 | ดื่มน้ำ 500 | +250 ml | +500 */
export function parseHydrationCommand(text: string): number | null {
  const t = text.trim();
  if (t === '+250' || t === '+250 ml') return 250;
  if (t === '+500' || t === '+500 ml') return 500;
  const m = t.match(/^(?:น้ำ|ดื่มน้ำ|hydration|water)\s+(\d{2,4})\s*(?:ml)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

/** recovery 4 2 4 2 | ฟื้นตัว 4 2 4 2 */
export function parseRecoveryCommand(text: string): {
  energyScore: number;
  stressScore: number;
  recoveryScore: number;
  sorenessScore: number;
} | null {
  const m = text
    .trim()
    .match(
      /^(?:recovery|ฟื้นตัว|เช็คอิน)\s+([1-5])\s+([1-5])\s+([1-5])\s+([1-5])$/i,
    );
  if (!m) return null;
  return {
    energyScore: Number(m[1]),
    stressScore: Number(m[2]),
    recoveryScore: Number(m[3]),
    sorenessScore: Number(m[4]),
  };
}

/** Meal suggestion request (AI) — not the deterministic plan view. */
export function isMealSuggestionRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /กินอะไรดี|จัดมื้อ|แนะนำมื้อ|meal suggest|อยากกิน/.test(t) ||
    /ไม่เกิน\s*\d+\s*kcal/.test(t)
  );
}

export function isHealthCoachQuestion(text: string): boolean {
  const t = text.trim();
  return /ทำไม.?น้ำหนัก|กินโอเคไหม|ฟื้นตัวช้า|สุขภาพ.?เป็นยังไง|how am i|what should i focus/i.test(
    t,
  );
}
