import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';
import { LineModule } from '../line/line.module';
import { UsersModule } from '../users/users.module';
import { AdminApiController } from './admin-api.controller';
import { AdminAiUsageService } from './admin-ai-usage.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPagesController } from './admin-pages.controller';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  imports: [PrismaModule, MembershipModule, UsersModule, LineModule],
  controllers: [AdminApiController, AdminPagesController],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminAiUsageService,
    AdminSessionGuard,
  ],
})
export class AdminModule {}
