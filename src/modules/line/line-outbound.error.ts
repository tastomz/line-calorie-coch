/**
 * Thrown when LINE outbound delivery (reply/push) fails AFTER the
 * application has already completed (or does not need) a durable mutation.
 * Webhook idempotency must NOT release the event claim for this error.
 */
export class LineOutboundError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LineOutboundError';
  }
}
