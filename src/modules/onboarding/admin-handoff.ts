import { FOOD_COMMANDS } from '../food/food-logging.service';
import { MEMBERSHIP_COMMANDS } from '../membership/membership.messages';

/**
 * Human handoff: a user types "คุยกับแอดมิน" → the bot stops answering their
 * free text and photos so an admin can reply in LINE Official Account Manager
 * (Chat must be ON alongside Webhook). "คุยกับบอท" hands back to the bot.
 * Rich-menu commands still work during handoff — tapping a menu is a request
 * for the bot, and the reply is instant.
 */
const normalize = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, '');

const ENTER = [
  'คุยกับแอดมิน',
  'ติดต่อแอดมิน',
  'แอดมิน',
  'คุยกับคน',
  'ติดต่อเจ้าหน้าที่',
  'คุยกับเจ้าหน้าที่',
  'admin',
].map(normalize);

const EXIT = ['คุยกับบอท', 'กลับไปคุยกับบอท', 'คุยกับbot', 'bot', 'บอท'].map(
  normalize,
);

export const ADMIN_CHAT_EXIT_TEXT = 'คุยกับบอท';

export function isAdminChatEnter(text: string): boolean {
  return ENTER.includes(normalize(text));
}

export function isAdminChatExit(text: string): boolean {
  return EXIT.includes(normalize(text));
}

const foodCommands: string[] = Object.values(FOOD_COMMANDS).flatMap(
  (v: string | readonly string[]) => (typeof v === 'string' ? [v] : [...v]),
);
const membershipCommands: string[] = [...MEMBERSHIP_COMMANDS];
const MENU_COMMANDS = new Set(
  [...foodCommands, ...membershipCommands].map(normalize),
);

/** Exact rich-menu / command texts the bot keeps answering during handoff. */
export function isMenuCommand(text: string): boolean {
  return MENU_COMMANDS.has(normalize(text));
}

export const ADMIN_CHAT_STARTED_TEXT = `👩‍💼 ส่งเรื่องถึงแอดมินแล้วครับ
พิมพ์ข้อความหรือส่งรูปได้เลย แอดมินจะตอบกลับในแชทนี้

ระหว่างนี้บอทจะหยุดตอบข้อความ (กดเมนูด้านล่างได้ตามปกติ)
พิมพ์ "${ADMIN_CHAT_EXIT_TEXT}" เมื่อต้องการกลับมาใช้บอท`;

export const ADMIN_CHAT_ENDED_TEXT = `🤖 กลับมาคุยกับบอทแล้วครับ
ส่งเมนูอาหาร รูปอาหาร หรือคำถามได้เลย`;

export const ADMIN_CHAT_NOT_ACTIVE_TEXT = `🤖 ตอนนี้คุยกับบอทอยู่แล้วครับ
ถ้าต้องการคุยกับแอดมิน พิมพ์ "คุยกับแอดมิน"`;
