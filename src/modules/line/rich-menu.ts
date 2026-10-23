import { messagingApi } from '@line/bot-sdk';

/**
 * Tabbed rich menu: "โค้ช" (bot answers) ↔ "แอดมิน" (human handoff).
 * Images: public/richmenu/{coach,admin}.jpg, 2500 × 1686.
 * Tabs use `richmenuswitch`: LINE swaps the menu on the device instantly and
 * sends a postback whose `data` the bot handles (see admin-handoff.ts).
 */
export const RICH_MENU_SIZE = { width: 2500, height: 1686 };
export const RICH_MENU_NAME_PREFIX = 'kcal-tabs';
export const RICH_MENU_ALIAS = {
  coach: 'kcal-coach',
  admin: 'kcal-admin',
} as const;
export type RichMenuTab = keyof typeof RICH_MENU_ALIAS;

/** Postback data sent when a tab is tapped. */
export const RICH_MENU_POSTBACK = {
  coach: 'richmenu:coach',
  admin: 'richmenu:admin',
} as const;

const TAB_HEIGHT = 240;
const TILE_TOP = 1030;
const TILE_HEIGHT = RICH_MENU_SIZE.height - TILE_TOP;

type Area = messagingApi.RichMenuArea;

function tabAreas(): Area[] {
  return [
    {
      bounds: { x: 0, y: 0, width: 1250, height: TAB_HEIGHT },
      action: {
        type: 'richmenuswitch',
        richMenuAliasId: RICH_MENU_ALIAS.coach,
        data: RICH_MENU_POSTBACK.coach,
      },
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: TAB_HEIGHT },
      action: {
        type: 'richmenuswitch',
        richMenuAliasId: RICH_MENU_ALIAS.admin,
        data: RICH_MENU_POSTBACK.admin,
      },
    },
  ];
}

function liffUri(liffId: string, path = ''): string {
  return `https://liff.line.me/${liffId}${path}`;
}

function profileAction(liffId: string | null): messagingApi.Action {
  return liffId
    ? { type: 'uri', label: 'โปรไฟล์', uri: liffUri(liffId) }
    : { type: 'message', label: 'โปรไฟล์', text: 'โปรไฟล์' };
}

/** โค้ช tab: banner = today overview; tiles = โค้ชแนะนำ / ประวัติ / โปรไฟล์. */
function coachAreas(liffId: string | null): Area[] {
  const historyAction: messagingApi.Action = liffId
    ? { type: 'uri', label: 'ประวัติ', uri: liffUri(liffId, '/history') }
    : { type: 'message', label: 'ประวัติ', text: 'ประวัติ' };
  return [
    {
      bounds: {
        x: 0,
        y: TAB_HEIGHT,
        width: RICH_MENU_SIZE.width,
        height: TILE_TOP - TAB_HEIGHT,
      },
      action: { type: 'message', label: 'ดูภาพรวมวันนี้', text: 'วันนี้' },
    },
    {
      bounds: { x: 0, y: TILE_TOP, width: 860, height: TILE_HEIGHT },
      action: { type: 'message', label: 'โค้ชแนะนำ', text: 'โค้ชแนะนำ' },
    },
    {
      bounds: { x: 860, y: TILE_TOP, width: 790, height: TILE_HEIGHT },
      action: historyAction,
    },
    {
      bounds: { x: 1650, y: TILE_TOP, width: 850, height: TILE_HEIGHT },
      action: profileAction(liffId),
    },
  ];
}

/**
 * แอดมิน tab: no bot features — only "back to โค้ช" and the profile page.
 * The banner has no action on purpose.
 */
function adminAreas(liffId: string | null): Area[] {
  return [
    {
      bounds: { x: 0, y: TILE_TOP, width: 1293, height: TILE_HEIGHT },
      action: {
        type: 'richmenuswitch',
        richMenuAliasId: RICH_MENU_ALIAS.coach,
        data: RICH_MENU_POSTBACK.coach,
      },
    },
    {
      bounds: { x: 1293, y: TILE_TOP, width: 1207, height: TILE_HEIGHT },
      action: profileAction(liffId),
    },
  ];
}

export function buildRichMenu(
  tab: RichMenuTab,
  liffId: string | null,
): messagingApi.RichMenuRequest {
  const areas = [
    ...tabAreas(),
    ...(tab === 'coach' ? coachAreas(liffId) : adminAreas(liffId)),
  ];
  return {
    size: RICH_MENU_SIZE,
    selected: true,
    name: `${RICH_MENU_NAME_PREFIX}-${tab}`,
    chatBarText: 'เมนู',
    areas,
  };
}
