/**
 * Simple V1 OpenAI circuit breaker (in-process).
 *
 * Defaults:
 * - open after 5 consecutive failures
 * - stay open for 60s cooldown, then half-open (allow one probe)
 *
 * Daily summary / DB-only paths must not depend on this.
 */
export class OpenAiCircuitBreaker {
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;
  private halfOpenProbe = false;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  isOpen(): boolean {
    if (this.openedAtMs == null) {
      return false;
    }
    if (Date.now() - this.openedAtMs >= this.cooldownMs) {
      // Allow a single probe request.
      this.halfOpenProbe = true;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
    this.halfOpenProbe = false;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (
      this.halfOpenProbe ||
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.openedAtMs = Date.now();
      this.halfOpenProbe = false;
    }
  }

  /** Test helper */
  reset(): void {
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
    this.halfOpenProbe = false;
  }
}

/** Shared process-wide breaker for OpenAI outbound calls. */
export const openAiCircuitBreaker = new OpenAiCircuitBreaker();
