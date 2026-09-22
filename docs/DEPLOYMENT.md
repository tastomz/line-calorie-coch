# Production deployment

This document is the executable production runbook.
It does **not** deploy anything by itself.

Status legend:

- **documented** — instructions exist in-repo
- **implemented** — code/behavior exists in-repo
- **not configured** — requires your cloud account / secrets / ops action

---

## Architecture reminders

- Prisma/DB = source of truth
- Google Sheets = optional reporting only
- OpenAI = estimation / wording only
- LINE webhook = only user-facing interface (`POST /line/webhook`, HTTPS)

---

## Development (local)

### Install

```bash
cp .env.example .env
# fill LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, OPENAI_API_KEY
npm install
npx prisma migrate dev
npm run start:dev
```

SQLite: `DATABASE_URL="file:./dev.db"` (default).

### LINE + Cloudflare Quick Tunnel (dev only)

```bash
npm run start:dev
cloudflared tunnel --url http://localhost:3000
```

Webhook URL:

```text
https://<random>.trycloudflare.com/line/webhook
```

Quick Tunnel URLs change on restart — **not** for production.

Health:

```text
GET /health/live   # process up
GET /health/ready  # database up (HTTP 503 if down)
GET /health        # combined status
```

---

## Production checklist (manual)

### 1. PostgreSQL

**Status:** documented (see `docs/DATABASE.md`, `prisma/postgres/README.md`)

1. Create managed Postgres with backups enabled.
2. Set `DATABASE_URL=postgresql://...` in the secret store.
3. Apply Prisma migrations from `prisma/postgres` (**not** `db push`):

```bash
cp prisma/postgres/schema.prisma prisma/schema.prisma
rm -rf prisma/migrations && cp -R prisma/postgres/migrations prisma/migrations
npx prisma migrate deploy
npx prisma generate
```

4. Verify `npx prisma migrate status`.
5. Start the app with `NODE_ENV=production`.

Local SQLite continues to use the root `prisma/schema.prisma` with `provider = "sqlite"`. Do not commit a permanent provider swap if developers still use SQLite.

### 2. Environment variables

**Status:** implemented (startup validation in `src/config/env.validation.ts`)

| Variable | Production |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | e.g. `3000` |
| `DATABASE_URL` | **required** Postgres URL |
| `LINE_CHANNEL_SECRET` | **required** |
| `LINE_CHANNEL_ACCESS_TOKEN` | **required** |
| `OPENAI_API_KEY` | **required** |
| `APP_TIMEZONE` | default `Asia/Bangkok` |
| Sheets trio | all set **or** all empty |

Production **fails fast** if required values are missing. Secrets are never logged.

### 3. Docker

**Status:** implemented (`Dockerfile`, `.dockerignore`) — image build is local/CI

```bash
docker build -t line-calorie-coch:prod .
# Run (example — inject secrets via env, never bake them in):
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL \
  -e LINE_CHANNEL_SECRET \
  -e LINE_CHANNEL_ACCESS_TOKEN \
  -e OPENAI_API_KEY \
  line-calorie-coch:prod
```

Before first traffic, run migrations (one-shot job / release step):

```bash
docker run --rm -e DATABASE_URL line-calorie-coch:prod \
  npx prisma migrate deploy
```

### 3a. Railway

**Status:** implemented (`railway.json`) — Postgres provisioning, backups, and env vars are still **not configured** (manual, in the Railway dashboard)

`railway.json` is Railway's config-as-code file; it applies automatically once the service is linked to this repo:

- `deploy.preDeployCommand` runs `npx prisma migrate deploy` before every deploy (equivalent to the Docker "release step" above).
- `deploy.numReplicas` is pinned to `1` — rate limiting and the pending-confirm buffer are in-process (see `docs/SECURITY.md`); do not raise this without moving that state to the DB or a shared store.
- `deploy.healthcheckPath` points at `/health/ready` (DB-aware), not `/health/live`, so Railway only cuts traffic over to a new deploy once it can reach the database.

Still manual in the Railway dashboard:

- Provision the Postgres plugin and set `DATABASE_URL` from it.
- Enable Postgres backups / PITR (`docs/BACKUP.md` is documentation only — nothing enables this automatically).
- Set the required env vars from `.env.example` (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `OPENAI_API_KEY`, plus the membership/Stripe vars if that feature is enabled).
- Point the LINE webhook at the Railway-issued HTTPS domain (see below).

### 4. HTTPS webhook (production)

**Status:** documented — **not configured** in this repo

- Use a stable HTTPS domain / load balancer / reverse proxy.
- Webhook: `https://your.domain/line/webhook`
- Do **not** use Cloudflare Quick Tunnel in production.
- Do **not** terminate TLS with a self-signed cert facing LINE.

### 5. Health checks (orchestrator)

**Status:** implemented

| Probe | Path | Expect |
| --- | --- | --- |
| Liveness | `GET /health/live` | `200` — process only |
| Readiness | `GET /health/ready` | `200` when DB up; `503` when DB down |

OpenAI / Sheets failures must **not** kill liveness.

### 6. Graceful shutdown

**Status:** implemented (`enableShutdownHooks` + SIGTERM/SIGINT → `app.close()` → Prisma `$disconnect`)

### 7. Backups

**Status:** documented only (`docs/BACKUP.md`) — **not configured** by the app

### 8. Retention cleanup

**Status:** implemented service + CLI — schedule is **not configured**

```bash
npm run cleanup:retention
# optional: LINE_EVENT_RETENTION_DAYS=45 npm run cleanup:retention
```

Deletes:

- expired `PendingFoodAnalysis` only
- old `LineEvent` rows past retention (default 30 days)

Never deletes FoodLog / WeightLog / User / NutritionProfile.

### 9. Logs

Structured JSON via `logEvent` / Nest Logger. Do not log secrets, tokens, raw images, or full webhook bodies.

### 10. Rollback

1. Keep previous container image tag.
2. If migration was applied: restore DB from pre-migration backup (see `docs/BACKUP.md`) **or** forward-fix with a new migration — do not `migrate reset` production.
3. Point traffic back to the previous image.
4. Run smoke tests (`docs/SMOKE_TEST.md`).

---

## Related docs

- `docs/DATABASE.md` — Postgres strategy
- `docs/BACKUP.md` — backup / restore
- `docs/AI_COST.md` — OpenAI cost protection
- `docs/API_RESILIENCE.md` — timeouts / circuit breaker
- `docs/SECURITY.md` — Phase 9 security review
- `docs/SMOKE_TEST.md` — production smoke checklist
- `docs/SHEETS_ACL.md` — Sheets sharing
