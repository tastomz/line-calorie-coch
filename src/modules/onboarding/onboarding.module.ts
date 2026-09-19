import { Module } from '@nestjs/common';
import { FoodModule } from '../food/food.module';
import { LineController } from '../line/line.controller';
import { LineModule } from '../line/line.module';
import { LineWebhookService } from '../line/line-webhook.service';
import { UsersModule } from '../users/users.module';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [UsersModule, LineModule, FoodModule],
  controllers: [LineController],
  providers: [OnboardingService, LineWebhookService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
