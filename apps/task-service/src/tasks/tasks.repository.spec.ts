import { DEFAULT_PAGE_SIZE, type TaskListQuery } from '@tally/contracts';
import { TaskRepository, buildTaskOrderBy, buildTaskWhere } from './tasks.repository';
import { PrismaService } from '../prisma/prisma.service';

const USER = '00000000-0000-4000-8000-000000000001';

/** A fully defaulted query, as the service hands one over. */
function query(overrides: Partial<TaskListQuery> = {}): TaskListQuery {
  return {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    status: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...overrides,
  };
}

describe('the list query builder', () => {
  it('scopes by the tenant key, narrows on completion, and searches both text columns', () => {
    // The `userId` predicate is the whole of tenancy, and it is unconditional.
    // `status: 'all'` with no search must add nothing beyond it, or "everything"
    // quietly becomes "everything that also happens to match".
    expect(buildTaskWhere(USER, query())).toEqual({ userId: USER });

    expect(buildTaskWhere(USER, query({ status: 'completed' }))).toEqual({
      userId: USER,
      completed: true,
    });

    // An OR across title and description, not a title-only match: a term that
    // appears in the body of a note has to find it, or the search box works on
    // half the data the user can see.
    expect(buildTaskWhere(USER, query({ status: 'pending', search: 'Stripe' }))).toEqual({
      userId: USER,
      completed: false,
      OR: [
        { title: { contains: 'Stripe', mode: 'insensitive' } },
        { description: { contains: 'Stripe', mode: 'insensitive' } },
      ],
    });
  });

  it('ends every ordering with id, and tie-breaks a completion sort on createdAt desc', () => {
    // Without a unique final key, rows tied on the sort column come back in
    // whatever order the planner picks, and it is free to pick differently for
    // page 1 and page 2 — the same task twice, another never shown.
    for (const sortBy of ['createdAt', 'title', 'completed'] as const) {
      for (const sortOrder of ['asc', 'desc'] as const) {
        const orderBy = buildTaskOrderBy(query({ sortBy, sortOrder }));
        expect(orderBy[orderBy.length - 1]).toEqual({ id: 'asc' });
      }
    }

    // Sorting by `completed` leaves two large blocks; inside a block the useful
    // order is newest first, and it stays `desc` when the caller flips
    // `sortOrder`, because `sortOrder` is then answering "done first or not".
    expect(buildTaskOrderBy(query({ sortBy: 'completed', sortOrder: 'asc' }))).toEqual([
      { completed: 'asc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });
});

describe('TaskRepository', () => {
  const task = { updateMany: jest.fn(), deleteMany: jest.fn() };
  const repository = new TaskRepository({ task } as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('decides the transition and the scope in the statement that writes', () => {
    task.updateMany.mockResolvedValue({ count: 1 });
    task.deleteMany.mockResolvedValue({ count: 0 });
    const completedAt = new Date('2026-08-15T09:00:00.000Z');

    void repository.markCompleted(USER, 'task-1', completedAt);
    void repository.delete(USER, 'someone-elses-task');

    // `completed: false` belongs in the predicate, not in a preceding read: two
    // requests can interleave between a read and a write and both would stamp,
    // the second overwriting a timestamp the domain fixes at the moment of
    // completion. The tenant key is in the same predicate for the same reason —
    // a scope checked by an earlier read is a scope taken on trust by the write.
    expect(task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', userId: USER, completed: false },
      data: { completed: true, completedAt },
    });
    expect(task.deleteMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses-task', userId: USER },
    });
  });
});
