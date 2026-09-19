# Phase 9 security review

Review date: 2026-09-19. Scope: in-repo NestJS LINE coach (Phases 1–8 + Phase 9 hardening).
No production credentials were used.

## Findings

| Area | Status | Notes |
| --- | --- | --- |
| LINE signature verification | OK | Raw body HMAC; 401 on failure; not weakened |
| User isolation | OK | Pending/FoodLog/Weight scoped by `userId`; confirm ownership checks |
| Public REST | OK | No arbitrary `/users` mutation API |
| Input validation | OK | Onboarding parsers, weight bounds, AI output validator |
| SQL / ORM | OK | Prisma parameterized; no raw user SQL |
| Prompt injection | OK | Untrusted user content separated from system + FACTUAL context |
| Sheets formula injection | OK | `sanitizeSheetCell` |
| Secrets | OK | `.env` gitignored; env validation; never logged |
| Logs | OK | Hashed LINE user key; no tokens / image bytes / full bodies |
| Rate limits | OK | Per LINE user AI buckets including coach |
| Webhook idempotency | OK | Unique `LineEvent.lineEventId` claim |
| Pending ownership | OK | Unique pending per user; forbidden cross-user |
| Confirm race | OK | Atomic transaction pending → FoodLog |
| Health | OK | Liveness independent of OpenAI/Sheets |
| Docker | OK | Non-root user; no secrets in image; `.dockerignore` |

## Residual risks (accepted for V1)

| Risk | Mitigation / follow-up |
| --- | --- |
| In-process rate limit / circuit breaker / pending-replace buffer | Multi-instance deploy needs sticky sessions or shared store (not in Phase 9) |
| Quick Tunnel misuse in prod | Documented as **dev only** |
| Backup not auto-configured | Ops must enable managed Postgres backups |
| OpenAI spend | Account-level budgets manual; see `docs/AI_COST.md` |

## Must not regress

- Do not disable signature verification for “easier testing” in production builds.
- Do not return stack traces or secret material in LINE replies.
- Do not treat Sheets or AI as source of truth.
