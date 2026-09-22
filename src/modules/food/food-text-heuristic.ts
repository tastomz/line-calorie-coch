import { detectCoachIntent } from './coach-intent';
import { isWeightDomainText } from '../weight/weight-parse';

/**
 * High-confidence food-text heuristic.
 * When true, skip MessageClassifyService and go straight to food analysis.
 * Keep this conservative — ambiguous text must still use classify.
 */
const FOOD_SIGNAL =
  /ข้าว|กะเพรา|ผัด|ต้มยำ|ต้มข่า|แกง|ก๋วยเตี๋ยว|บะหมี่|เส้น|สลัด|ไก่|หมู|เนื้อ|ปลา|กุ้ง|ไข่|ซูชิ|พิซซ่า|เบอร์เกอร์|แซนด์วิช|ขนม|ผลไม้|โยเกิร์ต|นม|กาแฟ|ชา|น้ำผลไม้|ส้มตำ|ลาบ|ยำ|จาน|ชิ้น|ชาม|ถ้วย|bowl|rice|chicken|pork|beef|fish|salad|noodle|soup|curry|sushi|pizza|burger/i;

const NON_FOOD =
  /สวัสดี|ขอบคุณ|ช่วยด้วย|ตั้งค่า|โปรไฟล์|เมนู|help|hello|thanks|^อาหาร$|^โค้ช$/i;

export function isLikelyFoodText(text: string): boolean {
  const raw = text.trim();
  if (!raw || raw.length > 160) {
    return false;
  }
  // Exact Rich Menu entry commands are never food logs.
  if (
    raw === 'อาหาร' ||
    raw === '🍽️ อาหาร' ||
    raw === 'โค้ช' ||
    raw === '🧠 โค้ช'
  ) {
    return false;
  }
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return false;
  }
  if (NON_FOOD.test(raw)) {
    return false;
  }
  if (isWeightDomainText(raw)) {
    return false;
  }
  if (detectCoachIntent(raw) !== 'none') {
    return false;
  }
  // Questions about "what to eat" are coach, not food logging.
  if (/กินอะไร|แนะนำ|เหลือกิน/.test(raw)) {
    return false;
  }
  return FOOD_SIGNAL.test(raw);
}
