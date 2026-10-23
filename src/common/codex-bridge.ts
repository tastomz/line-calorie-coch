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
  /** Trial is routed to Codex (CODEX_TRIAL_ENABLED is not "false"). */
  routesTrial(): boolean;
  /** Signed in and not paused after repeated failures. */
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
