# Stabilization audit — implementation findings and release gates

Base: `main` at `66163bf963b19d8496cee209c78c6fa844c5eefd`. Working branch: `improvement/kcal-coach-stabilization`. No production changes or Codex authentication changes authorized.

## Verified source-level findings

| Area | Finding | Status / action |
| --- | --- | --- |
| CI | `npm run lint` uses `eslint --fix`; GitHub Actions did not build Angular frontend | Changed lint to non-mutating, added separate `lint:fix`, added frontend job and Prisma schema validation |
| Vision tests | Existing mocks lack explicit `kind: food` for the newly fail-closed classifier | Aligned test fixtures and assertions without weakening classification |
| Promo tests | Old trial fixture uses `plan: PRO` and `hasProAccess: true` | Updated mock to current effective `TRIAL` entitlement |
| PromptPay | When redeeming a paid pass during active Trial, `hasProAccess` is false so remaining trial period was not added to purchased pass | Corrected stacking predicate, preserving trial time |
| Payment webhook | `PaymentEvent` was inserted before entitlement changes, risking lost grants on failed handlers | **Implemented on branch (P1)**: event receipt and entitlement changes are now inside a Serializable Prisma transaction, with PromptPay checkout-session dedupe; verified processing failure returns retryable HTTP 5xx. Disposable PostgreSQL concurrent-payment testing and production rollout remain unverified |
| LINE webhook | Previously processed AI synchronously before HTTP 200 and released the event claim after Promise timeout | **Implemented on branch (P1):** persistent queue, worker leases/retries and event-scoped FoodLog/WeightLog unique keys. Staging concurrency and cross-replica safety remain unverified |
| LINE observability | HTTP 499s and Codex AI failures were observed in Railway logs on 2026-11-06 | Operational observations; preserve existing Codex authentication per scope exclusion |
| Database backups | Backup guide explicitly says production managed backups not configured by repo | Expanded owner-operated isolated restore checklist and RPO/RTO proposals; actual provider status unverified |
| Branch protection | GitHub main currently reports `protected: false` | Manual owner approval required to configure protection/rulesets |


## P1 webhook implementation on this branch (review before any deployment)

**Payment:** The verified provider-event marker and entitlement mutation now commit together under a serializable Prisma transaction. A failed mutation rolls back the marker, allowing Stripe to retry. PromptPay pass grants remain uniquely keyed by checkout session; a unique collision is reported as a duplicate only after checking the event ledger, not simply because any table raised P2002. Missing provider snapshots and unreconciled *paid* PromptPay metadata return a retryable error instead of silently granting or acknowledging a paid pass. Stripe signature verification remains mandatory; verified processing failure is HTTP 5xx and authentication failure remains HTTP 401.

**LINE:** Verified events are first persisted with payload/status PENDING. The HTTP handler acknowledges only after durable acceptance and returns HTTP 503 when persistence fails. An in-process polling worker on the existing PostgreSQL database claims events atomically, uses worker leases + renewal, supports restart recovery and exponential retries (up to six attempts), and blocks later same-user events within a single worker until the earlier event finishes. Promise-race timeouts no longer release a claim while mutation continues. OUTBOUND failures do not re-run business writes. FoodLog and WeightLog have a unique nullable `sourceLineEventId`; food confirmation already atomically consumes pending analysis.

**Migration required before enabling the new code:** The additive SQLite/PostgreSQL migrations `20261106230000_durable_line_webhook` introduce queue state and nullable event keys. Existing `LineEvent` rows default to COMPLETED; existing FoodLog and WeightLog rows keep NULL source keys. Confirm staging migration and database backup before any separately approved production deployment.

**Residual limitations:** In-process per-user ordering is designed for the currently configured single Railway replica; it is **not** a cross-replica serializable user lock. A stale lease could theoretically overlap with a still-running worker if lease renewal fails; FoodLog/WeightLog unique keys protect those inserts, but not every profile edit, promotion or outbound side effect. Events that exhaust retries become DEAD and require monitored, owner-approved reconciliation; no admin requeue UI is implemented. Stripe provider snapshots are still obtained inside a serializable transaction and deserve load/latency validation. Legacy payment-event markers from before this fix are not automatically reconciled; affected paid orders need read-only Stripe/DB audit and separately authorized remediation.

**Verification needed:** Test against disposable PostgreSQL and staged webhook integrations, including concurrent workers and actual Stripe test fixtures. GitHub CI mock/unit and disposable SQLite E2E runs are helpful but do not prove exactly-once effects across crashes or multi-replica deployments. Do not merge or deploy without owner sign-off.

## Payment remediation design requiring review

The current branch applies the provider event and entitlement changes inside one database transaction. A failure before commit rolls both back and Stripe can retry. PromptPay pass grant retains the unique `pass:<checkout-session>` marker in that same transaction; trial-to-Pro stacking has a regression test. A verified webhook that fails during processing now returns HTTP 5xx instead of incorrectly returning HTTP 401. Do not treat this as production-verified: concurrency, PostgreSQL SERIALIZABLE conflicts, slow Stripe API calls inside the transaction, missing provider snapshots, and out-of-order events require integration tests against a disposable PostgreSQL database and an approved SIT/UAT rollout. Historical events previously marked processed but not granted may need **manual payment reconciliation**; this patch does not retroactively repair them.

## LINE reliability validation remaining

Before a production rollout, run the prepared additive migrations in isolated SIT/UAT environments, test duplicate/redelivered LINE events and crash/restart recovery against disposable PostgreSQL, and confirm worker lease behavior under prolonged AI requests. Review non-food/weight side effects for replay safety. Do not increase Railway replicas above one without a database-backed cross-replica per-user serialization strategy. Monitor DEAD events and require deliberate reconciliation instead of indiscriminate replays.

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
