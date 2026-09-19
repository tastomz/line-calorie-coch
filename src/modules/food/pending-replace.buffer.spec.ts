import { pendingReplaceBuffer } from './pending-replace.buffer';

describe('pendingReplaceBuffer', () => {
  beforeEach(() => {
    pendingReplaceBuffer.reset();
  });

  it('stores and takes buffered food input', () => {
    pendingReplaceBuffer.set('u1', { kind: 'text', text: 'ข้าว' });
    expect(pendingReplaceBuffer.get('u1')).toEqual({
      kind: 'text',
      text: 'ข้าว',
    });
    expect(pendingReplaceBuffer.take('u1')).toEqual({
      kind: 'text',
      text: 'ข้าว',
    });
    expect(pendingReplaceBuffer.get('u1')).toBeNull();
  });

  it('clears without taking', () => {
    pendingReplaceBuffer.set('u1', { kind: 'image', messageId: 'm1' });
    pendingReplaceBuffer.clear('u1');
    expect(pendingReplaceBuffer.get('u1')).toBeNull();
  });
});
