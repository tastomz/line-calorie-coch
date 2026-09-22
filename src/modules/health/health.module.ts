import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { LineModule } from '../line/line.module';
import { MembershipModule } from '../membership/membership.module';
import { UsersModule } from '../users/users.module';
import { BodyScanService } from './body-scan.service';
import {
  HealthDashboardService,
  HealthInsightService,
} from './health-dashboard.service';
import {
  ActivityLogService,
  ExerciseLogService,
  HydrationLogService,
  RecoveryLogService,
  SleepLogService,
} from './health-logs.service';
import { HealthRoutingService } from './health-routing.service';
import { MealPlanService } from './meal-plan.service';
import {
  BodyScanAnalysisService,
  WeeklyReviewService,
} from './weekly-review.service';

@Module({
  imports: [
    PrismaModule,
    MembershipModule,
    ConfigModule,
    LineModule,
    UsersModule,
  ],
  providers: [
    BodyScanService,
    BodyScanAnalysisService,
    SleepLogService,
    ExerciseLogService,
    ActivityLogService,
    HydrationLogService,
    RecoveryLogService,
    MealPlanService,
    HealthDashboardService,
    HealthInsightService,
    WeeklyReviewService,
    HealthRoutingService,
  ],
  exports: [
    BodyScanService,
    BodyScanAnalysisService,
    SleepLogService,
    ExerciseLogService,
    ActivityLogService,
    HydrationLogService,
    RecoveryLogService,
    MealPlanService,
    HealthDashboardService,
    HealthInsightService,
    WeeklyReviewService,
    HealthRoutingService,
  ],
})
export class HealthModule {}
