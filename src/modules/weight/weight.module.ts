import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { WeightLogService } from './weight-log.service';

@Module({
  imports: [UsersModule],
  providers: [WeightLogService],
  exports: [WeightLogService],
})
export class WeightModule {}
