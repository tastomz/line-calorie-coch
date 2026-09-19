import { ActivityLevel, Goal, Sex } from '../nutrition/nutrition.types';

/** Reasonable V1 onboarding bounds — not medical advice. */
export const ONBOARDING_BOUNDS = {
  ageMin: 10,
  ageMax: 100,
  heightCmMin: 100,
  heightCmMax: 250,
  weightKgMin: 20,
  weightKgMax: 300,
} as const;

export function parsePositiveNumber(text: string): number | null {
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function parseAge(text: string): number | null {
  const value = parsePositiveNumber(text);
  if (value === null || !Number.isInteger(value)) {
    return null;
  }
  if (value < ONBOARDING_BOUNDS.ageMin || value > ONBOARDING_BOUNDS.ageMax) {
    return null;
  }
  return value;
}

export function parseHeightCm(text: string): number | null {
  const value = parsePositiveNumber(text);
  if (value === null) {
    return null;
  }
  if (
    value < ONBOARDING_BOUNDS.heightCmMin ||
    value > ONBOARDING_BOUNDS.heightCmMax
  ) {
    return null;
  }
  return value;
}

export function parseWeightKg(text: string): number | null {
  const value = parsePositiveNumber(text);
  if (value === null) {
    return null;
  }
  if (
    value < ONBOARDING_BOUNDS.weightKgMin ||
    value > ONBOARDING_BOUNDS.weightKgMax
  ) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function parseSex(text: string): Sex | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === 'ชาย' || normalized === 'male' || normalized === 'm') {
    return 'MALE';
  }
  if (normalized === 'หญิง' || normalized === 'female' || normalized === 'f') {
    return 'FEMALE';
  }
  return null;
}

export function parseActivityLevel(text: string): ActivityLevel | null {
  const normalized = text.trim();
  switch (normalized) {
    case 'น้อยมาก':
      return 'SEDENTARY';
    case 'เบา':
      return 'LIGHT';
    case 'ปานกลาง':
      return 'MODERATE';
    case 'มาก':
      return 'ACTIVE';
    case 'มากมาก':
      return 'VERY_ACTIVE';
    default:
      return null;
  }
}

export function parseGoal(text: string): Goal | null {
  const normalized = text.trim();
  switch (normalized) {
    case 'ลดน้ำหนัก':
      return 'LOSE_WEIGHT';
    case 'รักษาน้ำหนัก':
      return 'MAINTAIN_WEIGHT';
    case 'เพิ่มน้ำหนัก':
      return 'GAIN_WEIGHT';
    default:
      return null;
  }
}

export function goalLabel(goal: Goal): string {
  switch (goal) {
    case 'LOSE_WEIGHT':
      return 'ลดน้ำหนัก';
    case 'MAINTAIN_WEIGHT':
      return 'รักษาน้ำหนัก';
    case 'GAIN_WEIGHT':
      return 'เพิ่มน้ำหนัก';
  }
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
