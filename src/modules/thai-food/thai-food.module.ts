import { Module } from '@nestjs/common';
import { ThaiFoodLookupService } from './thai-food-lookup.service';

@Module({
  providers: [ThaiFoodLookupService],
  exports: [ThaiFoodLookupService],
})
export class ThaiFoodModule {}
