import { Module } from '@nestjs/common';
import { SheetsModule } from '../sheets/sheets.module';
import { NutritionProfileService } from './nutrition-profile.service';
import { UsersService } from './users.service';

/**
 * Phase 7: public REST /users and nutrition-profile controllers removed.
 * User identity and profile mutations happen only via verified LINE webhook.
 */
@Module({
  imports: [SheetsModule],
  providers: [UsersService, NutritionProfileService],
  exports: [UsersService, NutritionProfileService],
})
export class UsersModule {}
