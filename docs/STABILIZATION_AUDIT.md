# Stabilization audit — review-only findings and release gates

Base: `main` at `66163bf963b19d8496cee209c78c6fa844c5eefd`. Working branch: `improvement/kcal-coach-stabilization`. No production changes or Codex authentication changes authorized.

## Verified source-level findings

| Area | Finding | Status / action |
| --- | --- | --- |
| CI | `npm run lint` uses `eslint --fix`; GitHub Actions did not build Angular frontend | Changed lint to non-mutating, added separate `lint:fix`, added frontend job and Prisma schema validation |
| Vision tests | Existing mocks lack explicit `kind: food` for the newly fail-closed classifier | Aligned test fixtures and assertions without weakening classification |
| Promo tests | Old trial fixture uses `plan: PRO` and `hasProAccess: true` | Updated mock to current effective `TRIAL` entitlement |
| PromptPay | When redeeming a paid pass during active Trial, `hasProAccess` is false so remaining trial period was not added to purchased pass | Corrected stacking predicate, preserving trial time |
| Payment webhook | `handleVerifiedWebhook` inserts `PaymentEvent` before `applyWebhookEvent`; after a failure the same event ID becomes a no-op on retry | **Unresolved P1**. Requires durable processing status/transaction design, concurrency/retry tests, reviewed database migration and rollout |
| LINE webhook | `handleWebhookBody` waits for all event processing before returning HTTP 200; timeout releases claim even if async work is still running | **Unresolved P1**. Needs persistent payload, lease/claim state, restart recovery, per-user ordering and end-to-end idempotency; do not patch by blind fire-and-forget |
| LINE observability | HTTP 499s and Codex AI failures were observed in Railway logs on 2026-11-06 | Operational observations; preserve existing Codex authentication per scope exclusion |
| Database backups | Backup guide explicitly says production managed backups not configured by repo | Expanded owner-operated isolated restore checklist and RPO/RTO proposals; actual provider status unverified |
| Branch protection | GitHub main currently reports `protected: false` | Manual owner approval required to configure protection/rulesets |

## Payment remediation design requiring review

The event record and entitlement mutation must be made recoverable. A status-only column is insufficient unless concurrency is controlled. A safe plan is to introduce event processing states plus a lease/unique ownership mechanism; treat already-completed events as duplicates, reclaim only expired failed/in-progress events, use a canonical checkout-session key for pass grants, and make subscription mutation idempotent. Test partial failures, conflicting updates, out-of-order subscription snapshots, and concurrent Stripe retries on disposable PostgreSQL. Do not migrate production before approved staging verification.

Until corrected, do not rely on generic provider-event idempotency to guarantee paid entitlement recovery. Reconcile suspicious paid but not granted orders with Stripe using read-only verification and owner approval.

## LINE remediation design requiring review

Persist a verified webhook event with sanitized payload and status before acknowledging LINE. Implement a database-backed lease/worker with explicit lifecycle, per-user serialization where needed, bounded attempts and recovery after restart. Never release an event claim just because a Promise timeout elapsed; the original work may continue. Treat payment/food writes as idempotent transactions. Distinguish outbound reply failure (potentially expired token) from business mutation failure. No new infrastructure is needed if a carefully designed PostgreSQL-backed worker meets throughput requirements.

## Required manual settings (do not change automatically)

1. Enable a GitHub branch ruleset/protection for `main`: require PR, required backend/frontend checks, block force pushes and bypasses, and require current branch checks before merge. Consider protections for `uat`/`sit`.
2. Confirm production PostgreSQL backup policy and retention in Railway, configure only after approval, verify recovery into isolated database.
3. Review project/branch auto-deploy mapping before eventual merge; do not point this improvement branch to a live Railway environment.
4. Obtain explicit owner authorization for any proposed production schema migration, Railway change, secret handling or deployment.

## Test execution policy

GitHub Actions jobs on the improvement branch are the only tests executed through the connected tools in this run. Individual past workflow results apply only to their own commit SHA. Never claim a passing end-to-end suite, production smoke test, PostgreSQL integration test or security audit without an actual run.

## Scope restrictions

Codex/ChatGPT authentication and TRIAL routing are out of scope; unchanged in architecture. No customer-sensitive production records accessed. No production migrations, deployments, settings or backups modified.
