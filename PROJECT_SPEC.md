# LINE AI Nutrition Coach — Product Spec

Source of truth for product behavior. Details: `docs/`.

## Core product

**Tastom — Personal Health Coach** (LINE): nutrition + body composition + weight + sleep + exercise + activity + hydration + recovery, with deterministic analysis first and AI only when it adds value.

Onboarding, food logging (text/image + confirm), quantity edits, daily health dashboard, weight, soft coaching, Sheets export (optional, never SoT).

Database is source of truth. OpenAI is estimation/wording/extraction only.

Health expansion: [docs/HEALTH_COACH.md](docs/HEALTH_COACH.md).

## Membership platform

See [docs/MEMBERSHIP.md](docs/MEMBERSHIP.md).

Roles: `USER` | `ADMIN` (PRO ≠ admin). Promo Free PRO: 10/15/30 days (`TASTOM-XXXXXX`).  
Local QA: `/dev/*` when `ENABLE_DEV_MEMBERSHIP_TOOLS=true`. Payment default `MOCK`; Stripe TEST optional.  
**PAYMENT LIVE = NOT ACTIVE.**

| Plan | Price | Positioning |
| --- | --- | --- |
| FREE | 0 | Core tracking free |
| PRO | **50 THB/month** | ใช้งาน AI ได้มากขึ้น (not unlimited) |

FREE quotas/day: text 5 · vision 2 · composition 3 · coach 3 · classify 5 · body scan 1 · meal ideas 2 · weekly 1  
PRO quotas/day: text 30 · vision 15 · composition 20 · coach 30 · classify 30 · body scan 5 · meal ideas 15 · weekly 4  

Trial default: **7 days**. Promo codes grant temporary PRO.

External membership web (`/membership/*`) + Stripe **TEST** checkout.  
Webhooks update DB. Success page does **not** grant PRO.  
**PAYMENT LIVE = NOT ACTIVE YET.**

LINE: `สมาชิก` / `แพ็กเกจ` / `สิทธิ์` / `ใช้โค้ด <CODE>`  
Upgrade opens signed `MEMBERSHIP_WEB_URL` link (no raw userId).

Admin: `/admin` (env credentials + audit log).

## AI routing (preserve)

Obvious food → Food AI; ambiguous → classify; วันนี้/meal tips deterministic; quantity local; image → vision (or body scan when armed); composition AI when needed; weekly review AI once then reuse. All OpenAI via `AiGatewayService`.

## DB

Dev SQLite `prisma/` · Prod Postgres `prisma/postgres/` (do not apply prod migrations from feature work without review).
