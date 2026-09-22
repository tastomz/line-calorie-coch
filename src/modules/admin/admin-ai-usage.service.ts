import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_USD_THB_RATE,
  estimateTokenCost,
  OPENAI_MODEL_PRICING_USD,
} from '../membership/openai-pricing';
import { AiOperation } from '../membership/plan.config';
import { SubscriptionEntitlementService } from '../membership/subscription-entitlement.service';

export type AiUsageRange = 'today' | '7d' | '30d' | 'custom';

@Injectable()
export class AdminAiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: SubscriptionEntitlementService,
    private readonly config: ConfigService,
  ) {}

  usdThbRate(): number {
    const raw = (this.config.get<string>('OPENAI_USD_THB_RATE') ?? '').trim();
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
    return DEFAULT_USD_THB_RATE;
  }

  resolveDateRange(
    range: AiUsageRange,
    from?: string,
    to?: string,
    now = new Date(),
  ): { fromDate: string; toDate: string } {
    const today = this.entitlement.usageDateKey(now);
    if (range === 'custom' && from && to) {
      return { fromDate: from, toDate: to };
    }
    if (range === 'today') {
      return { fromDate: today, toDate: today };
    }
    const days = range === '7d' ? 6 : 29;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      fromDate: this.entitlement.usageDateKey(start),
      toDate: today,
    };
  }

  private dateFilter(fromDate: string, toDate: string) {
    return { usageDate: { gte: fromDate, lte: toDate } };
  }

  private costFor(model: string, input: number, output: number) {
    return estimateTokenCost(model, input, output, this.usdThbRate());
  }

  private roundMoney(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  async summary(fromDate: string, toDate: string) {
    const where = this.dateFilter(fromDate, toDate);
    const [agg, activeUsers, byModel] = await Promise.all([
      this.prisma.aiCallLog.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
      }),
      this.prisma.aiCallLog.findMany({
        where,
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.aiCallLog.groupBy({
        by: ['model'],
        where,
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
        },
      }),
    ]);

    let inputCostThb = 0;
    let outputCostThb = 0;
    let totalCostThb = 0;
    let totalCostUsd = 0;
    let unknownRequests = 0;
    let unknownTokens = 0;
    let allKnown = true;

    for (const row of byModel) {
      const input = row._sum.inputTokens ?? 0;
      const output = row._sum.outputTokens ?? 0;
      const est = this.costFor(row.model, input, output);
      if (!est.known) {
        allKnown = false;
        unknownRequests += row._count._all;
        unknownTokens += row._sum.totalTokens ?? 0;
      } else {
        inputCostThb += est.inputCostThb;
        outputCostThb += est.outputCostThb;
        totalCostThb += est.totalCostThb;
        totalCostUsd += est.totalCostUsd;
      }
    }

    const requests = agg._count._all;
    const estimatedCost =
      requests === 0
        ? {
            available: false as const,
            message: 'ยังไม่มีข้อมูลการใช้งาน AI ในช่วงนี้',
          }
        : allKnown
          ? {
              available: true as const,
              currency: 'THB' as const,
              note: 'ประมาณการจากราคาโมเดล (USD→THB) — ไม่ใช่ใบแจ้งหนี้ OpenAI',
              usdThbRate: this.usdThbRate(),
              inputCostThb: this.roundMoney(inputCostThb),
              outputCostThb: this.roundMoney(outputCostThb),
              totalCostThb: this.roundMoney(totalCostThb),
              totalCostUsd: this.roundMoney(totalCostUsd),
            }
          : {
              available: false as const,
              message: 'ยังไม่มีข้อมูลราคาสำหรับคำนวณครบถ้วน',
              unknownRequests,
              unknownTokens,
              partialCostThb: this.roundMoney(totalCostThb),
              usdThbRate: this.usdThbRate(),
            };

    return {
      fromDate,
      toDate,
      activeUsers: activeUsers.length,
      requests,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      totalTokens: agg._sum.totalTokens ?? 0,
      estimatedCost,
      pricedModels: Object.keys(OPENAI_MODEL_PRICING_USD),
    };
  }

  async byFeature(fromDate: string, toDate: string) {
    const rows = await this.prisma.aiCallLog.groupBy({
      by: ['operation'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    });

    const byOpModel = await this.prisma.aiCallLog.groupBy({
      by: ['operation', 'model'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    });

    const costByOp = new Map<
      string,
      { thb: number; known: boolean; unknownRequests: number }
    >();
    for (const row of byOpModel) {
      const est = this.costFor(
        row.model,
        row._sum.inputTokens ?? 0,
        row._sum.outputTokens ?? 0,
      );
      const cur = costByOp.get(row.operation) ?? {
        thb: 0,
        known: true,
        unknownRequests: 0,
      };
      if (!est.known) {
        cur.known = false;
        cur.unknownRequests += row._count._all;
      } else {
        cur.thb += est.totalCostThb;
      }
      costByOp.set(row.operation, cur);
    }

    return rows
      .map((r) => {
        const cost = costByOp.get(r.operation) ?? {
          thb: 0,
          known: true,
          unknownRequests: 0,
        };
        return {
          feature: r.operation as AiOperation,
          requests: r._count._all,
          inputTokens: r._sum.inputTokens ?? 0,
          outputTokens: r._sum.outputTokens ?? 0,
          totalTokens: r._sum.totalTokens ?? 0,
          estimatedCostThb: cost.known ? this.roundMoney(cost.thb) : null,
          costKnown: cost.known,
          unknownRequests: cost.unknownRequests,
        };
      })
      .sort((a, b) => b.requests - a.requests);
  }

  async byDay(fromDate: string, toDate: string) {
    const rows = await this.prisma.aiCallLog.groupBy({
      by: ['usageDate'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
      orderBy: { usageDate: 'asc' },
    });

    const byDayModel = await this.prisma.aiCallLog.groupBy({
      by: ['usageDate', 'model'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    });

    const costByDay = new Map<string, { thb: number; known: boolean }>();
    for (const row of byDayModel) {
      const est = this.costFor(
        row.model,
        row._sum.inputTokens ?? 0,
        row._sum.outputTokens ?? 0,
      );
      const cur = costByDay.get(row.usageDate) ?? { thb: 0, known: true };
      if (!est.known) cur.known = false;
      else cur.thb += est.totalCostThb;
      costByDay.set(row.usageDate, cur);
    }

    return rows.map((r) => {
      const cost = costByDay.get(r.usageDate) ?? { thb: 0, known: true };
      return {
        date: r.usageDate,
        requests: r._count._all,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        totalTokens: r._sum.totalTokens ?? 0,
        estimatedCostThb: cost.known ? this.roundMoney(cost.thb) : null,
        costKnown: cost.known,
      };
    });
  }

  async byModel(fromDate: string, toDate: string) {
    const rows = await this.prisma.aiCallLog.groupBy({
      by: ['model'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    });

    return rows
      .map((r) => {
        const input = r._sum.inputTokens ?? 0;
        const output = r._sum.outputTokens ?? 0;
        const est = this.costFor(r.model, input, output);
        return {
          model: r.model,
          requests: r._count._all,
          inputTokens: input,
          outputTokens: output,
          totalTokens: r._sum.totalTokens ?? 0,
          estimatedCostThb: est.known
            ? this.roundMoney(est.totalCostThb)
            : null,
          costKnown: est.known,
          priced: !!OPENAI_MODEL_PRICING_USD[r.model],
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /** Membership uses **current** entitlement — not historical plan at call time. */
  async byMembership(fromDate: string, toDate: string) {
    const byUser = await this.prisma.aiCallLog.groupBy({
      by: ['userId'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
    });

    const buckets: Record<
      'FREE' | 'PRO',
      {
        users: number;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostThb: number;
        costFullyKnown: boolean;
      }
    > = {
      FREE: {
        users: 0,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostThb: 0,
        costFullyKnown: true,
      },
      PRO: {
        users: 0,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostThb: 0,
        costFullyKnown: true,
      },
    };

    for (const row of byUser) {
      const plan = await this.entitlement.getCurrentPlan(row.userId);
      const b = buckets[plan];
      b.users += 1;
      b.requests += row._count._all;
      b.inputTokens += row._sum.inputTokens ?? 0;
      b.outputTokens += row._sum.outputTokens ?? 0;
      b.totalTokens += row._sum.totalTokens ?? 0;
    }

    const byUserModel = await this.prisma.aiCallLog.groupBy({
      by: ['userId', 'model'],
      where: this.dateFilter(fromDate, toDate),
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
      _count: { _all: true },
    });

    for (const row of byUserModel) {
      const plan = await this.entitlement.getCurrentPlan(row.userId);
      const est = this.costFor(
        row.model,
        row._sum.inputTokens ?? 0,
        row._sum.outputTokens ?? 0,
      );
      if (!est.known) buckets[plan].costFullyKnown = false;
      else buckets[plan].estimatedCostThb += est.totalCostThb;
    }

    return {
      note: 'Membership ใช้สถานะปัจจุบันของ user ไม่ใช่ historical ณ เวลาเรียก AI',
      FREE: {
        ...buckets.FREE,
        estimatedCostThb: buckets.FREE.costFullyKnown
          ? this.roundMoney(buckets.FREE.estimatedCostThb)
          : null,
      },
      PRO: {
        ...buckets.PRO,
        estimatedCostThb: buckets.PRO.costFullyKnown
          ? this.roundMoney(buckets.PRO.estimatedCostThb)
          : null,
      },
    };
  }

  async byUser(fromDate: string, toDate: string, limit = 50) {
    const rows = await this.prisma.aiCallLog.groupBy({
      by: ['userId'],
      where: this.dateFilter(fromDate, toDate),
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
      },
      orderBy: { _sum: { totalTokens: 'desc' } },
      take: Math.min(Math.max(limit, 1), 200),
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, displayName: true, lineUserId: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = [];
    for (const row of rows) {
      const plan = await this.entitlement.getCurrentPlan(row.userId);
      const u = userMap.get(row.userId);
      result.push({
        userId: row.userId,
        displayName: u?.displayName ?? null,
        lineUserId: u?.lineUserId ?? null,
        membership: plan,
        requests: row._count._all,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
      });
    }
    return result;
  }
}
