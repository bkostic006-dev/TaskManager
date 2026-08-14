import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/** Fallback when PORT is unset; matches the port compose wires this app to. */
const DEFAULT_PORT = 4001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(app.get(ConfigService).get<string>('PORT') ?? DEFAULT_PORT);

  // Bind 0.0.0.0 rather than Nest's default localhost: a loopback-bound
  // listener inside a container is unreachable from the host and from peers.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
