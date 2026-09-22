import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AdminModule } from './modules/admin/admin.module';
import { DevMembershipModule } from './modules/dev-membership/dev-membership.module';
import { FoodModule } from './modules/food/food.module';
import { HealthModule } from './modules/health/health.module';
import { LineModule } from './modules/line/line.module';
import { MembershipModule } from './modules/membership/membership.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SheetsModule } from './modules/sheets/sheets.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: () => validateEnv(process.env),
    }),
    PrismaModule,
    MaintenanceModule,
    MembershipModule,
    AdminModule,
    DevMembershipModule,
    SheetsModule,
    UsersModule,
    LineModule,
    HealthModule,
    FoodModule,
    OnboardingModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
