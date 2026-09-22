import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminDashboardService } from '../admin/admin-dashboard.service';
import { MembershipModule } from '../membership/membership.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { UsersModule } from '../users/users.module';
import { DevChatService } from './dev-chat.service';
import { DevMembershipApiController } from './dev-membership-api.controller';
import { DevMembershipPagesController } from './dev-membership-pages.controller';
import { DevToolsGuard } from './dev-tools.guard';

@Module({
  imports: [PrismaModule, UsersModule, MembershipModule, OnboardingModule],
  controllers: [DevMembershipApiController, DevMembershipPagesController],
  providers: [DevToolsGuard, AdminDashboardService, DevChatService],
})
export class DevMembershipModule {}
