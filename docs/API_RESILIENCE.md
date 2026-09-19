# External API resilience

## Summary

| Dependency | Timeout | Retry | On failure | Mutation safety |
| --- | --- | --- | --- | --- |
| LINE Messaging API | SDK / platform | No blind retry of business mutations | `LineOutboundError`; push fallback after durable confirm when `lineUserId` known | Webhook claim kept if reply fails |
| OpenAI | 15s | No automatic retry loop | Circuit breaker + friendly UX / deterministic coach fallback | FoodLog only after user confirm |
| Google Sheets | 10s | None (fire-and-forget) | Logged warn; DB remains SoT | Never blocks webhook UX |

## LINE

- Signature verification on raw body before any work.
- Idempotent `LineEvent` claim by `webhookEventId`.
- Per-event budget ~25s (`WEBHOOK_EVENT_BUDGET_MS`).
- After FoodLog confirm: reply failure does **not** roll back the log; optional push fallback once.

## OpenAI

- `withTimeout` + shared circuit breaker (`openAiCircuitBreaker`).
- Rate limits per LINE user (`aiRateLimiter`).
- Structured output validated (`food-analysis.validator`); invalid JSON rejected.
- Prompt isolation: system / FACTUAL CONTEXT / untrusted user message.

## Google Sheets

- Optional; disabled when env incomplete.
- `SheetsSyncService.enqueue` never awaited for user replies.
- Cell sanitization against formula injection.
- Upsert timed out at 10s.

## Rules

- Never retry a **business mutation** blindly (confirm, weight write, profile write).
- Retry outbound LINE/OpenAI only when the operation is **idempotent** or unread (not implemented as automatic multi-retry in V1 — prefer fail + user retry).
