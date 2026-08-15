import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_TASK_SORT_FIELD,
  DEFAULT_TASK_SORT_ORDER,
  DEFAULT_TASK_STATUS,
  TASK_SORT_FIELDS,
  SORT_ORDERS,
  type PageMeta,
  type SortOrder,
  type TaskListQuery,
  type TaskSortField,
  type TaskStatusFilter,
} from '@tally/contracts';

/**
 * The dashboard's view state, and the rules that keep it consistent with what
 * the list endpoint will actually answer.
 *
 * It lives outside React on purpose. Every interesting bug in a paginated,
 * filtered list is a state-transition bug — a filter that leaves the page
 * number where it was, a delete that empties the last page — and those are
 * cheap to test as pure functions and expensive to test through a rendered
 * table. The dashboard holds one `TaskListParams` in `useState` and changes it
 * only through the functions below.
 */

/**
 * What the UI holds. Differs from {@link TaskListQuery} in one place: `search`
 * is always a string here, because a controlled input has no "absent" value,
 * and {@link toTaskListQuery} is what turns an empty box back into an omitted
 * parameter.
 */
export interface TaskListParams {
  page: number;
  pageSize: number;
  status: TaskStatusFilter;
  search: string;
  sortBy: TaskSortField;
  sortOrder: SortOrder;
}

/** The view on landing: everything, newest first, eight to a page. */
export const DEFAULT_TASK_LIST_PARAMS: TaskListParams = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  status: DEFAULT_TASK_STATUS,
  search: '',
  sortBy: DEFAULT_TASK_SORT_FIELD,
  sortOrder: DEFAULT_TASK_SORT_ORDER,
};

/**
 * Applies one control's change and re-derives the page number.
 *
 * **Narrowing the list resets the page to 1, and that is the whole reason this
 * function exists.** Search for something on page 5 and the matches almost
 * certainly do not fill five pages, so keeping the page number lands the user
 * on an empty result they will read as "no matches" — the list is not broken,
 * they are just past the end of it. Changing the page itself is the one change
 * that keeps the page, because it *is* the page.
 *
 * A change that sets the same value it already had is not a change: re-selecting
 * the current sort on page 3 leaves you on page 3. A change carrying both a page
 * and a filter resets, because the filter is the more recent intent.
 */
export function applyTaskListChange(
  current: TaskListParams,
  change: Partial<TaskListParams>,
): TaskListParams {
  const next = { ...current, ...change };

  const narrowed = (Object.keys(change) as (keyof TaskListParams)[]).some(
    (key) => key !== 'page' && !Object.is(current[key], next[key]),
  );

  return narrowed ? { ...next, page: 1 } : next;
}

/**
 * Pulls the page back inside the range the server just reported.
 *
 * Deleting the only row on the last page, or completing the last pending task
 * while the Pending filter is on, shrinks `totalPages` under the page the user
 * is standing on. Nothing else notices: the next request is valid, in range and
 * empty. Returns `params` by identity when it is already in bounds, so a caller
 * can assign the result unconditionally without looping.
 */
export function pageWithinBounds(params: TaskListParams, meta: PageMeta): TaskListParams {
  const lastPage = Math.max(1, meta.totalPages);
  return params.page <= lastPage ? params : { ...params, page: lastPage };
}

/**
 * Narrows the view state to the wire contract.
 *
 * An empty or whitespace-only box is *no search*, not a search for nothing:
 * sent as `search=`, it would be a `LIKE '%%'` matching every row, so the
 * control would look like a filter that does nothing.
 */
export function toTaskListQuery(params: TaskListParams): TaskListQuery {
  const search = params.search.trim();
  const query: TaskListQuery = {
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };
  return search === '' ? query : { ...query, search };
}

/** True when anything is narrowing the list — which of the two empty states to show. */
export function isFiltered(params: TaskListParams): boolean {
  return params.search.trim() !== '' || params.status !== DEFAULT_TASK_STATUS;
}

/**
 * The sort control's options.
 *
 * One `Select` value carries both `sortBy` and `sortOrder`, because "Oldest
 * first" is one idea to a user and two parameters to the API. The brief's
 * "sorting by date and completion status" is the first two and the last two;
 * A–Z is neither, and is here because a 47-row list is hard to scan without it.
 */
export const TASK_SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Recently added' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'title:asc', label: 'A–Z' },
  { value: 'completed:asc', label: 'Pending first' },
  { value: 'completed:desc', label: 'Completed first' },
] as const;

/** The `Select` value for the current sort. */
export function sortValue(params: TaskListParams): string {
  return `${params.sortBy}:${params.sortOrder}`;
}

/**
 * Splits a sort option back into the two parameters, falling back to the
 * default for anything unrecognised — a `Select` cannot produce one, but a
 * silent default here is better than sending a value the gateway answers `400`
 * for.
 */
export function parseSortValue(value: string): Pick<TaskListParams, 'sortBy' | 'sortOrder'> {
  const [field, order] = value.split(':');
  const sortBy = (TASK_SORT_FIELDS as readonly string[]).includes(field)
    ? (field as TaskSortField)
    : DEFAULT_TASK_SORT_FIELD;
  const sortOrder = (SORT_ORDERS as readonly string[]).includes(order)
    ? (order as SortOrder)
    : DEFAULT_TASK_SORT_ORDER;
  return { sortBy, sortOrder };
}

/**
 * "Showing 1–8 of 47" — the range readout beside the pager.
 *
 * Computed from `meta` rather than from the rendered rows so it still reads
 * correctly while a page is being fetched and the previous page is on screen.
 */
export function rangeLabel(meta: PageMeta): string {
  if (meta.total === 0) {
    return 'Showing 0 of 0';
  }
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);
  return `Showing ${String(first)}–${String(last)} of ${String(meta.total)}`;
}

/**
 * A row's position in the whole filtered list, zero-padded — the numeral spine.
 *
 * It counts across pages rather than restarting at 01 on page 2, so the number
 * a reviewer reads out matches the "of 47" beside the pager.
 */
export function rowNumeral(meta: PageMeta, index: number): string {
  return String((meta.page - 1) * meta.pageSize + index + 1).padStart(2, '0');
}
