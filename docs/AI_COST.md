# OpenAI cost protection

**Status:** implemented in code (rate limits, timeouts, circuit breaker, local quantity math).
Billing / quotas with OpenAI account = **not configured** by this repo.

## Expensive paths

| Path | Model usage | Mitigation |
| --- | --- | --- |
| Food image analysis | Vision (`gpt-5` default — set per-env via `FOOD_VISION_MODEL`, e.g. production uses `gpt-4o`) | 4/min/user; max **4 MB** image; reject oversized |
| Photo-kind pre-check | JSON classify (`gpt-5`, reasoning_effort=low) | Runs before every photo analysis; ~20 output tokens |
| Food text analysis | Chat completions (`gpt-5`, reasoning_effort=low) | 8/min/user |
| Message classify | JSON classify (`gpt-5`, reasoning_effort=low) | 20/min/user; skipped when rules match |
| Meal plan suggestion | Chat completions (`gpt-5`, reasoning_effort=low) | `MEAL_PLAN` quota bucket |
| Health coach Q&A | Chat completions (`gpt-5`, reasoning_effort=low) | 10/min/user (`coach` bucket) |
| Daily coach tip / meal suggestions | Chat completions (`gpt-5`, reasoning_effort=low) | 10/min/user; deterministic fallback if limited/down |
| Weekly review summary | Chat completions (`gpt-5`, reasoning_effort=low) | `WEEKLY_REVIEW` quota bucket; deterministic focus list fallback |
| Body scan report OCR | Vision (`gpt-5`, reasoning_effort=low) | `BODY_SCAN` quota bucket |
| Composition correction edit | Re-analysis | Same food text/image limits |
| Quantity adjust (`กิน 3 ชิ้น`) | **None** | Local proportional math only |

Every AI path in the product now uses `gpt-5` (reasoning_effort=low) — moved off `gpt-4o-mini` one path at a time as each one's gpt-4o-mini-era inaccuracy showed up in production (see notes below). `completionLimits()` (`src/modules/food/food-analysis.service.ts`, exported for reuse) centralizes the reasoning-model request shape (`max_completion_tokens`/`reasoning_effort` instead of `temperature`/`max_tokens`) for every call site above.

## Rate limits (per LINE user id)

See `describeAiRateLimits()` / `src/common/ai-rate-limiter.ts`:

- food text: 8 / minute
- food image: 4 / minute
- classify: 20 / minute
- coach: 10 / minute

Circuit breaker: 5 consecutive OpenAI failures → 60s cooldown (process-local).

Timeouts: OpenAI calls capped at **15s** (`OPENAI_CALL_TIMEOUT_MS`).

**Classify model note:** `MESSAGE_CLASSIFY_MODEL` (`src/modules/food/message-classify.types.ts`) moved from `gpt-4o-mini` to `gpt-5` so one classifier call can also pick up exercise/sleep/nap/water free-text reports the deterministic regexes in `health-commands.ts` miss. `gpt-5` is a reasoning model — higher per-call cost and latency than `gpt-4o-mini`, still rate-limited at 20/min/user and only called after every exact-command and regex fast path has already failed to match. If latency on the "วันนี้"/classify hot path becomes noticeable, `gpt-5-mini` is the cheaper fallback to try first.

**Food analysis model note:** `FOOD_ANALYSIS_MODEL` (`src/modules/food/food-analysis.types.ts`) moved from `gpt-4o-mini` to `gpt-5` — `gpt-4o-mini` gave the same calorie estimate for a packaged snack regardless of the price the user typed (e.g. "เลย์ห่อละ10บาท" vs "เลย์ห่อละ30บาท" both answered ~150 kcal, confirmed in production), because it has no real-world knowledge of product pricing to reason with. `gpt-5` is prompted to use a stated price as a cue for pack size. This also changes the vision fallback model used when `FOOD_VISION_MODEL` is unset — every real environment sets `FOOD_VISION_MODEL` explicitly (production uses `gpt-4o`), so this only affects a fresh/local environment with no override.

**Project-wide gpt-5 note:** every remaining `gpt-4o-mini` call site (photo-kind pre-check, daily coach tip / meal suggestion, meal plan suggestion, health coach Q&A, weekly review summary, body scan report OCR) also moved to `gpt-5`. Deliberate, explicit choice to prioritize accuracy over the lower per-call cost of `gpt-4o-mini` across the whole product, not just the paths where a concrete bug was found — same reasoning-model trade-off already made for the classifier and food analysis above: higher per-call cost and latency, same rate limits as before. `OPENAI_MODEL_PRICING_USD` (`src/modules/membership/openai-pricing.ts`) now carries a `gpt-5` entry so the admin cost dashboard can price these calls instead of showing `known: false`.

## Expected AI usage (order-of-magnitude, active user / day)

Assumes a typical logging day (not a load test):

| Activity | Calls / day (approx.) |
| --- | --- |
| 3 meals text or photo | 3–6 analysis |
| Occasional classify on ambiguous text | 0–5 |
| 1–2 “วันนี้” / meal tips | 1–3 coach |
| Quantity-only edits | 0 |

Heavy photo users cost more (vision tokens). Prefer text when possible.

## Plan daily quotas (product)

In addition to per-minute rate limits, membership enforces **daily** AI quotas
(FREE vs PRO). See [MEMBERSHIP.md](./MEMBERSHIP.md) and `plan.config.ts`.

Payment collection is **not implemented**; quotas and entitlement are.

## What we do not do (yet)

- Real payment / Stripe checkout
- Soft monthly spend caps at the OpenAI dashboard (set those in the OpenAI account — **manual**)
- Shared Redis rate limits across multiple app instances (V1 is in-process)
