import { MEAL_ALLOCATION } from './meal-plan.service';

type Slot = keyof typeof MEAL_ALLOCATION;

export type NextMealBudget = {
  slot: Slot | 'LATE';
  labelTh: string;
  eatenKcal: number;
  eatenProteinG: number;
  remainingKcal: number;
  remainingProteinG: number;
  /** Calories to aim for in this meal (0 = day budget already used). */
  budgetKcal: number;
  budgetProteinG: number;
};

const LABEL: Record<Slot | 'LATE', string> = {
  BREAKFAST: 'มื้อเช้า',
  LUNCH: 'มื้อกลางวัน',
  SNACK: 'มื้อว่างบ่าย',
  DINNER: 'มื้อเย็น',
  LATE: 'ของว่างก่อนนอน',
};

/** Meals still ahead (this one first), by Bangkok hour. */
function mealsAhead(hour: number): (Slot | 'LATE')[] {
  if (hour < 10) return ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];
  if (hour < 14) return ['LUNCH', 'SNACK', 'DINNER'];
  if (hour < 17) return ['SNACK', 'DINNER'];
  if (hour < 21) return ['DINNER'];
  return ['LATE'];
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Split what is left of today's calories/protein across the meals still
 * ahead (same weights as the daily meal plan) and return this meal's share.
 * After 21:00 only a small snack (≤ 200 kcal) is suggested.
 */
export function nextMealBudget(params: {
  hour: number;
  eatenKcal: number;
  eatenProteinG: number;
  dailyCalories: number;
  dailyProteinG: number;
}): NextMealBudget {
  const ahead = mealsAhead(params.hour);
  const slot = ahead[0];
  const remainingKcal = Math.max(0, params.dailyCalories - params.eatenKcal);
  const remainingProteinG = Math.max(
    0,
    params.dailyProteinG - params.eatenProteinG,
  );
  let share = 1;
  if (slot !== 'LATE') {
    const weights = ahead.map((s) => MEAL_ALLOCATION[s as Slot]);
    share = MEAL_ALLOCATION[slot] / weights.reduce((a, b) => a + b, 0);
  }
  let budgetKcal = remainingKcal * share;
  let budgetProteinG = remainingProteinG * share;
  if (slot === 'LATE') {
    budgetKcal = Math.min(budgetKcal, 200);
    budgetProteinG = Math.min(budgetProteinG, 20);
  }
  if (remainingKcal < 100) {
    budgetKcal = 0;
  }
  return {
    slot,
    labelTh: LABEL[slot],
    eatenKcal: Math.round(params.eatenKcal),
    eatenProteinG: Math.round(params.eatenProteinG),
    remainingKcal: Math.round(remainingKcal),
    remainingProteinG: Math.round(remainingProteinG),
    budgetKcal: round10(budgetKcal),
    budgetProteinG: Math.round(budgetProteinG),
  };
}

export function buildNextMealHeader(b: NextMealBudget, target: number): string {
  const n = (x: number) => x.toLocaleString('en-US');
  const head = `🍽️ แนะนำ${b.labelTh}\nกินไปแล้ว ${n(b.eatenKcal)} / ${n(target)} kcal · เหลือ ${n(b.remainingKcal)} kcal`;
  return b.budgetKcal > 0
    ? `${head}\nงบมื้อนี้ ~${n(b.budgetKcal)} kcal · โปรตีน ~${b.budgetProteinG} g`
    : `${head}\nวันนี้ใช้งบแคลอรี่ครบแล้ว — แนะนำเครื่องดื่ม 0 kcal หรือผักลวกเบาๆ`;
}
