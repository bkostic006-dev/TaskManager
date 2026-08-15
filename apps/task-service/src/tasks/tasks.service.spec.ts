import { ErrorCode } from '@tally/contracts';
import { TaskRepository } from './tasks.repository';
import { TasksService, parseListQuery } from './tasks.service';

const USER = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '11111111-1111-4111-8111-111111111111';

/** A row as Prisma returns it, completed three days ago. */
const COMPLETED_ROW = {
  id: TASK_ID,
  userId: USER,
  title: 'Rotate the Stripe API keys',
  description: null,
  completed: true,
  completedAt: new Date('2026-08-12T08:00:00.000Z'),
  createdAt: new Date('2026-08-10T08:00:00.000Z'),
  updatedAt: new Date('2026-08-12T08:00:00.000Z'),
};

describe('TasksService', () => {
  const repository = {
    findPage: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    markCompleted: jest.fn(),
    markPending: jest.fn(),
  };
  const service = new TasksService(repository as unknown as TaskRepository);

  beforeEach(() => jest.clearAllMocks());

  it('does not re-stamp completedAt when an already-complete task is completed again', () => {
    // The conditional update matches nothing, which is what "already done"
    // looks like from here. Re-stamping would rewrite history: a list sorted by
    // completion would reorder itself every time a user double-clicked, and
    // "finished on the 12th" would silently become "finished today".
    repository.markCompleted.mockResolvedValue(0);
    repository.findById.mockResolvedValue(COMPLETED_ROW);

    return service.complete(USER, TASK_ID).then((task) => {
      expect(task.completedAt).toBe('2026-08-12T08:00:00.000Z');
      expect(task.updatedAt).toBe('2026-08-12T08:00:00.000Z');
      // And nothing else was written — no second attempt once the first
      // reported no transition.
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.markCompleted).toHaveBeenCalledTimes(1);
    });
  });

  it('clears completedAt on uncomplete rather than keeping it as a record', async () => {
    // `completed: false` with a non-null `completedAt` would be representable,
    // and every consumer would have to decide which of the two to believe.
    repository.markPending.mockResolvedValue(1);
    repository.findById.mockResolvedValue({
      ...COMPLETED_ROW,
      completed: false,
      completedAt: null,
    });

    const task = await service.uncomplete(USER, TASK_ID);

    expect(task).toMatchObject({ completed: false, completedAt: null });
    expect(repository.markPending).toHaveBeenCalledWith(USER, TASK_ID);
  });

  it("answers NotFound — never Forbidden — for another user's task", async () => {
    // Both the conditional write and the read come back empty, because both are
    // scoped by the tenant key. A 403 here would confirm the id exists and turn
    // guessing ids into enumerating other people's tasks.
    repository.markCompleted.mockResolvedValue(0);
    repository.findById.mockResolvedValue(null);

    await expect(service.complete(USER, TASK_ID)).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });

    repository.delete.mockResolvedValue(0);
    await expect(service.remove(USER, TASK_ID)).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
  });

  it('refuses an edit that would change nothing, and has no path to completion', async () => {
    // A 200 for a request that changed nothing reads as a successful edit.
    await expect(service.update(USER, TASK_ID, {})).rejects.toMatchObject({
      code: ErrorCode.Validation,
    });

    // `completed` is not a field this method can set even when it is handed
    // one: the transitions own it, so the flag and the timestamp cannot drift.
    repository.update.mockResolvedValue(1);
    repository.findById.mockResolvedValue(COMPLETED_ROW);
    await service.update(USER, TASK_ID, { title: 'Renamed', completed: false } as never);

    expect(repository.update).toHaveBeenCalledWith(USER, TASK_ID, { title: 'Renamed' });
  });

  it('reports pagination against the filtered total, not the page it returned', async () => {
    // 47 rows at 8 a page is 6 pages, and page 6 holds 7 of them. A client
    // building a page selector from `data.length` would offer 1 page.
    repository.findPage.mockResolvedValue({ rows: [COMPLETED_ROW], total: 47 });

    const { meta } = await service.list(USER, { page: '2', pageSize: '8' });

    expect(meta).toEqual({ page: 2, pageSize: 8, total: 47, totalPages: 6 });
    // The strings a query arrives as have become numbers before the builder,
    // which computes `skip` from them arithmetically.
    expect(repository.findPage).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ page: 2, pageSize: 8 }),
    );
  });
});

describe('parseListQuery', () => {
  it('rejects out-of-range values instead of clamping, and defaults the rest', () => {
    // Clamping answers a question the client did not ask and gives it no way to
    // tell: it would render "48 per page" over 8 rows and conclude that is all
    // the user has.
    for (const bad of [{ pageSize: '7' }, { page: '0' }, { sortBy: 'dueDate' }]) {
      expect(() => parseListQuery(bad)).toThrow(
        expect.objectContaining({ code: ErrorCode.Validation }),
      );
    }

    expect(parseListQuery({})).toEqual({
      page: 1,
      pageSize: 8,
      status: 'all',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    // `contains: ''` matches every row, so a blank search would read as an
    // active filter returning "everything" — indistinguishable from no filter
    // until the user types a space.
    expect(parseListQuery({ search: '   ' })).not.toHaveProperty('search');
    expect(parseListQuery({ search: '  milk ' })).toMatchObject({ search: 'milk' });
  });
});
