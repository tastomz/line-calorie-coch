export type LineQuickReplyItem = {
  label: string;
  text: string;
};

export type LineButtonItem = {
  label: string;
  text: string;
};

export type LineWebhookBody = {
  destination?: string;
  events: LineWebhookEvent[];
};

export type LineWebhookEvent = {
  type: string;
  timestamp?: number;
  replyToken?: string;
  webhookEventId?: string;
  source?: {
    type?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    id?: string;
    text?: string;
  };
  postback?: {
    data?: string;
  };
};

export const MAIN_MENU_ACTIONS = [
  '🍽️ วันนี้',
  '📋 ประวัติ',
  '⚖️ น้ำหนัก',
  '👤 โปรไฟล์',
] as const;

export type MainMenuAction = (typeof MAIN_MENU_ACTIONS)[number];
