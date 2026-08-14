import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/** Fallback when PORT is unset; matches the port compose wires this app to. */
const DEFAULT_PORT = 3001;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Everything else global — pipe, filter, interceptor, guard, cookie parsing —
  // is registered inside CoreModule so the tests exercise the same pipeline.
  // CORS cannot be: it is a property of the HTTP adapter, not of the module
  // graph.
  //
  // An exact origin, never a wildcard: `credentials: true` and `origin: '*'` are
  // incompatible by specification, and the browser's refusal to send the refresh
  // cookie is reported as an opaque CORS error that says nothing about cookies.
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN') ?? DEFAULT_WEB_ORIGIN,
    credentials: true,
  });

  const port = Number(config.get<string>('PORT') ?? DEFAULT_PORT);

  // Bind 0.0.0.0 rather than Nest's default localhost: a loopback-bound
  // listener inside a container is unreachable from the host and from peers.
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
