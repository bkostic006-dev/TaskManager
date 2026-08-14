import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'tally:public';

/**
 * Opts a route out of {@link JwtAuthGuard}, which is registered globally.
 *
 * The default is guarded and the exception is annotated, rather than the other
 * way round: forgetting this decorator makes a public endpoint return `401`,
 * which is noticed in seconds. Forgetting a `@UseGuards` would silently expose
 * a private one, which is noticed by someone else.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
