# External API resilience

## Summary

| Dependency | Timeout | Retry | On failure | Mutation safety |
| --- | --- | --- | --- | --- |
| LINE Messaging API | SDK / platform | No blind retry of business mutations | `LineOutboundError`; push fallback after durable confirm when `lineUserId` known | Webhook claim kept if reply fails |
| OpenAI | 15s | No automatic retry loop | Circuit breaker + friendly UX / deterministic coach fallback | FoodLog only after user confirm |
| Google Sheets | 10s | None (fire-and-forget) | Logged warn; DB remains SoT | Never blocks webhook UX |

## LINE

- Signature verification on raw body before any work.
- Persist `LineEvent` as PENDING, with the verified event payload and a unique `webhookEventId`, **before** returning HTTP 200. A database acceptance failure returns HTTP 503 so LINE can redeliver.
- An in-process PostgreSQL-backed worker polls the persisted queue, atomically claims a PROCESSING lease (180 seconds, renewed every 15 seconds), and retries failures with exponential backoff. After six attempts an event becomes DEAD and requires a monitored recovery decision.
- The worker never uses a Promise-race timeout to release an active claim; this avoids overlapping mutations still running after an apparent timeout. At most four different LINE users are processed concurrently **per replica**, with same-user events serialized within that replica.
- FoodLog and WeightLog carry optional unique `sourceLineEventId` keys, preventing duplicate inserts on redelivery/recovery. Pending food confirmation is transactional.
- LINE response failures do **not** roll back completed mutations. For HTTP 400 reply-token rejection from a verified event, the LINE client attempts a push fallback using that event's authenticated LINE recipient.
- An expiring lease or crash may cause at-least-once processing; non-food/weight effects and cross-replica ordering are not proven exactly-once. Keep one Railway app replica until stronger distributed serialization has been reviewed.
- Retention cleanup deletes only COMPLETED rows; FAILED, PROCESSING, PENDING and DEAD events remain available for investigation.

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

- Do not retry business mutations blindly. LINE queue retry is permitted only with durable event identity and idempotent effects; current guarantees cover FoodLog and WeightLog inserts, not all side effects.
- Do not count at-least-once queue processing as exactly-once delivery.
- For verified Stripe webhooks, insert the provider event ledger and mutate entitlement in the same serializable transaction. A failed transaction must remain retryable with HTTP 5xx; invalid signatures use HTTP 401.
- Monitor FAILED/DEAD queue counts, Stripe processing errors and expired leases without logging message bodies, payment credentials or user secrets.
