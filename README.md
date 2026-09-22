# line-calorie-coch

NestJS + TypeScript + Prisma backend for **Tastom — Personal Health Coach** (LINE).

Nutrition, body composition, weight, sleep, exercise, activity, hydration, recovery — with AI only where it adds value. Spec: [PROJECT_SPEC.md](PROJECT_SPEC.md) · Health: [docs/HEALTH_COACH.md](docs/HEALTH_COACH.md) · Membership: [docs/MEMBERSHIP.md](docs/MEMBERSHIP.md).

## Architecture

| Layer | Role |
| --- | --- |
| LINE webhook | Only user-facing interface (signature required) |
| Prisma / DB | **Source of truth** (food, weight, body scans, sleep, exercise, …) |
| OpenAI | Estimation / classification / extraction / coach wording only — never SoT |
| Google Sheets | Optional reporting export — never SoT |

```text
LINE → verify signature → claim LineEvent → process → reply/push
                              ↓
                         Prisma (SQLite local / PostgreSQL prod)
                              ↓ (async, best-effort)
                         Google Sheets (optional)
```

## Local development

```bash
cp .env.example .env
# fill LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, OPENAI_API_KEY
npm install
npx prisma migrate dev
npm run start:dev
```

Webhook (local):

```text
POST http://localhost:3000/line/webhook
```

### Cloudflare Quick Tunnel (development only)

```bash
cloudflared tunnel --url http://localhost:3000
# Webhook: https://<tunnel>/line/webhook
```

Do **not** use Quick Tunnel for production. Production needs a stable HTTPS domain — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Health checks

```text
GET /health/live   # process only (liveness)
GET /health/ready  # database (readiness; HTTP 503 if DB down)
GET /health        # combined
```

OpenAI / Sheets outages must not fail liveness.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | no | `development` / `production` |
| `PORT` | no | default `3000` |
| `DATABASE_URL` | **yes** | Dev: `file:./dev.db`. Prod: `postgresql://...` |
| `APP_TIMEZONE` | no | default `Asia/Bangkok` |
| `LINE_CHANNEL_SECRET` | prod **yes** | Webhook HMAC |
| `LINE_CHANNEL_ACCESS_TOKEN` | prod **yes** | Reply/push |
| `OPENAI_API_KEY` | prod **yes** | Food / classify / coach |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | optional | All three Sheets vars together, or all empty |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | optional | |
| `GOOGLE_PRIVATE_KEY` | optional | PEM; use `\n` for newlines in one line |

Production startup **fails fast** if required secrets / Postgres URL are missing.
Secrets are never logged.

## Database

- **Local:** SQLite (`prisma/schema.prisma`).
- **Production:** PostgreSQL artifacts in `prisma/postgres/` — [docs/DATABASE.md](docs/DATABASE.md).
- **Backups:** documented only — [docs/BACKUP.md](docs/BACKUP.md).

```bash
npx prisma migrate dev       # local SQLite
npx prisma migrate deploy    # production Postgres (after switching to prisma/postgres artifacts)
npm run cleanup:retention    # expired pending + old LineEvent rows
```

## Docker (production image)

```bash
docker build -t line-calorie-coch:prod .
```

Multi-stage, non-root, no secrets in the image. Full steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## OpenAI

Set `OPENAI_API_KEY`. Cost controls: [docs/AI_COST.md](docs/AI_COST.md).
Quantity adjustments stay local (no OpenAI).

## Membership / subscription / AI usage

FREE + PRO (**50 THB/month**). Promo Free PRO codes **10/15/30 days** (`TASTOM-XXXXXX`).

- Web: `/membership` · API: `/api/membership/*`
- Local QA: `/dev/*` (`ENABLE_DEV_MEMBERSHIP_TOOLS=true`)
- Payment: `PAYMENT_MODE=MOCK` (default) or `STRIPE` TEST
- Admin: `/admin` · roles `USER`/`ADMIN`
- Docs: [docs/MEMBERSHIP.md](docs/MEMBERSHIP.md)

**PAYMENT LIVE = NOT ACTIVE.**

## Google Sheets (optional)

[docs/SHEETS_ACL.md](docs/SHEETS_ACL.md). Formula injection sanitized.

## Reliability / security docs

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production runbook
- [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md) — SIT / UAT / PRD branch + Railway environment strategy
- [docs/API_RESILIENCE.md](docs/API_RESILIENCE.md) — timeouts / circuit breaker
- [docs/SECURITY.md](docs/SECURITY.md) — Phase 9 review
- [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md) — production smoke checklist

Phase 7 notes still apply: confirm is transactional; webhook claim kept if reply fails; AI rate limits + circuit breaker.

## Testing

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

E2E mocks OpenAI / LINE outbound / Sheets. No real production credentials required.

## Security notes

- Never commit `.env` or service-account keys.
- Never log secrets or access tokens.
- Do not weaken LINE signature verification.
- Do not re-expose REST endpoints that accept arbitrary `userId`.
