/**
 * Hook between the OpenAI client shim (plain function, used in constructors)
 * and the Nest CodexService that owns the ChatGPT sign-in.
 */
export type CodexChatResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export interface CodexBackend {
  /** Signed in, not paused after repeated failures, and not overloaded. */
  available(): boolean;
  chat(params: unknown): Promise<CodexChatResult>;
}

let backend: CodexBackend | null = null;

export function setCodexBackend(b: CodexBackend | null): void {
  backend = b;
}

export function getCodexBackend(): CodexBackend | null {
  return backend;
}
