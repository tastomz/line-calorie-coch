import { gpt6PlusOr, isGpt6Plus } from './ai-models';

describe('GPT-6+ only', () => {
  it.each(['gpt-6', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-7', 'gpt-10-mini'])(
    'accepts %s',
    (m) => expect(isGpt6Plus(m)).toBe(true),
  );
  it.each([
    'gpt-4o',
    'gpt-5',
    'gpt-5.2',
    'o4-mini',
    'gpt-60x',
    '',
    'gpt-6 sol',
  ])('rejects %s', (m) => expect(isGpt6Plus(m)).toBe(false));
  it('falls back for old models', () => {
    expect(gpt6PlusOr('gpt-4o', 'gpt-6.1-sol')).toBe('gpt-6.1-sol');
    expect(gpt6PlusOr(' gpt-6-luna ', 'x')).toBe('gpt-6-luna');
    expect(gpt6PlusOr(undefined, 'gpt-6.1-sol')).toBe('gpt-6.1-sol');
  });
});
