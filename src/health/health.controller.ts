import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../modules/sheets/google-sheets.service';

export type HealthResponse = {
  status: 'ok' | 'degraded' | 'error';
  alive: true;
  checks: {
    database: 'up' | 'down';
    sheets: 'configured' | 'disabled' | 'unknown';
  };
  timestamp: string;
};

/**
 * Liveness: process is up (always returns if Nest is serving).
 * Readiness: database reachable. OpenAI/Sheets outages do NOT fail liveness.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleSheets: GoogleSheetsService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    const sheets = this.googleSheets.isEnabled() ? 'configured' : 'disabled';

    const status =
      database === 'up' ? 'ok' : ('error' as HealthResponse['status']);

    return {
      status,
      alive: true,
      checks: { database, sheets },
      timestamp: new Date().toISOString(),
    };
  }

  /** Process-only probe — does not touch the database. */
  @Get('live')
  live(): { alive: true; timestamp: string } {
    return { alive: true, timestamp: new Date().toISOString() };
  }

  /**
   * Ready when DB is reachable.
   * Returns HTTP 503 when not ready so orchestrators can drain traffic.
   */
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ready: boolean; database: 'up' | 'down' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ready: true, database: 'up' };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { ready: false, database: 'down' };
    }
  }
}
