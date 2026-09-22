# Membership platform (FREE / PRO / promo / Stripe TEST / admin / local QA)

**PAYMENT LIVE = NOT ACTIVE YET.**  
Default local payment: **`PAYMENT_MODE=MOCK`**. Stripe TEST when `PAYMENT_MODE=STRIPE` + `sk_test_…` keys.

Database is the source of truth. Success pages never grant PRO — only verified payment events do.

## Architecture

```text
LINE ──► NestJS
           ▲
/membership web + /api/membership/*
           ▲
PAYMENT_MODE=MOCK → MockPaymentProvider → same billing webhook handler
PAYMENT_MODE=STRIPE → StripePaymentProvider → /webhooks/stripe
           ▼
Prisma (User.role, Subscription, Promo*, AIUsage, PaymentEvent, …)
```

## Web routes & auth

| Route | Access |
| --- | --- |
| `GET /login` | Public |
| `GET /membership` (marketing) | Public |
| `GET /profile` · `/account` · `/upgrade` | Authenticated (API 401 → client → `/login`) |
| `GET /admin` · `/admin/*` | ADMIN only (API 401/403; HTML UX redirect) |
| `GET/POST /api/membership/*` (except `config`, `auth/*`, `logout`) | Session cookie → userId from backend |
| `POST /api/membership/promo/redeem` | Authenticated |
| `/admin/*` APIs | `User.role=ADMIN` or env admin session |

Identity never comes from `?userId=` / body — only `membership_session` / LINE link token.

**Checkout off by default:** `ENABLE_MEMBERSHIP_CHECKOUT=false` hides upgrade CTAs and returns 403 on `POST /api/membership/checkout`. Stripe/Mock code remains; do not enable for production users until ready.

## Roles

| Role | Access |
| --- | --- |
| `USER` (default) | Membership APIs; **not** admin |
| `ADMIN` | Admin APIs + dashboard |

PRO plan ≠ ADMIN. Backend enforces (401 unauthenticated / 403 not ADMIN).

Bootstrap ADMIN (no public promote API):

```bash
ADMIN_BOOTSTRAP_LINE_USER_IDS=local-admin-user,Uxxxxxxxx
```

Plus optional env operator login: `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`.

## Plans & quotas

FREE ฿0 · PRO **฿50/mo** · limits in `plan.config.ts`  
Promo Free PRO codes: **10 / 15 / 30 days only** (`TASTOM-XXXXXX`).

## Local QA tools (`/dev/*`)

Require:

```bash
NODE_ENV=development
ENABLE_DEV_MEMBERSHIP_TOOLS=true
```

| Route | Purpose |
| --- | --- |
| `/dev/membership` | identity switch + status |
| `/dev/admin` | dashboard |
| `/dev/admin/promos` | generate 10/15/30 codes |
| `/dev/test-scenarios` | consume AI via AiGateway |
| `/dev/checkout` | mock/stripe checkout |

Test identities: `USER_A` / `USER_B` / `ADMIN` (`local-test-user-*`).

Production rejects these routes at the guard + env validation.

## Mock payment

1. `/membership/upgrade` → checkout  
2. `/membership/mock-checkout` → choose success/fail/past_due/cancel  
3. `POST /api/membership/mock/complete` → `PaymentEvent` + Subscription via billing service  

## Stripe TEST (optional)

```bash
PAYMENT_MODE=STRIPE
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_ID=price_…
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Live keys (`sk_live_`) remain blocked.

## Admin Free PRO codes

`POST /admin/promos/generate` `{ "trialDays": 10|15|30, "maxRedemptions": 1 }`  
→ `TASTOM-XXXXXX`, provider NONE + TRIALING on redeem.

## AI gateway audit

OpenAI clients live in food-analysis / classify / daily-coach. Callers on the LINE hot path go through `AiGatewayService` (FOOD_TEXT / VISION / COMPOSITION / CLASSIFY / COACH). Deterministic paths call zero OpenAI.

## Rate limits

In-memory: promo redeem, login/link, checkout, admin login, dev tools. Webhooks are not rate-limited.

## Local start

```bash
cp .env.example .env
# set ENABLE_DEV_MEMBERSHIP_TOOLS=true, PAYMENT_MODE=MOCK, MEMBERSHIP_WEB_URL
npx prisma migrate dev
npm run start:dev
# open http://localhost:3000/dev/membership
```
