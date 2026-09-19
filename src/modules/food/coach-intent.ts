export type CoachIntent =
  | 'today_summary'
  | 'history'
  | 'calories_consumed'
  | 'calories_remaining'
  | 'protein_consumed'
  | 'protein_remaining'
  | 'meal_recommendation'
  | 'medical'
  | 'none';

/**
 * Cheap deterministic intent detection for completed-user questions.
 * Unknown / food-log text returns 'none' so the existing food analyzer runs.
 */
export function detectCoachIntent(text: string): CoachIntent {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');

  if (!t) {
    return 'none';
  }

  if (
    /โรค|ยา|แพทย์|หมอ|diagnose|medication|prescription|diabetes|เบาหวาน|ความดัน/.test(
      t,
    )
  ) {
    return 'medical';
  }

  if (
    /เย็นนี้กินอะไรดี/.test(t) ||
    /มื้อเย็นกินอะไรดี/.test(t) ||
    /เหลือกินอะไรได้บ้าง/.test(t) ||
    /มื้อเย็น/.test(t) ||
    /ควรกินอะไร/.test(t) ||
    /กินอะไรดี/.test(t) ||
    /แนะนำมื้อ/.test(t) ||
    /แนะนำอาหาร/.test(t) ||
    /ตอนนี้ควรกิน/.test(t)
  ) {
    return 'meal_recommendation';
  }

  if (
    /เมื่อกี้กินอะไร/.test(t) ||
    /กินอะไรไปบ้าง/.test(t) ||
    /วันนี้กินอะไรไปแล้ว/.test(t) ||
    /วันนี้กินอะไร/.test(t) ||
    /รายการอาหาร/.test(t)
  ) {
    return 'history';
  }

  if (
    /โปรตีน.*เหลือ/.test(t) ||
    /เหลือ.*โปรตีน/.test(t) ||
    /protein.*เหลือ/.test(t) ||
    /โปรตีนเหลือเท่าไร/.test(t) ||
    /โปรตีนเหลือเท่าไหร่/.test(t)
  ) {
    return 'protein_remaining';
  }

  if (/โปรตีน.*(กี่|เท่าไร|เท่าไหร่)/.test(t)) {
    return 'protein_consumed';
  }

  if (
    /เหลือ.*(กี่|เท่าไร|เท่าไหร่).*(แคล|kcal|cal)/.test(t) ||
    /(แคล|kcal|cal).*เหลือ/.test(t) ||
    /เหลือกี่แคล/.test(t) ||
    /วันนี้เหลือ.*(แคล|kcal|cal|กี่|เท่า)/.test(t)
  ) {
    return 'calories_remaining';
  }

  if (
    /กินไป.*(กี่|เท่าไร|เท่าไหร่).*(แคล|kcal|cal)/.test(t) ||
    /วันนี้กินไปกี่แคล/.test(t) ||
    /วันนี้.*(กี่|เท่าไร|เท่าไหร่).*(แคล|kcal|cal)/.test(t) ||
    /(แคล|kcal|cal).*(กี่|เท่าไร|เท่าไหร่)/.test(t) ||
    /กินไปกี่แคล/.test(t)
  ) {
    return 'calories_consumed';
  }

  if (
    /วันนี้โอเคไหม/.test(t) ||
    /วันนี้เป็นไง/.test(t) ||
    /วันนี้สรุป/.test(t) ||
    /^วันนี้$/.test(t)
  ) {
    return 'today_summary';
  }

  return 'none';
}
