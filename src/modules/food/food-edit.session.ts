/**
 * In-process session for editing today's FoodLog (V1).
 * Survives only within one Node process — same pattern as pendingReplaceBuffer.
 */

export type FoodEditSession =
  | { kind: 'await_quantity'; foodLogId: string }
  | { kind: 'await_name'; foodLogId: string }
  | { kind: 'await_nutrition'; foodLogId: string }
  /** PendingFoodAnalysis holds the replacement estimate for this FoodLog. */
  | { kind: 'name_replace_pending'; foodLogId: string };

type Entry = {
  session: FoodEditSession;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;

export class FoodEditSessionBuffer {
  private readonly entries = new Map<string, Entry>();

  set(userId: string, session: FoodEditSession): void {
    this.entries.set(userId, {
      session,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  get(userId: string): FoodEditSession | null {
    const entry = this.entries.get(userId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(userId);
      return null;
    }
    return entry.session;
  }

  take(userId: string): FoodEditSession | null {
    const session = this.get(userId);
    this.entries.delete(userId);
    return session;
  }

  clear(userId: string): void {
    this.entries.delete(userId);
  }

  reset(): void {
    this.entries.clear();
  }
}

export const foodEditSessionBuffer = new FoodEditSessionBuffer();
