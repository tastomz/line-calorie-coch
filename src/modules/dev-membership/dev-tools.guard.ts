import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Dev membership tools: NODE_ENV !== production AND ENABLE_DEV_MEMBERSHIP_TOOLS=true */
@Injectable()
export class DevToolsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const nodeEnv = (
      this.config.get<string>('NODE_ENV') ?? 'development'
    ).trim();
    const enabled =
      (this.config.get<string>('ENABLE_DEV_MEMBERSHIP_TOOLS') ?? '')
        .trim()
        .toLowerCase() === 'true';
    if (nodeEnv === 'production' || !enabled) {
      throw new ForbiddenException('Dev membership tools are disabled');
    }
    return true;
  }
}
