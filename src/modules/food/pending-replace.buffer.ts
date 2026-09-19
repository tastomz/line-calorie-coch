/**
 * Pending food replacement buffer (in-process V1).
 * Holds the next food input until the user confirms replacing the current pending analysis.
 */
export type BufferedFoodInput =
  { kind: 'text'; text: string } | { kind: 'image'; messageId: string };

type Entry = {
  input: BufferedFoodInput;
  expiresAt: number;
};

const TTL_MS = 15 * 60 * 1000;

export class PendingReplaceBuffer {
  private readonly entries = new Map<string, Entry>();

  set(userId: string, input: BufferedFoodInput): void {
    this.entries.set(userId, {
      input,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  get(userId: string): BufferedFoodInput | null {
    const entry = this.entries.get(userId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(userId);
      return null;
    }
    return entry.input;
  }

  take(userId: string): BufferedFoodInput | null {
    const input = this.get(userId);
    this.entries.delete(userId);
    return input;
  }

  clear(userId: string): void {
    this.entries.delete(userId);
  }

  reset(): void {
    this.entries.clear();
  }
}

export const pendingReplaceBuffer = new PendingReplaceBuffer();
