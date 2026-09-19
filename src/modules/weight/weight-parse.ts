export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 300;

export type WeightParseResult =
  | { kind: 'weight'; weightKg: number }
  | { kind: 'invalid'; reason: 'out_of_range' | 'bad_number' }
  | { kind: 'none' };

function extractCandidateKg(text: string): number | null {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)];
  const inRange = matches
    .map((m) => Number(m[1]))
    .filter(
      (n) => Number.isFinite(n) && n >= WEIGHT_MIN_KG && n <= WEIGHT_MAX_KG,
    );
  if (inRange.length === 0) {
    return null;
  }
  // Prefer the last in-range number (e.g. "วันนี้ชั่งได้ 84.2").
  return Math.round(inRange[inRange.length - 1] * 100) / 100;
}

/**
 * True when the message is about body weight — should NOT go to food analysis.
 */
export function isWeightDomainText(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  if (/น้ำหนัก/.test(t)) {
    return true;
  }
  if (/ชั่ง/.test(t)) {
    return true;
  }
  if (/^\s*หนัก\s*\d/.test(t)) {
    return true;
  }
  if (/\d+(?:\.\d+)?\s*(?:กก\.?|กิโล(?:กรัม)?|kg)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Parse natural-language weight log messages.
 * Bare numbers alone are ignored (avoid clashing with food text).
 */
export function parseWeightInput(text: string): WeightParseResult {
  const raw = text.trim();
  if (!raw) {
    return { kind: 'none' };
  }

  const normalized = raw.replace(/,/g, '');

  const patterns: RegExp[] = [
    /น้ำหนัก(?:วันนี้|ตอนนี้|ตัว|ล่าสุด)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    /(?:ชั่ง(?:น้ำหนัก)?(?:ได้)?|หนัก)\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโล(?:กรัม)?|kg)\.?/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value)) {
      return { kind: 'invalid', reason: 'bad_number' };
    }
    if (value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) {
      return { kind: 'invalid', reason: 'out_of_range' };
    }
    return { kind: 'weight', weightKg: Math.round(value * 100) / 100 };
  }

  // Fallback: weight-domain text that still has a plausible kg number.
  if (isWeightDomainText(normalized)) {
    const kg = extractCandidateKg(normalized);
    if (kg != null) {
      return { kind: 'weight', weightKg: kg };
    }
  }

  return { kind: 'none' };
}

export type WeightQuestionIntent = 'latest' | 'trend' | 'progress' | 'none';

/** Factual weight questions — DB first, never invent numbers. */
export function detectWeightQuestionIntent(text: string): WeightQuestionIntent {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) {
    return 'none';
  }

  // Exact menu command is handled separately — not a question.
  if (t === 'น้ำหนัก' || t === '⚖️น้ำหนัก') {
    return 'none';
  }

  if (
    /ลดไปเท่าไร|ลดไปเท่าไหร่|ลดมาเท่าไร|ลดมาเท่าไหร่|ลดไปแล้วเท่าไร/.test(t)
  ) {
    return 'progress';
  }

  if (
    /น้ำหนักช่วงนี้|แนวโน้มน้ำหนัก|น้ำหนัก.*เป็นยังไง|ช่วงนี้น้ำหนัก|น้ำหนัก.*แนวโน้ม/.test(
      t,
    )
  ) {
    return 'trend';
  }

  if (
    /น้ำหนักเท่าไร/.test(t) ||
    /น้ำหนักเท่าไหร่/.test(t) ||
    /น้ำหนักล่าสุด/.test(t) ||
    /น้ำหนัก.*เท่าไร/.test(t) ||
    /น้ำหนัก.*เท่าไหร่/.test(t) ||
    /ตอนนี้หนักเท่าไร/.test(t) ||
    /ตอนนี้หนักเท่าไหร่/.test(t) ||
    /หนักเท่าไรตอนนี้/.test(t) ||
    /หนักเท่าไหร่ตอนนี้/.test(t) ||
    /ชั่งได้เท่าไร/.test(t)
  ) {
    return 'latest';
  }

  return 'none';
}
