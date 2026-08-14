import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest, RequestUser } from './jwt-auth.guard';

/**
 * The verified caller, as {@link JwtAuthGuard} left it on the request.
 *
 * Non-optional on purpose: the guard is global, so any handler that can read
 * this has already been through it. The assertion fails loudly in development
 * if a route ever ends up both `@Public()` and reading a user.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!user) {
    throw new Error('CurrentUser used on a route that JwtAuthGuard did not protect');
  }
  return user;
});

export type { RequestUser };
