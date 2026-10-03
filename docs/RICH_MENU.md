# LINE Rich Menu

The Rich Menu is configured in **LINE Official Account Manager** (Chat → Rich menus),
not in this repo. Set every tile to a **Text** action; the bot recognises these
exact messages (`FOOD_COMMANDS` in `src/modules/food/food-logging.service.ts`).

| Tile | Message to send | Bot reply (no AI call) |
| --- | --- | --- |
| ดูภาพรวมวันนี้ | `วันนี้` (also `ดูภาพรวมวันนี้`, `ภาพรวม`) | Today's overview card: calories, macros, weight, sleep, exercise, steps, water |
| อาหาร | `อาหาร` | Today's logged foods with ✏️ edit / delete buttons; if nothing is logged yet, how to log a meal |
| โค้ช | `โค้ช` | "สิ่งที่ควรทำต่อวันนี้": up to 4 next actions from recorded data (food left to reach targets, exercise, steps, water, sleep), then example questions to ask |
| โปรไฟล์ | `โปรไฟล์` (targets in chat) or a URI action to the membership page `/profile` | Targets text, or the LIFF membership page |

The next-actions list is deterministic (`src/modules/food/coach-next-actions.ts`):
it only uses values that were actually recorded and asks the user to log missing
data (e.g. sleep) instead of guessing.

## `/profile` returns `400 Bad Request`

"This channel is now developing status. User need to have developer role." means the
**LINE Login channel** is still in *Developing*. Only people with a role on the channel
can log in. In LINE Developers Console, either switch the channel to **Published**, or
add the person under the channel's **Roles**.
