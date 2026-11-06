# Stabilization audit — review-only findings and release gates

Base: `main` at `66163bf963b19d8496cee209c78c6fa844c5eefd`. Working branch: `improvement/kcal-coach-stabilization`. No production changes or Codex authentication changes authorized.

## Verified source-level findings

| Area | Finding | Status / action |
| --- | --- | --- |
| CI | `npm run lint` uses `eslint --fix`; GitHub Actions did not build Angular frontend | Changed lint to non-mutating, added separate `lint:fix`, added frontend job and Prisma schema validation |
| Vision tests | Existing mocks lack explicit `kind: food` for the newly fail-closed classifier | Aligned test fixtures and assertions without weakening classification |
| Promo tests | Old trial fixture uses `plan: PRO` and `hasProAccess: true` | Updated mock to current effective `TRIAL` entitlement |
| PromptPay | When redeeming a paid pass during active Trial, `hasProAccess` is false so remaining trial period was not added to purchased pass | Corrected stacking predicate, preserving trial time |
| Payment webhook | `PaymentEvent` was inserted before entitlement changes, risking lost grants on failed handlers | **Implemented on branch (P1)**: event receipt and entitlement changes are now inside a Serializable Prisma transaction, with PromptPay checkout-session dedupe; verified processing failure returns retryable HTTP 5xx. Disposable PostgreSQL concurrent-payment testing and production rollout remain unverified |
| LINE webhook | `handleWebhookBody` waits for all event processing before returning HTTP 200; timeout releases claim even if async work is still running | **Unresolved P1**. Needs persistent payload, lease/claim state, restart recovery, per-user ordering and end-to-end idempotency; do not patch by blind fire-and-forget |
| LINE observability | HTTP 499s and Codex AI failures were observed in Railway logs on 2026-11-06 | Operational observations; preserve existing Codex authentication per scope exclusion |
| Database backups | Backup guide explicitly says production managed backups not configured by repo | Expanded owner-operated isolated restore checklist and RPO/RTO proposals; actual provider status unverified |
| Branch protection | GitHub main currently reports `protected: false` | Manual owner approval required to configure protection/rulesets |

## Payment remediation design requiring review

The current branch applies the provider event and entitlement changes inside one database transaction. A failure before commit rolls both back and Stripe can retry. PromptPay pass grant retains the unique `pass:<checkout-session>` marker in that same transaction; trial-to-Pro stacking has a regression test. A verified webhook that fails during processing now returns HTTP 5xx instead of incorrectly returning HTTP 401. Do not treat this as production-verified: concurrency, PostgreSQL SERIALIZABLE conflicts, slow Stripe API calls inside the transaction, missing provider snapshots, and out-of-order events require integration tests against a disposable PostgreSQL database and an approved SIT/UAT rollout. Historical events previously marked processed but not granted may need **manual payment reconciliation**; this patch does not retroactively repair them.

## LINE remediation design requiring review

Persist a verified webhook event with sanitized payload and status before acknowledging LINE. Implement a database-backed lease/worker with explicit lifecycle, per-user serialization where needed, bounded attempts and recovery after restart. Never release an event claim just because a Promise timeout elapsed; the original work may continue. Treat payment/food writes as idempotent transactions. Distinguish outbound reply failure (potentially expired token) from business mutation failure. No new infrastructure is needed if a carefully designed PostgreSQL-backed worker meets throughput requirements.

## Dependency audit — verified failure (2026-11-06)

`npm audit --omit=dev --audit-level=high` failed on CI with **12 vulnerabilities: 6 high and 6 moderate**. Affected dependency trees include `body-parser`, `multer` (through NestJS platform-express), `deepmerge-ts` (through Prisma config), `qs`, and `glob`/`minimatch`. Several advisories concern denial of service. Non-breaking patches are reported available for some packages, but Prisma/deepmerge-ts indicates a Prisma major upgrade for full remediation. **No automatic major upgrade, audit suppression, or lockfile modification has been performed.** Validate compatible patches and regression tests before release. Keep the security check failing until resolved; no false green status.

## Required manual settings (do not change automatically)

1. Enable a GitHub branch ruleset/protection for `main`: require PR, required backend/frontend checks, block force pushes and bypasses, and require current branch checks before merge. Consider protections for `uat`/`sit`.
2. Confirm production PostgreSQL backup policy and retention in Railway, configure only after approval, verify recovery into isolated database.
3. Review project/branch auto-deploy mapping before eventual merge; do not point this improvement branch to a live Railway environment.
4. Obtain explicit owner authorization for any proposed production schema migration, Railway change, secret handling or deployment.

## Offline food accuracy measurement

Added a versioned, currently empty golden dataset manifest (`test/fixtures/food-golden/v1.json`), pure evaluator, synthetic arithmetic tests, and collection guidance (`docs/FOOD_EVALUATION.md`). No real food photo ground-truth data is present, and no accuracy claims are justified until independently verified labels and a runnable image test set exist.

## Test execution policy

GitHub Actions jobs on the improvement branch are the only tests executed through the connected tools in this run. Individual past workflow results apply only to their own commit SHA. Never claim a passing end-to-end suite, production smoke test, PostgreSQL integration test or security audit without an actual run.

## Scope restrictions

Codex/ChatGPT authentication and TRIAL routing are out of scope; unchanged in architecture. No customer-sensitive production records accessed. No production migrations, deployments, settings or backups modified.
