/**
 * Short-lived flag: next image from this user is a body-scan report (not food).
 */
const TTL_MS = 15 * 60 * 1000;

export class BodyScanExpectBuffer {
  private readonly expiresAt = new Map<string, number>();

  arm(userId: string): void {
    this.expiresAt.set(userId, Date.now() + TTL_MS);
  }

  isArmed(userId: string): boolean {
    const exp = this.expiresAt.get(userId);
    if (exp == null) return false;
    if (exp < Date.now()) {
      this.expiresAt.delete(userId);
      return false;
    }
    return true;
  }

  consume(userId: string): boolean {
    const armed = this.isArmed(userId);
    this.expiresAt.delete(userId);
    return armed;
  }

  clear(userId: string): void {
    this.expiresAt.delete(userId);
  }

  reset(): void {
    this.expiresAt.clear();
  }
}

export const bodyScanExpectBuffer = new BodyScanExpectBuffer();
