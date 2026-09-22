import { AsyncLocalStorage } from 'async_hooks';

export type CapturedChatReply = {
  text: string;
  buttons?: Array<{ label: string; text: string }>;
};

type CaptureStore = {
  replies: CapturedChatReply[];
};

/** Dev-only: when set, LineService captures outbound messages instead of calling LINE API. */
export const lineReplyCapture = new AsyncLocalStorage<CaptureStore>();

export function captureLineReplies<T>(
  work: () => Promise<T>,
): Promise<{ result: T; replies: CapturedChatReply[] }> {
  const store: CaptureStore = { replies: [] };
  return lineReplyCapture.run(store, async () => {
    const result = await work();
    return { result, replies: store.replies };
  });
}
