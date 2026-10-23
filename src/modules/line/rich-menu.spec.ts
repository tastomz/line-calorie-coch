import {
  buildRichMenu,
  RICH_MENU_ALIAS,
  RICH_MENU_POSTBACK,
  RICH_MENU_SIZE,
} from './rich-menu';

describe('tabbed rich menu', () => {
  const inside = (b: { x: number; y: number; width: number; height: number }) =>
    b.x >= 0 &&
    b.y >= 0 &&
    b.x + b.width <= RICH_MENU_SIZE.width &&
    b.y + b.height <= RICH_MENU_SIZE.height;

  it.each(['coach', 'admin'] as const)(
    '%s menu: tabs switch aliases and send handoff postbacks',
    (tab) => {
      const menu = buildRichMenu(tab, 'liff-123');
      expect(menu.size).toEqual(RICH_MENU_SIZE);
      expect(menu.areas.every((a) => inside(a.bounds))).toBe(true);
      const areas = menu.areas ?? [];
      expect(areas[0]?.action).toMatchObject({
        type: 'richmenuswitch',
        richMenuAliasId: RICH_MENU_ALIAS.coach,
        data: RICH_MENU_POSTBACK.coach,
      });
      expect(areas[1]?.action).toMatchObject({
        type: 'richmenuswitch',
        richMenuAliasId: RICH_MENU_ALIAS.admin,
        data: RICH_MENU_POSTBACK.admin,
      });
    },
  );

  it('both tabs keep the อาหาร / โค้ช / โปรไฟล์ tiles; profile opens LIFF', () => {
    for (const tab of ['coach', 'admin'] as const) {
      const actions = buildRichMenu(tab, 'liff-123').areas.map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'message', text: 'อาหาร' }),
          expect.objectContaining({ type: 'message', text: 'โค้ช' }),
          expect.objectContaining({
            type: 'uri',
            uri: 'https://liff.line.me/liff-123',
          }),
        ]),
      );
    }
  });

  it('only the coach tab has the "ดูภาพรวมวันนี้" banner', () => {
    const today = (tab: 'coach' | 'admin') =>
      buildRichMenu(tab, null).areas.some(
        (a) => a.action.type === 'message' && a.action.text === 'วันนี้',
      );
    expect(today('coach')).toBe(true);
    expect(today('admin')).toBe(false);
  });

  it('falls back to the โปรไฟล์ text command without a LIFF id', () => {
    const actions = buildRichMenu('coach', null).areas.map((a) => a.action);
    expect(actions).toContainEqual(
      expect.objectContaining({ type: 'message', text: 'โปรไฟล์' }),
    );
  });
});
