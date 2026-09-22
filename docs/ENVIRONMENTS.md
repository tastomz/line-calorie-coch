# Environments (SIT / UAT / PRD)

Status: **documented + branches created** — the three Railway environments themselves are **not configured**; that part is manual (Railway account access is not available to this repo's automation).

## Branch → Railway environment mapping

| Branch | Railway environment | Purpose |
| --- | --- | --- |
| `sit` | SIT | Integration testing — first stop after a feature is code-complete |
| `uat` | UAT | User acceptance testing — stakeholder sign-off before release |
| `prd` | PRD | Production — what LINE users actually talk to |

`main` / `develop` stay as they are today (default branch / feature integration) and are not wired to a Railway environment by this change. Decide separately how work flows from `develop`/`main` into `sit` (e.g. merge or cherry-pick once a feature is ready for QA).

Promotion is a normal merge, in order — never skip a stage:

```bash
git checkout sit  && git merge --ff-only <tested commit> && git push origin sit
# after SIT sign-off
git checkout uat  && git merge --ff-only sit           && git push origin uat
# after UAT sign-off
git checkout prd  && git merge --ff-only uat            && git push origin prd
```

`--ff-only` keeps all three branches on the exact same commit history so "what's in UAT" and "what's in PRD" is never ambiguous. If a branch has diverged, fix that with a merge commit deliberately, not a force-push.

CI (`.github/workflows/ci.yml`) now runs lint + test + build on push to `main`, `develop`, `sit`, `uat`, and `prd`, plus all pull requests.

## One-time setup per Railway environment (manual, dashboard)

Repeat for SIT, UAT, PRD:

1. **Create the environment** in the Railway project (Environments → New Environment), name it `sit` / `uat` / `prd` to match the branch.
2. **Set the deploy source** to the matching branch (`sit` → `sit`, etc.) so pushes to that branch — and only that branch — deploy to that environment.
3. **Provision a dedicated Postgres plugin** for the environment. Do not point two environments at the same `DATABASE_URL` — SIT/UAT test data (including destructive QA scripts) must never touch PRD data. Copy the generated `DATABASE_URL` into that environment's variables.
4. **Set environment variables** — see table below. `railway.json` (`preDeployCommand: npx prisma migrate deploy`, `numReplicas: 1`, `healthcheckPath: /health/ready`) applies automatically to every environment; only the variables differ.
5. **Point a LINE channel at this environment's webhook** — see "LINE channels" below.
6. Trigger a first deploy and confirm `GET /health/ready` returns `200`.

## Environment variables by environment

| Variable | SIT | UAT | PRD |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | `production` | `production` |
| `DATABASE_URL` | SIT Postgres plugin | UAT Postgres plugin | PRD Postgres plugin |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | SIT LINE channel | UAT LINE channel | PRD LINE channel (real OA) |
| `OPENAI_API_KEY` | shared or low-quota test key | shared or low-quota test key | production key with budget alerts (`docs/AI_COST.md`) |
| `PAYMENT_MODE` | `MOCK` | `STRIPE` (test keys) — matches real checkout UX for sign-off | `STRIPE` (only once payments go live) or `MOCK` until then |
| `ENABLE_MEMBERSHIP_CHECKOUT` | `false` unless testing checkout | `true` (test keys only) | `false` until payments are actually launched |
| `ENABLE_DEV_MEMBERSHIP_TOOLS` | `false` | `false` | `false` (always — `DevToolsGuard` also hard-blocks this when `NODE_ENV=production`, this is belt-and-suspenders) |
| Stripe keys | unset or `sk_test_…` | `sk_test_…` (never `sk_live_…`) | unset until launch, then `sk_live_…` |
| `MEMBERSHIP_SESSION_SECRET` / `ADMIN_SESSION_SECRET` | unique per environment | unique per environment | unique per environment, real secret |
| `ADMIN_PASSWORD_HASH` | unique per environment | unique per environment | unique per environment |

Never reuse a session/admin secret across environments — a leaked SIT secret must not grant access to PRD.

`NODE_ENV=production` is intentional for SIT and UAT too: it keeps startup validation, security headers, and env-var fail-fast behavior identical to PRD, so what passes UAT is representative of what will run in PRD. The environment's *purpose* (SIT/UAT/PRD) is controlled by which Railway environment and which secrets it has, not by `NODE_ENV`.

## LINE channels

LINE does not support multiple environments behind one channel. Create **three separate LINE Official Account channels** (or at minimum three separate Messaging API channels under one provider) — one per environment — each with its own webhook URL pointed at that Railway environment's domain (`https://<sit-domain>/line/webhook`, etc.). Do not point a test channel's webhook at PRD or vice versa.

## What this change did NOT do

- Did not create the Railway environments/services themselves (no Railway credentials available here).
- Did not provision Postgres instances or set any environment variables in Railway.
- Did not create the LINE channels for SIT/UAT.
- Did not decide how `develop`/`main` feed into `sit` — that promotion policy is still open; pick one and document it here once decided.
