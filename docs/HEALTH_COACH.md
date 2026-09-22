# Tastom — Personal Health Coach

Local expansion of the LINE nutrition coach into a multi-dimension health coach.

## Product loop

COLLECT → STRUCTURE → ANALYZE → TRACK → COACH → ADJUST

Tastom is **not** a medical diagnostic system. It tracks lifestyle metrics and coaches from structured data.

## Modules

| Area | Storage | AI? |
| --- | --- | --- |
| Body / BodyScan | `BodyScan` + `PendingBodyScan` | Vision extract (confirm before save) |
| Weight | existing `WeightLog` (+ source / bodyScanId) | No |
| Food | existing food module | Text / vision (existing) |
| Meal plan | `MealPlan` / `MealPlanSlot` | Allocation = 0 AI; suggestions on request |
| Sleep | `SleepLog` | No |
| Exercise | `ExerciseLog` | No (does **not** alter food budget) |
| Activity / steps | `ActivityDailyLog` | No |
| Hydration | `HydrationLog` | No |
| Recovery | `RecoveryLog` | No |
| Daily dashboard | derived | Deterministic (0 AI) |
| Weekly review | `WeeklyHealthReview` | AI once per week; reuse saved |
| Cross-data coach | `HealthInsightService` + optional COACH | Insights first; AI on demand |

## Source of truth

- **Database** = operational SoT
- **AI** = extraction / estimation / wording only
- **Google Sheets** = export only

Body-scan and food AI outputs require **user confirmation** before durable writes.

Reported macros on a body scan (`reportedCalories*`, etc.) are stored but **do not** overwrite Tastom nutrition targets unless the user explicitly recalculates.

## AI / quota

All OpenAI calls go through `AiGatewayService`.

New operations: `BODY_SCAN`, `MEAL_PLAN`, `WEEKLY_REVIEW` (plus existing food/coach/classify).

0 AI: weight, sleep, exercise, steps, water, recovery, totals, trends, meal allocation, dashboard, deterministic insights, membership checks.

## LINE commands (additive)

Preserve existing: `เริ่ม` `โปรไฟล์` `วันนี้` `น้ำหนัก` `ประวัติ` `เป้าหมาย` `สมาชิก` `ใช้โค้ด` …

Health:

- `ร่างกาย` / `body scan` / `ผลตรวจ` → arm image expect → confirm `บันทึกผลตรวจ`
- `เปรียบเทียบร่างกาย`
- `นอน 00:30 ตื่น 07:30`
- `ออกกำลังกาย strength 45`
- `ก้าว 8420`
- `น้ำ` / `+250 ml` / `ดื่มน้ำ 500`
- `ฟื้นตัว 4 2 4 2`
- `แผนอาหาร` (deterministic budgets)
- meal suggestion phrases → `MEAL_PLAN` AI
- `สรุปสัปดาห์` / `weekly review`
- cross questions e.g. `ทำไมน้ำหนักช่วงนี้ไม่ลง` → structured facts + `COACH`

`วันนี้` = health dashboard (nutrition + weight + sleep + exercise + steps + water + recovery + tip). **No AI** on render.

## Privacy / isolation

Every health row is `userId`-scoped. Never trust client-supplied userId. Do not log raw health payloads.

## Migrations

- SQLite: `prisma/migrations/20260922160000_health_coach_expansion`
- Postgres artifacts: `prisma/postgres/migrations/20260922160000_health_coach_expansion`

**Do not** apply Postgres migrations to production from this local task.

## Safety

No disease diagnosis, no body-fat-from-personal-photos, no Rx advice, no automatic exercise calories into food budget.
