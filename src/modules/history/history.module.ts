import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';
import { WeightModule } from '../weight/weight.module';
import { HistoryApiController } from './history-api.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [PrismaModule, MembershipModule, WeightModule],
  controllers: [HistoryApiController],
  providers: [HistoryService],
})
export class HistoryModule {}
