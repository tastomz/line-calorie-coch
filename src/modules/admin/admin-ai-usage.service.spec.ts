import { AdminAiUsageService } from './admin-ai-usage.service';

describe('AdminAiUsageService aggregation', () => {
  function build(rows: {
    groupBy: jest.Mock;
    aggregate: jest.Mock;
    findMany: jest.Mock;
  }) {
    const prisma = {
      aiCallLog: {
        aggregate: rows.aggregate,
        groupBy: rows.groupBy,
        findMany: rows.findMany,
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const entitlement = {
      usageDateKey: () => '2026-09-22',
      getCurrentPlan: jest.fn().mockResolvedValue('FREE'),
    };
    const config = { get: () => '35' };
    return new AdminAiUsageService(
      prisma as never,
      entitlement as never,
      config as never,
    );
  }

  it('summarizes requests and known-model cost', async () => {
    const service = build({
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 2 },
        _sum: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
      }),
      findMany: jest.fn().mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]),
      groupBy: jest.fn().mockResolvedValue([
        {
          model: 'gpt-4o-mini',
          _count: { _all: 2 },
          _sum: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
        },
      ]),
    });

    const summary = await service.summary('2026-09-22', '2026-09-22');
    expect(summary.requests).toBe(2);
    expect(summary.activeUsers).toBe(2);
    expect(summary.inputTokens).toBe(1000);
    expect(summary.estimatedCost.available).toBe(true);
    if (summary.estimatedCost.available) {
      expect(summary.estimatedCost.totalCostThb).toBeGreaterThan(0);
    }
  });

  it('marks cost unavailable for unknown models', async () => {
    const service = build({
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 1 },
        _sum: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      findMany: jest.fn().mockResolvedValue([{ userId: 'a' }]),
      groupBy: jest.fn().mockResolvedValue([
        {
          model: 'weird-model',
          _count: { _all: 1 },
          _sum: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      ]),
    });
    const summary = await service.summary('2026-09-22', '2026-09-22');
    expect(summary.estimatedCost.available).toBe(false);
    if (!summary.estimatedCost.available) {
      expect(summary.estimatedCost.message).toContain('ราคา');
    }
  });

  it('aggregates by feature', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([
        {
          operation: 'FOOD_TEXT',
          _count: { _all: 3 },
          _sum: { inputTokens: 30, outputTokens: 9, totalTokens: 39 },
        },
      ])
      .mockResolvedValueOnce([
        {
          operation: 'FOOD_TEXT',
          model: 'gpt-4o-mini',
          _count: { _all: 3 },
          _sum: { inputTokens: 30, outputTokens: 9, totalTokens: 39 },
        },
      ]);
    const service = build({
      aggregate: jest.fn(),
      findMany: jest.fn(),
      groupBy,
    });
    const rows = await service.byFeature('2026-09-01', '2026-09-22');
    expect(rows[0].feature).toBe('FOOD_TEXT');
    expect(rows[0].requests).toBe(3);
    expect(rows[0].costKnown).toBe(true);
  });
});
