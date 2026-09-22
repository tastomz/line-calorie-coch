import { ForbiddenException } from '@nestjs/common';
import { DevToolsGuard } from './dev-tools.guard';

describe('DevToolsGuard', () => {
  it('allows when development + flag true', () => {
    const guard = new DevToolsGuard({
      get: (k: string) =>
        ({ NODE_ENV: 'development', ENABLE_DEV_MEMBERSHIP_TOOLS: 'true' })[k],
    } as never);
    expect(guard.canActivate()).toBe(true);
  });

  it('rejects production even if flag true', () => {
    const guard = new DevToolsGuard({
      get: (k: string) =>
        ({ NODE_ENV: 'production', ENABLE_DEV_MEMBERSHIP_TOOLS: 'true' })[k],
    } as never);
    expect(() => guard.canActivate()).toThrow(ForbiddenException);
  });

  it('rejects when flag false', () => {
    const guard = new DevToolsGuard({
      get: (k: string) =>
        ({ NODE_ENV: 'development', ENABLE_DEV_MEMBERSHIP_TOOLS: 'false' })[k],
    } as never);
    expect(() => guard.canActivate()).toThrow(ForbiddenException);
  });
});
