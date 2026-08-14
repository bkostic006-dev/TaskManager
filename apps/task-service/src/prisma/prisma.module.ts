import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so the task repository added in stage 4 injects one client rather than
 * one pool per module — Postgres connection slots are the scarce resource here.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
