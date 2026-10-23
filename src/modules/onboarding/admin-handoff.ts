/**
 * Human handoff: a user types "คุยกับแอดมิน" → the bot stops answering their
 * free text and photos so an admin can reply in LINE Official Account Manager
 * (Chat must be ON alongside Webhook). "คุยกับบอท" hands back to the bot.
 * While handoff is on, nothing automated replies (no AI, no menu commands);
 * the แอดมิน rich menu only offers "back to โค้ช" and the profile page.
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

/** Postback data from the rich-menu tabs (see line/rich-menu.ts). */
export const TAB_POSTBACK_ADMIN = 'richmenu:admin';
export const TAB_POSTBACK_COACH = 'richmenu:coach';

export function isAdminChatEnter(text: string): boolean {
  return ENTER.includes(normalize(text));
}

export function isAdminChatExit(text: string): boolean {
  return EXIT.includes(normalize(text));
}

export const ADMIN_CHAT_STARTED_TEXT = `👩‍💼 ส่งเรื่องถึงแอดมินแล้วครับ
พิมพ์ข้อความหรือส่งรูปได้เลย แอดมินจะตอบกลับในแชทนี้

ระหว่างนี้บอทจะหยุดตอบข้อความ (กดเมนูด้านล่างได้ตามปกติ)
แตะแท็บ "โค้ช" หรือพิมพ์ "${ADMIN_CHAT_EXIT_TEXT}" เมื่อต้องการกลับมาใช้บอท`;

export const ADMIN_CHAT_ENDED_TEXT = `🤖 กลับมาคุยกับบอทแล้วครับ
ส่งเมนูอาหาร รูปอาหาร หรือคำถามได้เลย`;

export const ADMIN_CHAT_NOT_ACTIVE_TEXT = `🤖 ตอนนี้คุยกับบอทอยู่แล้วครับ
ถ้าต้องการคุยกับแอดมิน พิมพ์ "คุยกับแอดมิน"`;
