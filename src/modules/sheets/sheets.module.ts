import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleSheetsService } from './google-sheets.service';
import { SheetsSyncService } from './sheets-sync.service';

@Module({
  imports: [PrismaModule],
  providers: [GoogleSheetsService, SheetsSyncService],
  exports: [SheetsSyncService, GoogleSheetsService],
})
export class SheetsModule {}
