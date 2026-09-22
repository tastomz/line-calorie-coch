import { Injectable } from '@nestjs/common';
import { BodyScan, HealthDataSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type BodyScanDraft = {
  measuredAt?: string;
  reportVendor?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  bodyFatMassKg?: number | null;
  skeletalMuscleMassKg?: number | null;
  leanBodyMassKg?: number | null;
  visceralFatMassKg?: number | null;
  visceralFatAreaCm2?: number | null;
  totalBodyWaterKg?: number | null;
  waistCm?: number | null;
  waistToHipRatio?: number | null;
  bmrKcal?: number | null;
  teeKcal?: number | null;
  proteinMassKg?: number | null;
  mineralMassKg?: number | null;
  intracellularFluidKg?: number | null;
  extracellularFluidKg?: number | null;
  reportedCaloriesMin?: number | null;
  reportedCaloriesMax?: number | null;
  reportedProteinMinG?: number | null;
  reportedProteinMaxG?: number | null;
  reportedCarbsMinG?: number | null;
  reportedCarbsMaxG?: number | null;
  reportedFatMinG?: number | null;
  reportedFatMaxG?: number | null;
  reportReference?: string | null;
  notes?: string | null;
};

export type BodyProgressDelta = {
  field: string;
  labelTh: string;
  from: number | null;
  to: number | null;
  delta: number | null;
  unit: string;
};

const PENDING_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class BodyScanService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertPending(userId: string, draft: BodyScanDraft, imageUrl?: string) {
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
    return this.prisma.pendingBodyScan.upsert({
      where: { userId },
      create: {
        userId,
        payloadJson: JSON.stringify(draft),
        imageUrl,
        expiresAt,
      },
      update: {
        payloadJson: JSON.stringify(draft),
        imageUrl,
        expiresAt,
      },
    });
  }

  async getPending(userId: string) {
    const row = await this.prisma.pendingBodyScan.findUnique({
      where: { userId },
    });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.pendingBodyScan
        .delete({ where: { userId } })
        .catch(() => undefined);
      return null;
    }
    return {
      ...row,
      draft: JSON.parse(row.payloadJson) as BodyScanDraft,
    };
  }

  async clearPending(userId: string) {
    await this.prisma.pendingBodyScan.deleteMany({ where: { userId } });
  }

  async confirmPending(userId: string): Promise<BodyScan | null> {
    const pending = await this.getPending(userId);
    if (!pending) return null;
    const draft = pending.draft;
    const measuredAt = draft.measuredAt
      ? new Date(draft.measuredAt)
      : new Date();
    const created = await this.prisma.bodyScan.create({
      data: {
        userId,
        measuredAt,
        source: HealthDataSource.BODY_SCAN,
        reportVendor: draft.reportVendor ?? null,
        heightCm: draft.heightCm ?? null,
        weightKg: draft.weightKg ?? null,
        bodyFatPercent: draft.bodyFatPercent ?? null,
        bodyFatMassKg: draft.bodyFatMassKg ?? null,
        skeletalMuscleMassKg: draft.skeletalMuscleMassKg ?? null,
        leanBodyMassKg: draft.leanBodyMassKg ?? null,
        visceralFatMassKg: draft.visceralFatMassKg ?? null,
        visceralFatAreaCm2: draft.visceralFatAreaCm2 ?? null,
        totalBodyWaterKg: draft.totalBodyWaterKg ?? null,
        waistCm: draft.waistCm ?? null,
        waistToHipRatio: draft.waistToHipRatio ?? null,
        bmrKcal: draft.bmrKcal ?? null,
        teeKcal: draft.teeKcal ?? null,
        proteinMassKg: draft.proteinMassKg ?? null,
        mineralMassKg: draft.mineralMassKg ?? null,
        intracellularFluidKg: draft.intracellularFluidKg ?? null,
        extracellularFluidKg: draft.extracellularFluidKg ?? null,
        reportedCaloriesMin: draft.reportedCaloriesMin ?? null,
        reportedCaloriesMax: draft.reportedCaloriesMax ?? null,
        reportedProteinMinG: draft.reportedProteinMinG ?? null,
        reportedProteinMaxG: draft.reportedProteinMaxG ?? null,
        reportedCarbsMinG: draft.reportedCarbsMinG ?? null,
        reportedCarbsMaxG: draft.reportedCarbsMaxG ?? null,
        reportedFatMinG: draft.reportedFatMinG ?? null,
        reportedFatMaxG: draft.reportedFatMaxG ?? null,
        reportReference: draft.reportReference ?? null,
        notes: draft.notes ?? null,
      },
    });
    if (created.weightKg != null) {
      await this.prisma.weightLog.create({
        data: {
          userId,
          weightKg: created.weightKg,
          recordedAt: created.measuredAt,
          source: HealthDataSource.BODY_SCAN,
          bodyScanId: created.id,
        },
      });
    }
    await this.clearPending(userId);
    return created;
  }

  async listForUser(userId: string, take = 10): Promise<BodyScan[]> {
    return this.prisma.bodyScan.findMany({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
      take,
    });
  }

  async latestTwo(userId: string): Promise<BodyScan[]> {
    return this.listForUser(userId, 2);
  }

  /** Deterministic progress between two scans (newer vs older). */
  compareProgress(newer: BodyScan, older: BodyScan): BodyProgressDelta[] {
    const fields: Array<{
      key: keyof BodyScan;
      labelTh: string;
      unit: string;
    }> = [
      { key: 'weightKg', labelTh: 'น้ำหนัก', unit: 'kg' },
      { key: 'bodyFatPercent', labelTh: 'Body Fat', unit: '%' },
      { key: 'bodyFatMassKg', labelTh: 'ไขมัน (มวล)', unit: 'kg' },
      { key: 'skeletalMuscleMassKg', labelTh: 'กล้ามเนื้อ', unit: 'kg' },
      { key: 'leanBodyMassKg', labelTh: 'Lean Mass', unit: 'kg' },
      { key: 'visceralFatAreaCm2', labelTh: 'Visceral Fat Area', unit: 'cm²' },
      { key: 'waistCm', labelTh: 'รอบเอว', unit: 'cm' },
      { key: 'waistToHipRatio', labelTh: 'WHR', unit: '' },
    ];
    return fields.map((f) => {
      const from = older[f.key];
      const to = newer[f.key];
      const fromN = typeof from === 'number' ? from : null;
      const toN = typeof to === 'number' ? to : null;
      const delta =
        fromN != null && toN != null
          ? Math.round((toN - fromN) * 100) / 100
          : null;
      return {
        field: String(f.key),
        labelTh: f.labelTh,
        from: fromN,
        to: toN,
        delta,
        unit: f.unit,
      };
    });
  }
}
