import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so the repositories added in stage 3 inject one client rather than
 * one pool per module — Postgres connection slots are the scarce resource here.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
