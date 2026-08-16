import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { TASK_ROUTES, type Task, type TaskListResponse } from '@tally/contracts';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { ThrottleTaskRead } from '../common/throttle';
import { TasksClient } from './tasks.client';
import { CacheableList } from './task-list-cache';
import { TaskListCacheInterceptor } from './task-list-cache.interceptor';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQuery } from './dto/list-tasks.query';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * The public task surface. Every route is protected by the global
 * `JwtAuthGuard` — none of them is `@Public()` — and every one passes
 * `user.userId` from the verified token downstream.
 *
 * The client never supplies the tenant key and cannot influence it: `:id` is
 * the only thing it names, and an id belonging to somebody else is a `404` from
 * the task service, never a `403`. A `403` would confirm the id exists, which
 * turns guessing ids into enumerating other people's tasks.
 *
 * The cache interceptor sits on the controller rather than on `list()` because
 * it does two jobs: it caches the list, and it retires the caller's cached pages
 * after any of the five writes below succeeds. Narrowed to the one read it would
 * still cache perfectly well — and a task the user had just created would stay
 * invisible to them for the whole TTL, because nothing would have told the cache
 * anything changed. The wider scope also means a sixth write added later is
 * covered without anyone remembering to cover it.
 */
@Controller(TASK_ROUTES.base)
@UseInterceptors(TaskListCacheInterceptor)
export class TasksController {
  constructor(private readonly tasks: TasksClient) {}

  /**
   * A page of the caller's tasks. Cached for
   * {@link TASK_LIST_CACHE_TTL_MS} under a key that starts with their
   * `userId` — see {@link TaskListCache} — and rate limited far more loosely
   * than the auth routes, because a dashboard changing filters is normal use.
   */
  @Get()
  @ThrottleTaskRead()
  @CacheableList()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListTasksQuery,
  ): Promise<TaskListResponse> {
    return this.tasks.list(user.userId, query);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: CreateTaskDto): Promise<Task> {
    return this.tasks.create(user.userId, body);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<Task> {
    return this.tasks.findOne(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasks.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<void> {
    return this.tasks.remove(user.userId, id);
  }

  @Patch(':id/complete')
  complete(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<Task> {
    return this.tasks.complete(user.userId, id);
  }

  @Patch(':id/uncomplete')
  uncomplete(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<Task> {
    return this.tasks.uncomplete(user.userId, id);
  }
}
