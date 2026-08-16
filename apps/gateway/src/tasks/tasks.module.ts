import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { CoreModule } from '../common/core.module';
import { TasksClient } from './tasks.client';
import { TasksController } from './tasks.controller';
import { TASK_LIST_CACHE_TTL_MS, TaskListCache } from './task-list-cache';
import { TaskListCacheInterceptor } from './task-list-cache.interceptor';

/**
 * The cache is registered here rather than in `CoreModule` with the other
 * global machinery, because it is not global: `GET /tasks` is the only cached
 * route in the system, and scoping the store to the module that owns it means
 * a second controller cannot pick it up by accident.
 */
@Module({
  imports: [CoreModule, CacheModule.register({ ttl: TASK_LIST_CACHE_TTL_MS })],
  controllers: [TasksController],
  providers: [TasksClient, TaskListCache, TaskListCacheInterceptor],
})
export class TasksModule {}
