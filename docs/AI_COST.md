# OpenAI cost protection

**Status:** implemented in code (rate limits, timeouts, circuit breaker, local quantity math).
Billing / quotas with OpenAI account = **not configured** by this repo.

## Expensive paths

| Path | Model usage | Mitigation |
| --- | --- | --- |
| Food image analysis | Vision (`gpt-4o-mini`, `detail=low`) | 4/min/user; max **4 MB** image; reject oversized |
| Food text analysis | Chat completions | 8/min/user |
| Message classify | Small JSON classify | 20/min/user; skipped when rules match |
| Meal suggestions | Chat completions | 10/min/user (`coach` bucket) |
| Daily coach tip | Chat completions | 10/min/user; deterministic fallback if limited/down |
| Composition correction edit | Re-analysis | Same food text/image limits |
| Quantity adjust (`กิน 3 ชิ้น`) | **None** | Local proportional math only |

## Rate limits (per LINE user id)

See `describeAiRateLimits()` / `src/common/ai-rate-limiter.ts`:

- food text: 8 / minute
- food image: 4 / minute
- classify: 20 / minute
- coach: 10 / minute

Circuit breaker: 5 consecutive OpenAI failures → 60s cooldown (process-local).

Timeouts: OpenAI calls capped at **15s** (`OPENAI_CALL_TIMEOUT_MS`).

## Expected AI usage (order-of-magnitude, active user / day)

Assumes a typical logging day (not a load test):

| Activity | Calls / day (approx.) |
| --- | --- |
| 3 meals text or photo | 3–6 analysis |
| Occasional classify on ambiguous text | 0–5 |
| 1–2 “วันนี้” / meal tips | 1–3 coach |
| Quantity-only edits | 0 |

Heavy photo users cost more (vision tokens). Prefer text when possible.

## What we do not do (yet)

- Per-tenant billing
- Soft monthly spend caps at the OpenAI dashboard (set those in the OpenAI account — **manual**)
- Shared Redis rate limits across multiple app instances (V1 is in-process)
