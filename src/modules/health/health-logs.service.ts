import { Injectable } from '@nestjs/common';
import { ExerciseType, HealthDataSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { dayBounds, getZonedDateParts } from '../food/day-bounds';
import { dateKeyFromParts, todayDateKey } from './program-week';

@Injectable()
export class SleepLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    userId: string;
    bedtime: Date;
    wakeTime: Date;
    sleepScore?: number;
    notes?: string;
  }) {
    if (params.wakeTime.getTime() <= params.bedtime.getTime()) {
      throw new Error('wakeTime must be after bedtime');
    }
    const durationMinutes = Math.round(
      (params.wakeTime.getTime() - params.bedtime.getTime()) / 60_000,
    );
    const sleepDate = dateKeyFromParts(getZonedDateParts(params.bedtime));
    return this.prisma.sleepLog.create({
      data: {
        userId: params.userId,
        sleepDate,
        bedtime: params.bedtime,
        wakeTime: params.wakeTime,
        durationMinutes,
        sleepScore: params.sleepScore ?? null,
        notes: params.notes ?? null,
        source: HealthDataSource.MANUAL,
      },
    });
  }

  async latest(userId: string) {
    return this.prisma.sleepLog.findFirst({
      where: { userId },
      orderBy: { bedtime: 'desc' },
    });
  }

  async averageDurationMinutes(
    userId: string,
    days = 7,
  ): Promise<number | null> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.sleepLog.findMany({
      where: { userId, bedtime: { gte: since } },
      select: { durationMinutes: true },
    });
    if (rows.length === 0) return null;
    const sum = rows.reduce((s, r) => s + r.durationMinutes, 0);
    return Math.round(sum / rows.length);
  }
}

@Injectable()
export class ExerciseLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    userId: string;
    type: ExerciseType;
    durationMinutes: number;
    workoutName?: string;
    notes?: string;
  }) {
    if (params.durationMinutes <= 0 || params.durationMinutes > 24 * 60) {
      throw new Error('invalid duration');
    }
    return this.prisma.exerciseLog.create({
      data: {
        userId: params.userId,
        performedAt: new Date(),
        type: params.type,
        durationMinutes: params.durationMinutes,
        workoutName: params.workoutName ?? null,
        notes: params.notes ?? null,
        source: HealthDataSource.MANUAL,
      },
    });
  }

  async todayTotalMinutes(userId: string): Promise<number> {
    const { start, end } = dayBounds();
    const rows = await this.prisma.exerciseLog.findMany({
      where: { userId, performedAt: { gte: start, lt: end } },
      select: { durationMinutes: true },
    });
    return rows.reduce((s, r) => s + r.durationMinutes, 0);
  }

  async countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.exerciseLog.count({
      where: { userId, performedAt: { gte: since } },
    });
  }
}

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async setSteps(userId: string, steps: number, date = todayDateKey()) {
    if (!Number.isInteger(steps) || steps < 0 || steps > 200_000) {
      throw new Error('invalid steps');
    }
    return this.prisma.activityDailyLog.upsert({
      where: { userId_activityDate: { userId, activityDate: date } },
      create: {
        userId,
        activityDate: date,
        steps,
        source: HealthDataSource.MANUAL,
      },
      update: { steps, source: HealthDataSource.MANUAL },
    });
  }

  async getToday(userId: string) {
    return this.prisma.activityDailyLog.findUnique({
      where: {
        userId_activityDate: { userId, activityDate: todayDateKey() },
      },
    });
  }
}

@Injectable()
export class HydrationLogService {
  constructor(private readonly prisma: PrismaService) {}

  readonly defaultTargetMl = 2500;

  async add(userId: string, amountMl: number) {
    if (!Number.isInteger(amountMl) || amountMl <= 0 || amountMl > 5000) {
      throw new Error('invalid amount');
    }
    return this.prisma.hydrationLog.create({
      data: {
        userId,
        recordedAt: new Date(),
        amountMl,
        source: HealthDataSource.MANUAL,
      },
    });
  }

  async todayTotalMl(userId: string): Promise<number> {
    const { start, end } = dayBounds();
    const rows = await this.prisma.hydrationLog.findMany({
      where: { userId, recordedAt: { gte: start, lt: end } },
      select: { amountMl: true },
    });
    return rows.reduce((s, r) => s + r.amountMl, 0);
  }
}

@Injectable()
export class RecoveryLogService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertToday(params: {
    userId: string;
    energyScore: number;
    stressScore: number;
    recoveryScore: number;
    sorenessScore: number;
    notes?: string;
  }) {
    for (const score of [
      params.energyScore,
      params.stressScore,
      params.recoveryScore,
      params.sorenessScore,
    ]) {
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        throw new Error('scores must be 1–5');
      }
    }
    const recoveryDate = todayDateKey();
    return this.prisma.recoveryLog.upsert({
      where: { userId_recoveryDate: { userId: params.userId, recoveryDate } },
      create: {
        userId: params.userId,
        recoveryDate,
        energyScore: params.energyScore,
        stressScore: params.stressScore,
        recoveryScore: params.recoveryScore,
        sorenessScore: params.sorenessScore,
        notes: params.notes ?? null,
        source: HealthDataSource.MANUAL,
      },
      update: {
        energyScore: params.energyScore,
        stressScore: params.stressScore,
        recoveryScore: params.recoveryScore,
        sorenessScore: params.sorenessScore,
        notes: params.notes ?? null,
      },
    });
  }

  async getToday(userId: string) {
    return this.prisma.recoveryLog.findUnique({
      where: {
        userId_recoveryDate: { userId, recoveryDate: todayDateKey() },
      },
    });
  }
}
