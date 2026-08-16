import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import type { ValidationError } from 'class-validator';
import {
  ACCESS_TOKEN_TTL,
  DomainError,
  ErrorCode,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  UPSTREAM_TIMEOUT_MS,
} from '@tally/contracts';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { CookieOriginGuard } from './cookie-origin.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoggingInterceptor } from './logging.interceptor';
import { RATE_LIMITS } from './throttle';
import { DomainThrottlerGuard } from './throttler.guard';
import { UpstreamService } from './upstream.service';

/**
 * Everything the brief asks the gateway to do globally — validation, logging,
 * auth guarding, exception filtering — plus the outbound HTTP client.
 *
 * These are registered as providers rather than with `app.useGlobalX()` in
 * `main.ts` so the test harness gets the identical pipeline. A guard configured
 * only in `main.ts` is a guard the e2e suite never exercises, which is the
 * cheapest possible way to ship an unprotected endpoint with green tests.
 */
@Module({
  imports: [
    HttpModule.register({
      // A second ceiling under the RxJS `timeout` in UpstreamService. That one
      // ends the gateway's wait; this one closes the socket, so a hung service
      // cannot leak connections at the rate we abandon them.
      timeout: UPSTREAM_TIMEOUT_MS,
      // Axios throws on any non-2xx, which is what routes every downstream
      // failure through UpstreamService's translation instead of returning a
      // 401 body as if it were data.
      validateStatus: (status) => status >= 200 && status < 300,
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      // Verification key. Same value the auth service signs with — see the
      // JWT_SECRET note in docker-compose.yml — and `getOrThrow` so a missing
      // one is a boot failure rather than a 401 on the first protected request.
      //
      // `verifyOptions` is the verifier's half of the contract in
      // `@tally/contracts`, and it mirrors the auth service's `signOptions`
      // exactly. Naming the algorithm list matters most: without it the token's
      // own header decides how it is checked, which is the shape of every
      // algorithm-confusion bug — and the plan puts RS256 on the roadmap, which
      // is precisely where it would bite.
      //
      // `maxAge` is the verifier's own expiry bound, measured from `iat` rather
      // than from `exp`. Without it the whole expiry guarantee rested on the
      // signer: an access token has no denylist by design, so a token whose
      // `exp` had been deleted, or set a century out, verified and was accepted
      // — both confirmed against the running gateway with tokens forged using
      // the published development secret. With it, a token is spendable for
      // ACCESS_TOKEN_TTL after it was minted whatever its `exp` says, and a
      // token with no `iat` at all is refused outright.
      //
      // `requireExp` would be the natural companion and is deliberately absent:
      // `jsonwebtoken@9` does not implement it — passing it, an exp-less token
      // still verifies — so the presence check is asserted in JwtAuthGuard
      // instead, where it is a real check rather than a decorative option.
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        verifyOptions: {
          algorithms: [JWT_ALGORITHM],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          maxAge: ACCESS_TOKEN_TTL,
        },
      }),
    }),
    // In-memory storage, which is the module's default and is deliberate: a
    // Redis-backed store is the answer for more than one replica and is named
    // out of scope for this project. One unnamed throttler carrying the default
    // allowance; the two routes that need a different one say so with
    // `@Throttle()`, and each handler counts in its own bucket regardless — see
    // `throttle.ts` for the whole policy and why it is not a single number.
    ThrottlerModule.forRoot({ throttlers: [RATE_LIMITS.default] }),
  ],
  providers: [
    UpstreamService,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          // Strip unknown properties, then reject the request that sent them.
          // `whitelist` alone would quietly discard a misspelled field and
          // report success for something that did not happen.
          whitelist: true,
          forbidNonWhitelisted: true,
          // Instantiates the DTO class so `@Type` conversions and defaults
          // apply — query strings arrive as strings and are useless untyped.
          transform: true,
          // class-validator's own exception is an HttpException carrying an
          // array of strings. Converting here rather than in the filter keeps
          // the filter's DomainError branch the single path for expected
          // failures, and turns the array into per-field `details`.
          exceptionFactory: (errors: ValidationError[]) =>
            new DomainError(
              ErrorCode.Validation,
              'Some fields need attention.',
              toFieldDetails(errors),
            ),
        }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // First of the three guards, on purpose. Global guards run in registration
    // order, so anything below this is reached only by a request that was
    // already counted — which is what makes the limit cover the requests worth
    // limiting. Behind the JWT guard it would count only *authenticated*
    // traffic, and a flood of wrong passwords or forged tokens would be
    // rejected without ever touching the counter, so the one thing the strict
    // auth limit exists to stop would be exactly the thing it never saw.
    { provide: APP_GUARD, useClass: DomainThrottlerGuard },
    // Global, and before the JWT guard: it applies to whatever spends the
    // refresh cookie, including routes that do not exist yet, so nothing has to
    // be remembered when the third one is written.
    { provide: APP_GUARD, useClass: CookieOriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [UpstreamService],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Middleware rather than `app.use()` for the same reason as the providers
    // above: the refresh flow is unreadable without parsed cookies, and it has
    // to be testable.
    consumer.apply(cookieParser()).forRoutes('*');
  }
}

/** Flattens class-validator's nested errors into `{ field: [messages] }`. */
function toFieldDetails(errors: ValidationError[], prefix = ''): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((details, error) => {
    const field = `${prefix}${error.property}`;

    if (error.constraints) {
      details[field] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(details, toFieldDetails(error.children, `${field}.`));
    }

    return details;
  }, {});
}
