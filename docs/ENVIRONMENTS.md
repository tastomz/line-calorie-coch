# Environments (SIT / UAT / PRD)

Status: **implemented, with one deliberate naming deviation from the original plan** — all three Railway environments exist and are live. The original plan called for a `prd` branch feeding a `PRD` environment; what was actually built uses the `main` branch as the production deploy source, and the Railway environment is named `production` (not `prd`). There is no `prd` branch and none is planned. This section documents the real mapping — do not follow the old `prd`-branch instructions below as if they were pending work.

## Branch → Railway environment mapping (as actually deployed)

| Branch | Railway environment | Purpose |
| --- | --- | --- |
| `sit` | `sit` | Integration testing — first stop after a feature is code-complete |
| `uat` | `uat` | User acceptance testing — stakeholder sign-off before release |
| **`main`** | **`production`** | Production — what LINE users actually talk to |

`develop` stays as a feature-integration branch and is not wired to a Railway environment. Decide separately how work flows from `develop` into `sit` (e.g. merge or cherry-pick once a feature is ready for QA).

Promotion is a normal merge, in order — never skip a stage:

```bash
git checkout sit  && git merge --ff-only <tested commit> && git push origin sit
# after SIT sign-off
git checkout uat  && git merge --ff-only sit           && git push origin uat
# after UAT sign-off
git checkout main && git merge --ff-only uat            && git push origin main
```

`--ff-only` keeps all three branches on the exact same commit history so "what's in UAT" and "what's in production" is never ambiguous. If a branch has diverged, fix that with a merge commit deliberately, not a force-push.

Because production deploys straight from `main`, **any push or merge to `main`** — not just a deliberate uat→main promotion — goes live immediately. There is currently no branch-protection gate enforcing sit→uat→main order; treat `main` as production and merge into it with the same care as the old `prd` plan intended.

CI (`.github/workflows/ci.yml`) runs lint + test + build on push to `main`, `develop`, `sit`, and `uat`, plus all pull requests.

## One-time setup per Railway environment (manual, dashboard) — reference only, already done

Already completed for `sit`, `uat`, and `production` (the steps below are kept for reference in case an environment is ever rebuilt):

1. **Create the environment** in the Railway project (Environments → New Environment), named `sit` / `uat` / `production`.
2. **Set the deploy source** to the matching branch (`sit` → `sit`, `uat` → `uat`, `production` → `main`) so pushes to that branch — and only that branch — deploy to that environment.
3. **Provision a dedicated Postgres plugin** for the environment. Do not point two environments at the same `DATABASE_URL` — SIT/UAT test data (including destructive QA scripts) must never touch production data. Copy the generated `DATABASE_URL` into that environment's variables.
4. **Set environment variables** — see table below. `railway.json` (`preDeployCommand: npx prisma migrate deploy`, `numReplicas: 1`, `healthcheckPath: /health/ready`) applies automatically to every environment; only the variables differ.
5. **Point a LINE channel at this environment's webhook** — see "LINE channels" below.
6. Trigger a first deploy and confirm `GET /health/ready` returns `200`.

## Environment variables by environment

| Variable | SIT | UAT | Production |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `production` | `production` |
| `DATABASE_URL` | SIT Postgres plugin | UAT Postgres plugin | Production Postgres plugin |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | SIT LINE channel | UAT LINE channel | Production LINE channel (real OA) |
| `OPENAI_API_KEY` | shared or low-quota test key | shared or low-quota test key | production key with budget alerts (`docs/AI_COST.md`) |
| `PAYMENT_MODE` | `MOCK` | `STRIPE` (test keys) — matches real checkout UX for sign-off | `STRIPE` (only once payments go live) or `MOCK` until then |
| `ENABLE_MEMBERSHIP_CHECKOUT` | `false` unless testing checkout | `true` (test keys only) | `false` until payments are actually launched |
| `ENABLE_DEV_MEMBERSHIP_TOOLS` | `false` | `false` | `false` (always — `DevToolsGuard` also hard-blocks this when `NODE_ENV=production`, this is belt-and-suspenders) |
| Stripe keys | unset or `sk_test_…` | `sk_test_…` (never `sk_live_…`) | unset until launch, then `sk_live_…` |
| `MEMBERSHIP_SESSION_SECRET` / `ADMIN_SESSION_SECRET` | unique per environment | unique per environment | unique per environment, real secret |
| `ADMIN_PASSWORD_HASH` | unique per environment | unique per environment | unique per environment |

Verified against the live production service (names only; values were not read): `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` / `ENABLE_MEMBERSHIP_CHECKOUT` are **not set**, so Stripe checkout cannot process a real charge even if `PAYMENT_MODE` were switched to `STRIPE`.

Never reuse a session/admin secret across environments — a leaked SIT secret must not grant access to production.

`NODE_ENV=production` is intentional for SIT and UAT too: it keeps startup validation, security headers, and env-var fail-fast behavior identical to production, so what passes UAT is representative of what will run in production. The environment's *purpose* (SIT/UAT/production) is controlled by which Railway environment and which secrets it has, not by `NODE_ENV`.

## LINE channels

LINE does not support multiple environments behind one channel. Use **three separate LINE Official Account channels** (or at minimum three separate Messaging API channels under one provider) — one per environment — each with its own webhook URL pointed at that Railway environment's domain (`https://<sit-domain>/line/webhook`, etc.). Do not point a test channel's webhook at production or vice versa.

## Known gap

There is no branch-protection rule enforcing the sit→uat→main promotion order — a direct push or merge to `main` deploys to production immediately, bypassing SIT/UAT. If this needs to be a hard gate rather than a convention, add branch protection rules on `main` in GitHub repo settings.
