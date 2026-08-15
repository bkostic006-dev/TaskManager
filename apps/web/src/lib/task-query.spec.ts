import type { PageMeta } from '@tally/contracts';

import {
  applyTaskListChange,
  DEFAULT_TASK_LIST_PARAMS,
  pageWithinBounds,
  parseSortValue,
  rowNumeral,
  sortValue,
  toTaskListQuery,
  type TaskListParams,
} from './task-query';

/**
 * The dashboard's query-state plumbing.
 *
 * Everything else this stage built is layout; the branching lives here, in the
 * two rules that decide which page the user is looking at. Both fail the same
 * way when they are wrong — a list that is populated on the server and empty on
 * the screen, which reads as "the search is broken" rather than as an
 * off-by-one in the page number.
 */

const params = (overrides: Partial<TaskListParams> = {}): TaskListParams => ({
  ...DEFAULT_TASK_LIST_PARAMS,
  ...overrides,
});

const meta = (overrides: Partial<PageMeta> = {}): PageMeta => ({
  page: 1,
  pageSize: 8,
  total: 47,
  totalPages: 6,
  ...overrides,
});

describe('applyTaskListChange', () => {
  it('resets to page 1 whenever a control narrows or reorders the list', () => {
    // Page 5 of an unfiltered list; "pending" almost certainly has fewer than
    // five pages, so keeping the page number lands on a blank screen the user
    // reads as "no matches".
    expect(applyTaskListChange(params({ page: 5 }), { status: 'pending' })).toEqual(
      params({ page: 1, status: 'pending' }),
    );

    expect(applyTaskListChange(params({ page: 4 }), { search: 'milk' }).page).toBe(1);
    expect(applyTaskListChange(params({ page: 4 }), { sortBy: 'title' }).page).toBe(1);
    expect(applyTaskListChange(params({ page: 4 }), { sortOrder: 'asc' }).page).toBe(1);
    expect(applyTaskListChange(params({ page: 4 }), { pageSize: 24 }).page).toBe(1);
  });

  it('keeps the page when the page itself is what changed', () => {
    expect(applyTaskListChange(params({ page: 1 }), { page: 3 }).page).toBe(3);
  });

  it('does not reset when a control re-emits the value it already had', () => {
    // Mantine's Select fires onChange on re-selection; without the equality
    // check that would silently throw the user back to page 1.
    expect(applyTaskListChange(params({ page: 3 }), { sortBy: 'createdAt' }).page).toBe(3);
  });

  it('lets a filter override a page carried in the same change', () => {
    const next = applyTaskListChange(params(), { page: 4, status: 'completed' });

    expect(next).toMatchObject({ page: 1, status: 'completed' });
  });
});

describe('pageWithinBounds', () => {
  it('pulls the page back when the list shrank under it', () => {
    // Standing on page 6 of 47; a delete takes the total to 40, so page 6 no
    // longer exists and a request for it would succeed and return nothing.
    expect(pageWithinBounds(params({ page: 6 }), meta({ total: 40, totalPages: 5 })).page).toBe(5);
    // A filter that matched nothing reports zero pages, and there is no page 0.
    expect(pageWithinBounds(params({ page: 3 }), meta({ total: 0, totalPages: 0 })).page).toBe(1);
  });

  it('returns the same object when the page is already in range', () => {
    // Identity, not equality: the dashboard assigns this straight back into
    // state, and a fresh object on every render is a re-render loop.
    const current = params({ page: 2 });

    expect(pageWithinBounds(current, meta())).toBe(current);
  });
});

describe('toTaskListQuery', () => {
  it('omits a blank search and trims a real one', () => {
    // `search=` is a LIKE '%%' matching every row, so an empty box would look
    // like a filter that does nothing.
    expect(toTaskListQuery(params({ search: '   ' }))).not.toHaveProperty('search');
    expect(toTaskListQuery(params({ search: '  milk ' }))).toMatchObject({ search: 'milk' });
  });
});

describe('numerals and sort values', () => {
  it('counts row numerals across pages, and round-trips the sort control', () => {
    expect(rowNumeral(meta({ page: 2 }), 0)).toBe('09');
    expect(rowNumeral(meta({ page: 6 }), 6)).toBe('47');

    const current = params({ sortBy: 'completed', sortOrder: 'asc' });
    expect(parseSortValue(sortValue(current))).toEqual({ sortBy: 'completed', sortOrder: 'asc' });
    expect(parseSortValue('dueDate:sideways')).toEqual({
      sortBy: DEFAULT_TASK_LIST_PARAMS.sortBy,
      sortOrder: DEFAULT_TASK_LIST_PARAMS.sortOrder,
    });
  });
});
