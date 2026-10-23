import { chmod, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import {
  cleanCodexText,
  toCodexRequest,
  usageFromCodexEvents,
} from './codex-chat';
import {
  describeAuthJson,
  parseVaultKey,
  seal,
  unseal,
  validateAuthJson,
} from './codex-vault';
import { buildCodexArgs, runCodexExec } from './codex-runner';

const AUTH = JSON.stringify({
  tokens: {
    access_token: 'a',
    refresh_token: 'r',
    account_id: 'acct_123456789',
  },
  last_refresh: '2026-10-23T00:00:00Z',
});

describe('toCodexRequest', () => {
  it('merges system + user text, extracts data-URL images and the schema', () => {
    const png = Buffer.from('fake-image').toString('base64');
    const req = toCodexRequest({
      model: 'gpt-6.1-sol',
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: 'You estimate calories.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'ข้าวผัด' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${png}` },
            },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/x.jpg' },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'food', schema: { type: 'object' } },
      },
    });
    expect(req.prompt).toContain('You estimate calories.');
    expect(req.prompt).toContain('ข้าวผัด');
    expect(req.prompt.indexOf('You estimate')).toBeLessThan(
      req.prompt.indexOf('ข้าวผัด'),
    );
    expect(req.images).toHaveLength(1); // remote URLs are not fetched
    expect(req.images[0].mime).toBe('image/png');
    expect(req.images[0].data.toString()).toBe('fake-image');
    expect(req.schema).toEqual({ type: 'object' });
    expect(req.effort).toBe('low');
  });

  it("maps unsupported efforts (e.g. 'none') to low and has no schema for plain text", () => {
    const req = toCodexRequest({
      reasoning_effort: 'none',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(req.effort).toBe('low');
    expect(req.schema).toBeNull();
  });
});

describe('codex output helpers', () => {
  it('sums usage from turn.completed events and ignores log lines', () => {
    const out = [
      '{"type":"thread.started"}',
      'WARNING: something',
      '{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":800,"output_tokens":90}}',
    ].join('\n');
    expect(usageFromCodexEvents(out)).toEqual({
      inputTokens: 1200,
      outputTokens: 90,
    });
    expect(usageFromCodexEvents('{"type":"turn.started"}')).toBeNull();
  });

  it('strips code fences only for JSON answers', () => {
    expect(cleanCodexText('```json\n{"a":1}\n```', true)).toBe('{"a":1}');
    expect(cleanCodexText(' สวัสดี ', false)).toBe('สวัสดี');
  });
});

describe('codex vault', () => {
  const key = randomBytes(32);

  it('round-trips and detects tampering', () => {
    const sealed = seal(key, AUTH);
    expect(sealed.ciphertext).not.toContain('refresh');
    expect(unseal(key, sealed)).toBe(AUTH);
    expect(() => unseal(randomBytes(32), sealed)).toThrow();
  });

  it('parses hex and base64 keys, rejects wrong sizes', () => {
    expect(parseVaultKey(key.toString('hex'))).toEqual(key);
    expect(parseVaultKey(key.toString('base64'))).toEqual(key);
    expect(() => parseVaultKey('')).toThrow('not set');
    expect(() => parseVaultKey('abcd')).toThrow('32 bytes');
  });

  it('accepts only ChatGPT sign-in auth.json', () => {
    expect(validateAuthJson(AUTH)).toBe(AUTH);
    expect(() => validateAuthJson('{"OPENAI_API_KEY":"sk-x"}')).toThrow(
      'tokens',
    );
    expect(() => validateAuthJson('nope')).toThrow('JSON');
    expect(describeAuthJson(AUTH)).toEqual({
      accountId: 'acct_1…',
      lastRefresh: '2026-10-23T00:00:00Z',
    });
  });
});

describe('runCodexExec (fake codex binary)', () => {
  let dir: string;
  let bin: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'codex-test-'));
    bin = join(dir, 'fake-codex');
    // Writes the answer to -o, echoes a usage event, and "rotates" auth.json.
    await writeFile(
      bin,
      `#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift;; esac
  shift
done
prompt=$(cat)
case "$prompt" in *FAIL*) echo '{"type":"error","message":"boom"}'; exit 3;; esac
printf '%s' '{"kcal":500}' > "$out"
printf '%s' '{"tokens":{"access_token":"a2","refresh_token":"r2"}}' > "$CODEX_HOME/auth.json"
echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}'
`,
    );
    await chmod(bin, 0o755);
  });

  it('returns the answer + usage and reports rotated tokens', async () => {
    const rotated: string[] = [];
    const r = await runCodexExec({
      bin,
      authJson: AUTH,
      model: 'gpt-x',
      request: toCodexRequest({ messages: [{ role: 'user', content: 'hi' }] }),
      timeoutMs: 10_000,
      runDir: dir,
      onAuthUpdated: (a) => {
        rotated.push(a);
        return Promise.resolve();
      },
    });
    expect(r.text).toBe('{"kcal":500}');
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(rotated).toHaveLength(1);
    expect(rotated[0]).toContain('r2');
  });

  it('surfaces the last error event on failure', async () => {
    await expect(
      runCodexExec({
        bin,
        authJson: AUTH,
        model: null,
        request: toCodexRequest({
          messages: [{ role: 'user', content: 'FAIL' }],
        }),
        timeoutMs: 10_000,
        runDir: dir,
      }),
    ).rejects.toThrow('boom');
  });

  it('builds hardened args', () => {
    const args = buildCodexArgs({
      workdir: '/w',
      outFile: '/o',
      model: 'm',
      effort: 'low',
      imagePaths: ['/w/p.jpg'],
      schemaPath: '/s.json',
    });
    expect(args).toEqual(
      expect.arrayContaining([
        'exec',
        '--json',
        '--sandbox',
        'read-only',
        '--ephemeral',
        '--ignore-user-config',
      ]),
    );
    expect(args.join(' ')).toContain('-i /w/p.jpg');
    expect(args.join(' ')).toContain('--output-schema /s.json');
    expect(args[args.length - 1]).toBe('-');
  });
});
