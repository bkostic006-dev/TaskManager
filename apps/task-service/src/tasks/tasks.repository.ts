import { Injectable } from '@nestjs/common';
import { TaskListQuery } from '@tally/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type Task } from '../../generated/prisma';

/** Fields a `PATCH /tasks/:id` may touch. Completion is not one of them. */
export interface TaskPatch {
  title?: string;
  /** `null` clears the description; `undefined` leaves it as it was. */
  description?: string | null;
}

/**
 * Narrows a list query to the rows it selects, for one user.
 *
 * `userId` is folded in here rather than by the caller so that no code path can
 * produce a `where` without it — the composite indexes are `(userId, …)`, and a
 * predicate missing the tenant key is both a full scan and a data leak.
 *
 * `search` is a case-insensitive contains across title *and* description, which
 * is an `OR`: a term that appears only in the body of a note has to find it, or
 * the search box silently only works on titles. Postgres has no index for
 * `%term%`, so the length cap in `@tally/contracts` is what bounds the scan.
 *
 * An empty or whitespace-only `search` is expected to have been dropped before
 * this point; passed through, `contains: ''` matches every row and an empty
 * input box would read as an active filter.
 */
export function buildTaskWhere(userId: string, query: TaskListQuery): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { userId };

  if (query.status !== 'all') {
    where.completed = query.status === 'completed';
  }

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

/**
 * Turns `sortBy` and `sortOrder` into an ordering that is *total*.
 *
 * Every ordering ends with `id`, which is the only column with a unique value
 * per row. Without it, rows tied on the chosen column may be returned in any
 * order the planner likes, and that order is free to differ between two
 * queries — so `page=1` and `page=2` of the same sort can both contain the same
 * task while another is never shown at all. Pagination is a promise about a
 * stable sequence, and a non-total sort cannot keep it.
 *
 * `completed` gets a second key before that: sorting a list into "done" and
 * "not done" leaves two large blocks, and within a block the useful order is
 * newest first — not the insertion order the planner would otherwise pick. It
 * is fixed at `createdAt desc` rather than following `sortOrder`, because
 * `sortOrder` is answering "pending first or completed first" at that point.
 */
export function buildTaskOrderBy(query: TaskListQuery): Prisma.TaskOrderByWithRelationInput[] {
  const direction = query.sortOrder;

  switch (query.sortBy) {
    case 'completed':
      return [{ completed: direction }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'title':
      return [{ title: direction }, { id: 'asc' }];
    case 'createdAt':
      return [{ createdAt: direction }, { id: 'asc' }];
  }
}

/**
 * Every database statement the task service issues, and the only layer that
 * knows Prisma exists.
 *
 * **Every method takes `userId` first.** Not a convention — there is no
 * overload without it, so a query that forgets the tenant key does not compile.
 * That is the whole tenancy control: the rule "another user's task is a 404" is
 * kept by these predicates and by nothing else, and a rule kept by remembering
 * is a rule that will be forgotten once.
 *
 * Writes are `updateMany`/`deleteMany` narrowed on `{ id, userId }` rather than
 * `update`/`delete` on the primary key, for the same reason: a unique-key write
 * cannot express the scope, so it would have to be preceded by a read, and
 * between that read and the write the row's owner is taken on trust.
 */
@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the user's tasks, with the unfiltered-by-page total beside it.
   *
   * The count runs in the same transaction as the page so the two cannot
   * disagree — a task created between two separate statements produces a
   * `total` that does not match the rows, and a page selector that offers a
   * page which comes back empty.
   */
  async findPage(userId: string, query: TaskListQuery): Promise<{ rows: Task[]; total: number }> {
    const where = buildTaskWhere(userId, query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: buildTaskOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { rows, total };
  }

  findById(userId: string, id: string): Promise<Task | null> {
    return this.prisma.task.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: { title: string; description: string | null }): Promise<Task> {
    return this.prisma.task.create({ data: { userId, ...data } });
  }

  /** @returns the number of rows changed — `0` when the task is not this user's. */
  async update(userId: string, id: string, patch: TaskPatch): Promise<number> {
    const { count } = await this.prisma.task.updateMany({ where: { id, userId }, data: patch });
    return count;
  }

  /** @returns the number of rows removed — `0` when the task is not this user's. */
  async delete(userId: string, id: string): Promise<number> {
    const { count } = await this.prisma.task.deleteMany({ where: { id, userId } });
    return count;
  }

  /**
   * Stamps a task complete, but only if it is not already.
   *
   * `completed: false` is in the predicate rather than checked by the caller,
   * so the "already done" case is decided by the database in the same statement
   * that would have written. A read-then-write can be interleaved by a second
   * request between the two, and both would then stamp `completedAt` — the
   * second overwriting a timestamp the domain says is fixed at the moment of
   * completion. Zero rows here means "no transition happened", which covers
   * already-complete and not-yours alike; the service distinguishes them with a
   * read it only needs on that path.
   */
  async markCompleted(userId: string, id: string, completedAt: Date): Promise<number> {
    const { count } = await this.prisma.task.updateMany({
      where: { id, userId, completed: false },
      data: { completed: true, completedAt },
    });
    return count;
  }

  /** The mirror of {@link markCompleted}: only a completed task transitions. */
  async markPending(userId: string, id: string): Promise<number> {
    const { count } = await this.prisma.task.updateMany({
      where: { id, userId, completed: true },
      data: { completed: false, completedAt: null },
    });
    return count;
  }
}
