import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_TASK_SORT_FIELD,
  DEFAULT_TASK_SORT_ORDER,
  DEFAULT_TASK_STATUS,
  DomainError,
  ErrorCode,
  PAGE_SIZES,
  SORT_ORDERS,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_SEARCH_MAX_LENGTH,
  TASK_SORT_FIELDS,
  TASK_STATUS_FILTERS,
  TASK_TITLE_MAX_LENGTH,
  type SortOrder,
  type Task,
  type TaskListQuery,
  type TaskListResponse,
  type TaskSortField,
  type TaskStatusFilter,
} from '@tally/contracts';
import { TaskPatch, TaskRepository } from './tasks.repository';
import type { Task as TaskRow } from '../../generated/prisma';

/** Any RFC 4122 variant, which is what the `@db.Uuid` columns will accept. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One answer for "no such task" and for "not yours". Stated once so it stays one. */
const TASK_NOT_FOUND = 'That task no longer exists.';

/** A list request as it arrives off the wire: strings, or nothing at all. */
export type RawListQuery = Partial<Record<keyof TaskListQuery, unknown>>;

/**
 * All task logic in the system, per the brief's split of responsibilities.
 *
 * Nothing here knows about HTTP status codes: failures are `DomainError`s, and
 * the service's own filter and then the gateway's decide what they look like on
 * the wire.
 *
 * Two rules run through every method:
 *
 * - **Tenancy.** `userId` is the first argument of every repository call, so a
 *   query cannot be issued unscoped. A task belonging to someone else is
 *   `NotFound` — `404`, never `403`, because `403` confirms that the id exists
 *   and turns a guess into an oracle for what other people own.
 * - **Completion is a transition, not a field.** It moves only through
 *   {@link complete} and {@link uncomplete}, and {@link update} has no way to
 *   set it, so `completedAt` can never disagree with `completed`.
 */
@Injectable()
export class TasksService {
  constructor(private readonly repository: TaskRepository) {}

