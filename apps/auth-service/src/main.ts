import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DEV_ONLY_JWT_SECRET } from '@tally/contracts';
import { AppModule } from './app.module';

/** Fallback when PORT is unset; matches the port compose wires this app to. */
const DEFAULT_PORT = 4001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // `getOrThrow` on JWT_SECRET cannot protect anything on its own: compose
  // always supplies the variable, so the throw never fires and the placeholder
  // arrives looking exactly like a real key. This is the check that actually
  // sees it. It warns rather than exits on purpose — a zero-step
  // `docker compose up` is a promise this project makes to its reviewer.
  if (config.getOrThrow<string>('JWT_SECRET') === DEV_ONLY_JWT_SECRET) {
    new Logger('Bootstrap').warn(
      'JWT_SECRET is the shipped development placeholder. Access tokens signed ' +
        'with it can be forged by anyone with this repository. Set JWT_SECRET ' +
        'before deploying.',
    );
  }

  const port = Number(config.get<string>('PORT') ?? DEFAULT_PORT);

  // Bind 0.0.0.0 rather than Nest's default localhost: a loopback-bound
  // listener inside a container is unreachable from the host and from peers.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
