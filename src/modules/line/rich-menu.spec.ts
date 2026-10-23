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

  const actionsOf = (tab: 'coach' | 'admin', liff: string | null) =>
    (buildRichMenu(tab, liff).areas ?? []).map((a) => a.action);

  it('coach tab: วันนี้ banner, โค้ชแนะนำ, ประวัติ (LIFF /history), โปรไฟล์', () => {
    expect(actionsOf('coach', 'liff-123')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'message', text: 'วันนี้' }),
        expect.objectContaining({ type: 'message', text: 'โค้ชแนะนำ' }),
        expect.objectContaining({
          type: 'uri',
          uri: 'https://liff.line.me/liff-123/history',
        }),
        expect.objectContaining({
          type: 'uri',
          uri: 'https://liff.line.me/liff-123',
        }),
      ]),
    );
  });

  it('admin tab: only tabs, back-to-โค้ช and โปรไฟล์ — no bot commands', () => {
    const actions = actionsOf('admin', 'liff-123');
    expect(actions).toHaveLength(4);
    expect(actions.some((a) => a.type === 'message')).toBe(false);
    expect(actions[2]).toMatchObject({
      type: 'richmenuswitch',
      richMenuAliasId: RICH_MENU_ALIAS.coach,
      data: RICH_MENU_POSTBACK.coach,
    });
    expect(actions[3]).toMatchObject({
      type: 'uri',
      uri: 'https://liff.line.me/liff-123',
    });
  });

  it('falls back to text commands without a LIFF id', () => {
    expect(actionsOf('coach', null)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'message', text: 'ประวัติ' }),
        expect.objectContaining({ type: 'message', text: 'โปรไฟล์' }),
      ]),
    );
  });
});
