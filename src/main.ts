import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(cookieParser());
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const logger = new Logger('Bootstrap');

  logger.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'log',
      event: 'app_listen',
      nodeEnv,
      port,
    }),
  );

  // Bind all interfaces so Docker / reverse proxies can reach the process.
  await app.listen(port, '0.0.0.0');

  const shutdown = async (signal: string) => {
    logger.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'log',
        event: 'app_shutdown',
        signal,
      }),
    );
    try {
      await app.close();
    } catch (error) {
      logger.error(
        `Shutdown error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
}
void bootstrap();
