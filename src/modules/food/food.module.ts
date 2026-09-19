import { Module } from '@nestjs/common';
import { LineModule } from '../line/line.module';
import { SheetsModule } from '../sheets/sheets.module';
import { UsersModule } from '../users/users.module';
import { WeightModule } from '../weight/weight.module';
import { DailyCoachService } from './daily-coach.service';
import { DailySummaryService } from './daily-summary.service';
import { DailyTotalsService } from './daily-totals.service';
import { FoodAnalysisService } from './food-analysis.service';
import { FoodLogService } from './food-log.service';
import { FoodLoggingService } from './food-logging.service';
import { MessageClassifyService } from './message-classify.service';
import { PendingFoodService } from './pending-food.service';

@Module({
  imports: [UsersModule, LineModule, WeightModule, SheetsModule],
  providers: [
    FoodAnalysisService,
    MessageClassifyService,
    FoodLogService,
    PendingFoodService,
    DailyTotalsService,
    DailySummaryService,
    DailyCoachService,
    FoodLoggingService,
  ],
  exports: [
    FoodAnalysisService,
    MessageClassifyService,
    FoodLogService,
    PendingFoodService,
    DailyTotalsService,
    DailySummaryService,
    DailyCoachService,
    FoodLoggingService,
  ],
})
export class FoodModule {}
