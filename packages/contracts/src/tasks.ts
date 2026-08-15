/**
 * A task as every consumer outside the task service sees it.
 *
 * `userId` is deliberately absent. Every query is scoped by the caller's own id
 * before a row is loaded, so the field would carry no information a client does
 * not already have — and a shape that never contains a tenant key cannot leak
 * one through a response that was assembled from the wrong scope.
 *
 * The timestamps are ISO strings, not `Date`s, for the same reason `AuthUser`'s
 * are: this shape crosses an HTTP boundary and is JSON on arrival, so typing
 * them as `Date` would be a lie the consumer discovers at runtime.
 *
 * `completedAt` is `null` rather than optional so "never completed" and
 * "completed at an unknown time" cannot be confused — the field is always there.
 */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The completion filter the list endpoint accepts.
 *
 * `all` is a value rather than the absence of the parameter so the frontend's
 * three-way control has a name for every position, and so an unrecognised
 * filter is a `400` instead of silently meaning "everything".
 */
export const TASK_STATUS_FILTERS = ['all', 'completed', 'pending'] as const;
export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

/**
 * Sortable columns.
 *
 * `createdAt` is the brief's "sorting by date" — there is no `dueDate` in this
 * model, by decision — and `completed` is its "sorting by completion status".
 * `title` is neither, and is here because a list this size is unusable without
 * an alphabetical view.
 */
export const TASK_SORT_FIELDS = ['createdAt', 'completed', 'title'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * What the list endpoint assumes when a parameter is omitted.
 *
 * Newest first, everything included: the view a user wants on landing. These
 * are shared rather than restated in the DTO and again in the service, because
 * a default that differs between the validator and the query builder is a bug
 * that only shows up as rows in an order nobody asked for.
 */
export const DEFAULT_TASK_STATUS: TaskStatusFilter = 'all';
export const DEFAULT_TASK_SORT_FIELD: TaskSortField = 'createdAt';
export const DEFAULT_TASK_SORT_ORDER: SortOrder = 'desc';

/**
 * A list request after validation and defaulting — every field present, so the
 * query builder never has to decide what an absent value meant.
 *
 * `search` stays optional because "no search" is genuinely different from
 * searching for the empty string: the latter matches every row and would make
 * an empty input box behave like a filter.
 */
export interface TaskListQuery {
  page: number;
  pageSize: number;
  status: TaskStatusFilter;
  search?: string;
  sortBy: TaskSortField;
  sortOrder: SortOrder;
}

/**
 * Pagination as the client needs it: enough to render a page selector without
 * a second request.
 *
 * `total` is the count *after* filtering and searching, not the size of the
 * user's backlog — otherwise the page selector offers pages that come back
 * empty. `totalPages` is derived rather than computed by the client so the
 * rounding rule has one definition.
 */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The list endpoint's whole response. */
export interface TaskListResponse {
  data: Task[];
  meta: PageMeta;
}

/**
 * Field limits, enforced by the gateway's DTOs and re-checked by the service.
 *
 * They exist to bound a write, not to express product policy: `title` is one
 * line, `description` is a note, and an unbounded search term becomes a
 * `LIKE '%…%'` scan over every row the user owns.
 */
export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_SEARCH_MAX_LENGTH = 100;
