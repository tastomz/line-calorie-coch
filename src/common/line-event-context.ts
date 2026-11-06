import { AsyncLocalStorage } from 'node:async_hooks';

type LineEventScope = {
  eventId: string;
  userId?: string;
};

// Only a verified LINE webhook worker may populate this context.
const lineEventScope = new AsyncLocalStorage<LineEventScope>();

export function withLineEventContext<T>(
  lineEventId: string,
  work: () => Promise<T>,
  userId?: string,
): Promise<T> {
  return lineEventScope.run({ eventId: lineEventId, userId }, work);
}

export function currentLineEventId(): string | undefined {
  return lineEventScope.getStore()?.eventId;
}

export function currentLineEventUserId(): string | undefined {
  return lineEventScope.getStore()?.userId;
}
