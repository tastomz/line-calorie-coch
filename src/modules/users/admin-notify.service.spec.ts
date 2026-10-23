import { AdminNotifyService, PAIR_CODE_PATTERN } from './admin-notify.service';

describe('AdminNotifyService pairing', () => {
  const update = jest.fn().mockResolvedValue({});
  const service = new AdminNotifyService({ user: { update } } as never);
  beforeEach(() => update.mockClear());

  it('creates ADMIN-XXXXXX codes valid for 10 minutes', () => {
    const { code, expiresAt } = service.createPairCode(1_000);
    expect(code).toMatch(PAIR_CODE_PATTERN);
    expect(expiresAt.getTime()).toBe(1_000 + 10 * 60 * 1000);
  });

  it('redeems a code once (case-insensitive) and flags the user', async () => {
    const { code } = service.createPairCode();
    await expect(
      service.redeemPairCode('user-1', ` ${code.toLowerCase()} `),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { adminNotify: true },
    });
    await expect(service.redeemPairCode('user-2', code)).resolves.toBe(false);
  });

  it('rejects expired or unknown codes', async () => {
    const { code } = service.createPairCode(0);
    await expect(
      service.redeemPairCode('user-1', code, 10 * 60 * 1000 + 1),
    ).resolves.toBe(false);
    await expect(
      service.redeemPairCode('user-1', 'ADMIN-ZZZZZZ'),
    ).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
