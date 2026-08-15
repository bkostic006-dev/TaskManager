import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TASK_INTERNAL_ROUTES, type Task, type TaskListResponse } from '@tally/contracts';
import { UpstreamService } from '../common/upstream.service';
import { ListTasksQuery } from './dto/list-tasks.query';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

/**
 * The gateway's view of the task service: seven calls, all of them through
 * {@link UpstreamService}, so the three-second timeout and the retry policy
 * apply without this file restating them.
 *
 * Note that `userId` is the first argument of every method and goes into the
 * *path*, not a header or a body. It comes from the verified access token and
 * from nowhere else, so no route can be built for a tenant the caller has not
 * proved they are — see `TASK_INTERNAL_ROUTES`.
 *
 * Only the two reads retry. Everything else writes, and a repeated write on a
 * dropped response is a second edit rather than a second attempt.
 */
@Injectable()
export class TasksClient {
  private readonly baseUrl: string;

  constructor(
    private readonly upstream: UpstreamService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('TASK_SERVICE_URL') ?? 'http://localhost:4002';
  }

  list(userId: string, query: ListTasksQuery): Promise<TaskListResponse> {
    // The validated DTO instance is handed to axios as `params`, which drops
    // the keys the client omitted — so the service receives only what was
    // actually asked for and applies its own defaults to the rest.
    return this.upstream.get<TaskListResponse>(this.url(TASK_INTERNAL_ROUTES.forUser(userId)), {
      params: query,
    });
  }

  create(userId: string, body: CreateTaskDto): Promise<Task> {
    return this.upstream.post<Task>(this.url(TASK_INTERNAL_ROUTES.forUser(userId)), body);
  }

  findOne(userId: string, id: string): Promise<Task> {
    return this.upstream.get<Task>(this.url(TASK_INTERNAL_ROUTES.byId(userId, id)));
  }

  update(userId: string, id: string, body: UpdateTaskDto): Promise<Task> {
    return this.upstream.patch<Task>(this.url(TASK_INTERNAL_ROUTES.byId(userId, id)), body);
  }

  remove(userId: string, id: string): Promise<void> {
    return this.upstream.delete<void>(this.url(TASK_INTERNAL_ROUTES.byId(userId, id)));
  }

  complete(userId: string, id: string): Promise<Task> {
    return this.upstream.patch<Task>(this.url(TASK_INTERNAL_ROUTES.complete(userId, id)));
  }

  uncomplete(userId: string, id: string): Promise<Task> {
    return this.upstream.patch<Task>(this.url(TASK_INTERNAL_ROUTES.uncomplete(userId, id)));
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
