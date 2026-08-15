import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TasksModule, HealthModule],
  // Registered as a provider rather than in `main.ts` so the tests that build
  // this module get the same error rendering the container does. Without it a
  // DomainError leaves as an unshaped 500 and the gateway reports every domain
  // answer — including "not yours" — as a 503.
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
