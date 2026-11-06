import { AsyncLocalStorage } from 'node:async_hooks';

// Propagates verified webhook identity across NestJS service calls without
// changing public methods or trusting a client-supplied event identifier.
const lineEventScope = new AsyncLocalStorage<string>();

export function withLineEventContext<T>(
  lineEventId: string,
  work: () => Promise<T>,
): Promise<T> {
  return lineEventScope.run(lineEventId, work);
}

export function currentLineEventId(): string | undefined {
  return lineEventScope.getStore();
}
