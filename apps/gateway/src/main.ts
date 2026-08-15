import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { DEV_ONLY_JWT_SECRET } from '@tally/contracts';
import { AppModule } from './app.module';

/** Fallback when PORT is unset; matches the port compose wires this app to. */
const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  // `bodyParser: false` disables the parsers Nest would otherwise register for
  // us, and only JSON is put back. That is a security control, not a tidying
  // up: `express.urlencoded` accepts `application/x-www-form-urlencoded`, which
  // is one of the three content types a cross-origin `<form method="POST">` can
  // send *without a preflight*. A page on any origin could therefore submit a
  // form to `/auth/login` with the attacker's credentials, the gateway would
  // process it, and `Set-Cookie` would land in the victim's browser — silently
  // logging them into the attacker's account, where everything they then create
  // is readable by its owner. CORS does not stop this: it hides the *response*,
  // and the attacker never needed to read it.
  //
  // Refusing form encoding removes the no-preflight path entirely. A JSON body
  // from another origin is a preflighted request, and the preflight is what
  // `enableCors` below actually gets to refuse.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json());

  const config = app.get(ConfigService);

  if (config.getOrThrow<string>('JWT_SECRET') === DEV_ONLY_JWT_SECRET) {
    new Logger('Bootstrap').warn(
      'JWT_SECRET is the shipped development placeholder. Access tokens can be ' +
        'forged by anyone with this repository. Set JWT_SECRET before deploying.',
    );
  }

  // Everything else global — pipe, filter, interceptor, guard, cookie parsing —
  // is registered inside CoreModule so the tests exercise the same pipeline.
  // CORS cannot be: it is a property of the HTTP adapter, not of the module
  // graph.
  //
  // An exact origin, never a wildcard: `credentials: true` and `origin: '*'` are
  // incompatible by specification, and the browser's refusal to send the refresh
  // cookie is reported as an opaque CORS error that says nothing about cookies.
  //
  // `getOrThrow`, because the default this used to carry was worse than a crash:
  // a deployment that forgot the variable would quietly allow credentialed
  // requests from `localhost:3000`.
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    credentials: true,
  });

  const port = Number(config.get<string>('PORT') ?? DEFAULT_PORT);

  // Bind 0.0.0.0 rather than Nest's default localhost: a loopback-bound
  // listener inside a container is unreachable from the host and from peers.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