  /**
   * One page of the caller's tasks, filtered, searched and sorted.
   *
   * The query is normalised before it reaches the builder — see
   * {@link parseListQuery} — so every downstream decision is made on a complete
   * value rather than on "absent means…". `total` counts the filtered set, and
   * `totalPages` is at least 1 so an empty result still describes a page the
   * selector can sit on.
   *
   * A `page` past the end is not an error: it returns no rows with an accurate
   * `meta`, which is what a client that deleted the last task on page 4 needs
   * in order to correct itself.
   *
   * @throws DomainError `Validation` when the tenant key or any query parameter
   * is malformed, `NotFound` never — an empty page is a legitimate answer.
   */
  async list(userId: string, raw: RawListQuery): Promise<TaskListResponse> {
    requireUserId(userId);
    const query = parseListQuery(raw);

    const { rows, total } = await this.repository.findPage(userId, query);

    return {
      data: rows.map(toTask),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  /** @throws DomainError `Validation` on a malformed tenant key, `NotFound` when the task is not this user's. */
  async findOne(userId: string, id: string): Promise<Task> {
    requireUserId(userId);
    return toTask(await this.require(userId, id));
  }

  /**
   * Creates a task, always pending.
   *
   * A caller cannot open a task in the completed state, which is not a
   * restriction so much as the same rule as everywhere else: `completedAt` is
   * stamped by the transition and by nothing else.
   *
   * @throws DomainError `Validation` on a blank or oversized title, or a
   * description past its limit.
   */
  async create(userId: string, input: { title?: unknown; description?: unknown }): Promise<Task> {
    requireUserId(userId);

    const title = requireTitle(input.title);
    const description = optionalDescription(input.description) ?? null;

    return toTask(await this.repository.create(userId, { title, description }));
  }

  /**
   * Edits the title, the description, or both.
   *
   * Deliberately cannot touch `completed` or `completedAt`. The gateway's DTO
   * rejects the field outright; here it simply has no path, so even a caller on
   * the internal network cannot set a completion state without going through
   * the transition that stamps the timestamp.
   *
   * `description: null` clears the note — distinct from omitting the field,
   * which leaves it untouched. An empty patch is refused rather than accepted
   * as a no-op, because a `200` for a request that changed nothing reads as a
   * successful edit to whoever sent it.
   *
   * @throws DomainError `Validation` on an empty patch or a bad field,
   * `NotFound` when the task is not this user's.
   */
  async update(
    userId: string,
    id: string,
    input: { title?: unknown; description?: unknown },
  ): Promise<Task> {
    requireUserId(userId);
    requireTaskId(id);

    const patch: TaskPatch = {};
    if (input.title !== undefined) {
      patch.title = requireTitle(input.title);
    }
    if (input.description !== undefined) {
      patch.description = optionalDescription(input.description) ?? null;
    }

    if (Object.keys(patch).length === 0) {
      throw new DomainError(ErrorCode.Validation, 'Provide a title or a description to update.');
    }

    if ((await this.repository.update(userId, id, patch)) === 0) {
      throw new DomainError(ErrorCode.NotFound, TASK_NOT_FOUND);
    }

    return toTask(await this.require(userId, id));
  }

  /**
   * Removes a task.
   *
   * Not idempotent on purpose: a second delete is `404`, because the caller is
   * asking about an id and the honest answer is that it is not there. Answering
   * `204` to a delete of someone else's task would confirm nothing, but
   * answering it for an id that never existed would hide a client bug.
   *
   * @throws DomainError `NotFound` when the task is already gone or is not this
   * user's — the same answer for both.
   */
  async remove(userId: string, id: string): Promise<void> {
    requireUserId(userId);
    requireTaskId(id);

    if ((await this.repository.delete(userId, id)) === 0) {
      throw new DomainError(ErrorCode.NotFound, TASK_NOT_FOUND);
    }
  }

  /**
   * Marks a task complete, and stamps `completedAt` at the moment it happens.
   *
   * **Idempotent, and that is the interesting part.** Completing an
   * already-complete task writes nothing at all: the repository's conditional
   * update matches no row, so `completedAt` keeps its original value and
   * `updatedAt` is not bumped either. Re-stamping would quietly rewrite history
   * — a list sorted by completion date would reorder itself every time a user
   * double-clicked a checkbox, and "finished on the 3rd" would become "finished
   * today".
   *
   * The read afterwards is what separates the two zero-row cases: already
   * complete (return the row unchanged) from not this user's (`404`).
   *
   * @throws DomainError `NotFound` when the task is not this user's.
   */
  async complete(userId: string, id: string): Promise<Task> {
    requireUserId(userId);
    requireTaskId(id);

    await this.repository.markCompleted(userId, id, new Date());

    return toTask(await this.require(userId, id));
  }

  /**
   * Returns a task to pending and clears `completedAt`.
   *
   * The timestamp is cleared rather than kept as a record of the last
   * completion: it is the answer to "when was this completed", and a pending
   * task has no answer. Keeping it would make `completed: false` with a
   * non-null `completedAt` representable, and every consumer would then have to
   * decide which of the two fields to believe.
   *
   * Idempotent for the same reason as {@link complete}, by the same mechanism.
   *
   * @throws DomainError `NotFound` when the task is not this user's.
   */
  async uncomplete(userId: string, id: string): Promise<Task> {
    requireUserId(userId);
    requireTaskId(id);

    await this.repository.markPending(userId, id);

    return toTask(await this.require(userId, id));
  }

  /**
   * Loads a task in the caller's scope or refuses.
   *
   * @throws DomainError `NotFound` when the id is malformed, absent, or owned
   * by somebody else — one answer for all three.
   */
  private async require(userId: string, id: string): Promise<TaskRow> {
    requireTaskId(id);

    const task = await this.repository.findById(userId, id);
    if (!task) {
      throw new DomainError(ErrorCode.NotFound, TASK_NOT_FOUND);
    }

    return task;
  }
}

/**
 * Fills a list query in, rejecting anything outside the contract.
 *
 * The gateway's DTO has already validated this; the check is repeated because
 * the service guards its own invariants and this endpoint is reachable by
 * anything on the internal network. Values arrive as strings either way — there
 * is no `ValidationPipe` here by design — so parsing and validating are the
 * same pass.
 *
 * `pageSize` is checked against `PAGE_SIZES` and **rejected**, never clamped. A
 * clamped page size answers a different question from the one asked, and the
 * client has no way to tell: it would render "48 per page" over 8 rows and
 * conclude the user has 8 tasks.
 *
 * A blank `search` is dropped rather than passed on, because `contains: ''`
 * matches everything and would make an empty input box behave like a filter.
 *
 * @throws DomainError `Validation` for a non-integer or out-of-range `page`, a
 * `pageSize` outside {@link PAGE_SIZES}, an unknown `status`, `sortBy` or
 * `sortOrder`, or a search term past its length cap.
 */
export function parseListQuery(raw: RawListQuery): TaskListQuery {
  const page = parsePositiveInt(raw.page, 'page') ?? 1;
  const pageSize = parsePositiveInt(raw.pageSize, 'pageSize') ?? DEFAULT_PAGE_SIZE;

  if (!(PAGE_SIZES as readonly number[]).includes(pageSize)) {
    throw new DomainError(
      ErrorCode.Validation,
      `pageSize must be one of ${PAGE_SIZES.join(', ')}.`,
    );
  }

  const search = typeof raw.search === 'string' ? raw.search.trim() : undefined;
  if (search !== undefined && search.length > TASK_SEARCH_MAX_LENGTH) {
    throw new DomainError(
      ErrorCode.Validation,
      `search must be ${TASK_SEARCH_MAX_LENGTH} characters or fewer.`,
    );
  }

  return {
    page,
    pageSize,
    status:
      parseMember<TaskStatusFilter>(raw.status, TASK_STATUS_FILTERS, 'status') ??
      DEFAULT_TASK_STATUS,
    ...(search ? { search } : {}),
    sortBy:
      parseMember<TaskSortField>(raw.sortBy, TASK_SORT_FIELDS, 'sortBy') ?? DEFAULT_TASK_SORT_FIELD,
    sortOrder:
      parseMember<SortOrder>(raw.sortOrder, SORT_ORDERS, 'sortOrder') ?? DEFAULT_TASK_SORT_ORDER,
  };
}

/** `undefined` for an absent value; anything else must be a whole number ≥ 1. */
function parsePositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new DomainError(ErrorCode.Validation, `${field} must be a whole number of 1 or more.`);
  }

