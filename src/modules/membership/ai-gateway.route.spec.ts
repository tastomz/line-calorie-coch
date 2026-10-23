import { currentAiRoute } from '../../common/ai-route';
import { setCodexBackend } from '../../common/codex-bridge';
import { AiGatewayService } from './ai-gateway.service';
import { AiUsageService } from './ai-usage.service';
import { SubscriptionEntitlementService } from './subscription-entitlement.service';

describe('AiGatewayService Trial routing', () => {
  const aiUsage = {
    consumeAiUsage: jest.fn().mockResolvedValue(undefined),
    recordTokenUsage: jest.fn().mockResolvedValue(undefined),
  };
  const ent = { getEntitlement: jest.fn() };
  const gateway = new AiGatewayService(
    aiUsage as unknown as AiUsageService,
    ent as unknown as SubscriptionEntitlementService,
  );
  let codexUp = true;

  beforeEach(() => {
    codexUp = true;
    setCodexBackend({
      available: () => codexUp,
      chat: () => Promise.reject(new Error('unused')),
    });
  });
  afterAll(() => setCodexBackend(null));

  const routeInside = () =>
    gateway.run('u1', 'COACH', () => Promise.resolve(currentAiRoute()));

  it('routes Trial (PRO + TRIALING) to Codex', async () => {
    ent.getEntitlement.mockResolvedValue({
      hasProAccess: true,
      status: 'TRIALING',
    });
    await expect(routeInside()).resolves.toBe('codex');
  });

  it('keeps paid Pro and Free on the API', async () => {
    ent.getEntitlement.mockResolvedValue({
      hasProAccess: true,
      status: 'ACTIVE',
    });
    await expect(routeInside()).resolves.toBe('api');
    ent.getEntitlement.mockResolvedValue({
      hasProAccess: false,
      status: 'NONE',
    });
    await expect(routeInside()).resolves.toBe('api');
  });

  it('uses the API when Codex is not signed in, without a DB lookup', async () => {
    codexUp = false;
    ent.getEntitlement.mockClear();
    await expect(routeInside()).resolves.toBe('api');
    expect(ent.getEntitlement).not.toHaveBeenCalled();
  });
});
