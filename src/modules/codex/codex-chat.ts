/**
 * Converts an OpenAI chat.completions request into one `codex exec` run and
 * the Codex output back into a chat-completion-shaped object, so call sites
 * don't change when a Trial user is routed to Codex.
 */

export type CodexImage = { mime: string; data: Buffer };

export type CodexRequest = {
  prompt: string;
  images: CodexImage[];
  /** JSON Schema for --output-schema (OpenAI strict form). */
  schema: object | null;
  effort: 'minimal' | 'low' | 'medium' | 'high' | null;
};

export type CodexUsage = { inputTokens: number; outputTokens: number };

type ContentPart =
  | { type?: string; text?: string; image_url?: { url?: string } | string }
  | string;

type ChatMessage = {
  role?: string;
  content?: string | ContentPart[] | null;
};

export type ChatParams = {
  model?: string;
  messages?: ChatMessage[];
  reasoning_effort?: string | null;
  response_format?: {
    type?: string;
    json_schema?: { name?: string; schema?: unknown } | null;
  } | null;
};

const PREAMBLE =
  'งานนี้คือการตอบข้อความเท่านั้น ห้ามรันคำสั่ง ห้ามอ่านหรือสร้างไฟล์ ' +
  'ทำตาม "คำสั่งระบบ" อย่างเคร่งครัด แล้วตอบ "ข้อความผู้ใช้" ครั้งเดียวจบ ' +
  '(This is a pure text answer: do not run commands or touch files. ' +
  'Follow the system instructions exactly and answer once.)';

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
export const MAX_CODEX_IMAGES = 4;

function decodeImage(url: string): CodexImage | null {
  const m = DATA_URL.exec(url.trim());
  if (!m) return null;
  return { mime: m[1].toLowerCase(), data: Buffer.from(m[2], 'base64') };
}

function partsOf(content: ChatMessage['content']): {
  text: string[];
  images: CodexImage[];
} {
  const text: string[] = [];
  const images: CodexImage[] = [];
  if (typeof content === 'string') {
    text.push(content);
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') {
        text.push(part);
        continue;
      }
      if (part.type === 'text' && typeof part.text === 'string') {
        text.push(part.text);
      } else if (part.type === 'image_url') {
        const url =
          typeof part.image_url === 'string'
            ? part.image_url
            : (part.image_url?.url ?? '');
        const img = decodeImage(url);
        if (img) images.push(img);
      }
    }
  }
  return { text, images };
}

const EFFORTS = new Set(['minimal', 'low', 'medium', 'high']);

export function toCodexRequest(params: ChatParams): CodexRequest {
  const system: string[] = [];
  const user: string[] = [];
  const images: CodexImage[] = [];
  for (const msg of params.messages ?? []) {
    const { text, images: imgs } = partsOf(msg.content);
    if (msg.role === 'system' || msg.role === 'developer') {
      system.push(...text);
    } else if (msg.role === 'assistant') {
      if (text.length) user.push(`(คำตอบก่อนหน้า)\n${text.join('\n')}`);
    } else {
      user.push(...text);
      images.push(...imgs);
    }
  }
  if (images.length > MAX_CODEX_IMAGES) images.length = MAX_CODEX_IMAGES;

  const rf = params.response_format;
  const rawSchema =
    rf?.type === 'json_schema' ? rf.json_schema?.schema : undefined;
  const schema = rawSchema && typeof rawSchema === 'object' ? rawSchema : null;

  const sections = [PREAMBLE];
  if (system.length) sections.push(`### คำสั่งระบบ\n${system.join('\n\n')}`);
  if (user.length) sections.push(`### ข้อความผู้ใช้\n${user.join('\n\n')}`);
  if (images.length) {
    sections.push(`(แนบรูปมา ${images.length} รูป — ใช้รูปประกอบคำตอบ)`);
  }
  if (schema) {
    sections.push('ตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น');
  } else if (rf?.type === 'json_object') {
    sections.push('ตอบเป็น JSON object อย่างเดียว ห้ามมีข้อความอื่น');
  }

  // Thai coaching replies don't need deep thinking; keep Codex quick.
  const effort =
    params.reasoning_effort && EFFORTS.has(params.reasoning_effort)
      ? (params.reasoning_effort as CodexRequest['effort'])
      : 'low';

  return { prompt: sections.join('\n\n'), images, schema, effort };
}

/** Sums token usage from `codex exec --json` stdout (JSONL events). */
export function usageFromCodexEvents(stdout: string): CodexUsage | null {
  let input = 0;
  let output = 0;
  let found = false;
  for (const line of stdout.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      const ev = JSON.parse(s) as {
        type?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (ev.type === 'turn.completed' && ev.usage) {
        input += ev.usage.input_tokens ?? 0;
        output += ev.usage.output_tokens ?? 0;
        found = true;
      }
    } catch {
      // non-JSON log line
    }
  }
  return found ? { inputTokens: input, outputTokens: output } : null;
}

/** Strips code fences Codex sometimes wraps around JSON. */
export function cleanCodexText(text: string, expectJson: boolean): string {
  const t = text.trim();
  if (!expectJson) return t;
  return t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export function codexModelLabel(model: string | null): string {
  return `codex:${model || 'default'}`;
}

/** Shape the SDK callers read: choices[0].message.content, usage, model. */
export function toChatCompletion(
  text: string,
  model: string,
  usage: CodexUsage | null,
) {
  return {
    id: `codex-${Date.now().toString(36)}`,
    object: 'chat.completion' as const,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        finish_reason: 'stop' as const,
        logprobs: null,
        message: { role: 'assistant' as const, content: text, refusal: null },
      },
    ],
    usage: {
      prompt_tokens: usage?.inputTokens ?? 0,
      completion_tokens: usage?.outputTokens ?? 0,
      total_tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
    },
  };
}
