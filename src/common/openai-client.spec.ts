import OpenAI from 'openai';
import { runWithAiRoute } from './ai-route';
import { CodexBackend, setCodexBackend } from './codex-bridge';
import { CodexRouteError, createOpenAiClient } from './openai-client';
import { fastModel, smartModel } from './ai-models';

type Create = (
  p: unknown,
) => Promise<{ model: string; choices: { message: { content: string } }[] }>;

function clientWithFakeApi() {
  const apiCalls: unknown[] = [];
  // The shim binds the SDK's create at construction — stub it first.
  jest.spyOn(OpenAI.Chat.Completions.prototype, 'create').mockImplementation(((
    p: unknown,
  ) => {
    apiCalls.push(p);
    return Promise.resolve({
      model: 'api-model',
      choices: [{ message: { content: 'from api' } }],
    });
  }) as never);
  const client = createOpenAiClient('sk-test');
  return {
    create: ((p: unknown) =>
      client.chat.completions.create(p as never)) as unknown as Create,
    apiCalls,
  };
}

describe('createOpenAiClient routing', () => {
  const state = { calls: 0, fail: false, up: true };
  const backend: CodexBackend = {
    routesTrial: () => true,
    available: () => state.up,
    chat: () => {
      state.calls += 1;
      if (state.fail) return Promise.reject(new Error('codex down'));
      return Promise.resolve({
        text: 'from codex',
        model: 'codex:default',
        inputTokens: 3,
        outputTokens: 2,
      });
    },
  };

  beforeEach(() => {
    state.calls = 0;
    state.fail = false;
    state.up = true;
    setCodexBackend(backend);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => setCodexBackend(null));

  const smart = () => ({
    model: smartModel(),
    messages: [{ role: 'user', content: 'x' }],
  });

  it('uses Codex for smart-model calls on the codex route', async () => {
    const { create, apiCalls } = clientWithFakeApi();
    const r = await runWithAiRoute('codex', () => create(smart()));
    expect(r.choices[0].message.content).toBe('from codex');
    expect(r.model).toBe('codex:default');
    expect(apiCalls).toHaveLength(0);
  });

  it('keeps the API on the default route', async () => {
    const { create, apiCalls } = clientWithFakeApi();
    const r = await create(smart());
    expect(r.choices[0].message.content).toBe('from api');
    expect(state.calls).toBe(0);
    expect(apiCalls).toHaveLength(1);
  });

  it('sends fast-model calls (classifier, photo type) to Codex for Trial', async () => {
    const { create, apiCalls } = clientWithFakeApi();
    const r = await runWithAiRoute('codex', () =>
      create({ model: fastModel(), messages: [] }),
    );
    expect(r.choices[0].message.content).toBe('from codex');
    expect(apiCalls).toHaveLength(0);
  });

  it('never falls back to the API for Trial', async () => {
    const { create, apiCalls } = clientWithFakeApi();
    state.fail = true;
    await expect(
      runWithAiRoute('codex', () => create(smart())),
    ).rejects.toThrow('codex down');
    state.fail = false;
    state.up = false;
    await expect(
      runWithAiRoute('codex', () => create(smart())),
    ).rejects.toThrow(CodexRouteError);
    expect(apiCalls).toHaveLength(0);
  });
});