  return parsed;
}

/** `undefined` for an absent value; anything else must be one of `allowed`. */
function parseMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new DomainError(ErrorCode.Validation, `${field} must be one of ${allowed.join(', ')}.`);
  }

  return value as T;
}

/**
 * Refuses a tenant key this service cannot scope by.
 *
 * The gateway only ever sends the `sub` of a verified token, so this is
 * unreachable on the documented path. It is here because the value reaches a
 * `@db.Uuid` column — Postgres raises on anything it cannot parse, and Prisma
 * surfaces that as an unhandled failure, so a malformed id would leave as a
 * `500` rather than as an answer — and because "unreachable" is exactly the
 * kind of claim this project has repeatedly found to be false.
 *
 * @throws DomainError `Validation`, not `NotFound`: an absent tenant key is a
 * caller defect on the internal network, not a missing row.
 */
function requireUserId(userId: string): void {
  if (!UUID_PATTERN.test(userId)) {
    throw new DomainError(ErrorCode.Validation, 'A valid user id is required.');
  }
}

/**
 * @throws DomainError `NotFound` for an id that cannot name a row. Unlike the
 * tenant key this one *is* client-supplied, and "no task with that id" is the
 * honest answer — the same one a well-formed id for someone else's task gets.
 */
function requireTaskId(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new DomainError(ErrorCode.NotFound, TASK_NOT_FOUND);
  }
}

/** @throws DomainError `Validation` when the title is missing, blank or oversized. */
function requireTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';

  if (!title) {
    throw new DomainError(ErrorCode.Validation, 'A title is required.');
  }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    throw new DomainError(
      ErrorCode.Validation,
      `Title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
    );
  }

  return title;
}

/**
 * @returns the trimmed description, or `undefined` for `null` and for a value
 * that trims to nothing — both meaning "no description", which is stored as
 * `null` rather than as an empty string so there is one representation of it.
 * @throws DomainError `Validation` when it is not a string, or is oversized.
 */
function optionalDescription(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DomainError(ErrorCode.Validation, 'Description must be text.');
  }

  const description = value.trim();
  if (description.length > TASK_DESCRIPTION_MAX_LENGTH) {
    throw new DomainError(
      ErrorCode.Validation,
      `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    );
  }

  return description || undefined;
}

/**
 * Narrows a row to the public shape: drops `userId`, and renders the timestamps
 * as the ISO strings the contract promises rather than letting the serialiser
 * decide.
 */
function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: row.completed,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
