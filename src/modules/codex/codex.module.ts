import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CodexService } from './codex.service';

/** ChatGPT sign-in (Codex CLI) that answers AI calls for Trial users. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [CodexService],
  exports: [CodexService],
})
export class CodexModule {}
