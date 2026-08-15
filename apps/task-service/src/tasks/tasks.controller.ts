import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { TASK_INTERNAL_ROUTES, type Task, type TaskListResponse } from '@tally/contracts';
import { RawListQuery, TasksService } from './tasks.service';

/** Body of the two routes that write task fields, before the service checks it. */
interface TaskBody {
  title?: unknown;
  description?: unknown;
}

/**
 * The task service's internal surface. Bodies arrive already validated by the
 * gateway's DTOs, and the network is `internal: true`, so there is no guard
 * here — reachability is the authorisation.
 *
 * The tenant key is a path parameter on every route rather than a header,
 * because a URL that cannot be built without it cannot be requested without it.
 * See `TASK_INTERNAL_ROUTES`. Nothing in this file interprets it; it is handed
 * straight to the service, which validates it and scopes every query by it.
 */
@Controller(TASK_INTERNAL_ROUTES.base)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Param('userId') userId: string, @Query() query: RawListQuery): Promise<TaskListResponse> {
    return this.tasks.list(userId, query);
  }

  @Post()
  create(@Param('userId') userId: string, @Body() body: TaskBody): Promise<Task> {
    return this.tasks.create(userId, body ?? {});
  }

  @Get(':id')
  findOne(@Param('userId') userId: string, @Param('id') id: string): Promise<Task> {
    return this.tasks.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @Param('userId') userId: string,
    @Param('id') id: string,
    @Body() body: TaskBody,
  ): Promise<Task> {
    return this.tasks.update(userId, id, body ?? {});
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('userId') userId: string, @Param('id') id: string): Promise<void> {
    return this.tasks.remove(userId, id);
  }

  @Patch(':id/complete')
  complete(@Param('userId') userId: string, @Param('id') id: string): Promise<Task> {
    return this.tasks.complete(userId, id);
  }

  @Patch(':id/uncomplete')
  uncomplete(@Param('userId') userId: string, @Param('id') id: string): Promise<Task> {
    return this.tasks.uncomplete(userId, id);
  }
}
