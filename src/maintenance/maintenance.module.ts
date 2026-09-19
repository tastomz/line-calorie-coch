import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionCleanupService } from './retention-cleanup.service';

@Module({
  imports: [PrismaModule],
  providers: [RetentionCleanupService],
  exports: [RetentionCleanupService],
})
export class MaintenanceModule {}
