/**
 * One-shot retention cleanup for expired PendingFoodAnalysis and old LineEvent rows.
 *
 * Usage:
 *   npm run cleanup:retention
 *   LINE_EVENT_RETENTION_DAYS=45 npm run cleanup:retention
 *
 * Requires DATABASE_URL (and other env validation). Safe to run while the app is up.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RetentionCleanupService } from '../maintenance/retention-cleanup.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const cleanup = app.get(RetentionCleanupService);
    const daysRaw = process.env.LINE_EVENT_RETENTION_DAYS;
    const lineEventRetentionDays = daysRaw ? Number(daysRaw) : undefined;
    const result = await cleanup.run({ lineEventRetentionDays });

    console.log(JSON.stringify({ ok: true, ...result }));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown error',
    }),
  );
  process.exitCode = 1;
});
