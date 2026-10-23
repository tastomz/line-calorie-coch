# LINE Rich Menu

The rich menu is a **tabbed menu created through the Messaging API** (it
overrides any menu set in LINE OA Manager). Images live in
`public/richmenu/coach.jpg` and `admin.jpg` (2500 × 1686, < 1 MB); areas are in
`src/modules/line/rich-menu.ts`. Install or re-install from **/admin →
"ติดตั้ง Rich menu"** (`POST /admin/api/rich-menu/setup`).

- Tab **โค้ช** / **แอดมิน** (top 240 px) use `richmenuswitch` with aliases
  `kcal-coach` / `kcal-admin`; the postback data (`richmenu:coach` /
  `richmenu:admin`) turns the human handoff off/on.
- **โค้ช tab:** banner → `วันนี้`; tiles → `โค้ชแนะนำ` (next-meal advice),
  ประวัติ (`https://liff.line.me/$LIFF_ID/history`), โปรไฟล์ (LIFF).
- **แอดมิน tab:** no bot commands at all — only "กลับไปคุยกับโค้ช"
  (`richmenuswitch` → `richmenu:coach`) and โปรไฟล์ (LIFF).

Tiles send these exact texts (`FOOD_COMMANDS` in
`src/modules/food/food-logging.service.ts`):

| Tile | Message to send | Bot reply |
| --- | --- | --- |
| ดูภาพรวมวันนี้ | `วันนี้` (also `ดูภาพรวมวันนี้`, `ภาพรวม`) | Today's overview card: calories, macros, weight, sleep, exercise, steps, water |
| อาหาร | `อาหาร` | Today's logged foods with ✏️ edit / delete buttons; if nothing is logged yet, how to log a meal |
| โค้ช | `โค้ช` | AI analysis of today's data (foods eaten, calories vs target, exercise, water, sleep) with 3 concrete next steps; uses the COACH daily quota. Falls back to the rule-based "สิ่งที่ควรทำต่อวันนี้" list (no AI) when there is no OpenAI key, the quota is used up, or the call fails |
| โปรไฟล์ | `โปรไฟล์` (targets in chat) or a URI action to the membership page `/profile` | Targets text, or the LIFF membership page |

The fallback list is deterministic (`src/modules/food/coach-next-actions.ts`):
it only uses values that were actually recorded and asks the user to log missing
data (e.g. sleep) instead of guessing.

## `/profile` returns `400 Bad Request`

"This channel is now developing status. User need to have developer role." means the
**LINE Login channel** is still in *Developing*. Only people with a role on the channel
can log in. In LINE Developers Console, either switch the channel to **Published**, or
add the person under the channel's **Roles**.

## Talk to an admin (human handoff)

- User types **คุยกับแอดมิน** (also: ติดต่อแอดมิน, แอดมิน, คุยกับคน, admin) →
  `User.adminChatSince` is set and the bot stops answering that user's free
  text and photos (no typing indicator either). Rich-menu command texts
  (e.g. วันนี้, สมาชิก) are still answered by the bot.
- Admin replies in **LINE Official Account Manager → Chat**. Requires
  Response settings: **Chat ON** and **Webhook ON**.
- User types **คุยกับบอท** (quick-reply button provided) → bot resumes.
