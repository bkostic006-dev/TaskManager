import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

/**
 * The auth service's single connection pool, owned by Nest's lifecycle.
 *
 * No eager `$connect()` on init: Prisma opens the pool on first query, and the
 * container's entrypoint has already run `migrate deploy` and the seed against
 * this database before the server is allowed to listen — so a reachability
 * problem surfaces at boot, not on the first request. Connecting in
 * `onModuleInit` would only move that failure, and would make every test that
 * builds `AppModule` require a live database.
 *
 * Disconnecting on destroy is not optional: without it a `docker compose stop`
 * leaves the pool's sockets open until Postgres times them out.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
