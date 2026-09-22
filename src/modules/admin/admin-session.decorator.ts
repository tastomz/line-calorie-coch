import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const AdminId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ adminId?: string }>();
    if (!req.adminId) {
      throw new UnauthorizedException('Admin authentication required');
    }
    return req.adminId;
  },
);
