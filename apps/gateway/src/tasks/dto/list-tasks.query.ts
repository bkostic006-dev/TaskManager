import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  PAGE_SIZES,
  SORT_ORDERS,
  TASK_SEARCH_MAX_LENGTH,
  TASK_SORT_FIELDS,
  TASK_STATUS_FILTERS,
  type SortOrder,
  type TaskSortField,
  type TaskStatusFilter,
} from '@tally/contracts';

/**
 * `GET /tasks`'s query string, validated before anything downstream sees it.
 *
 * Every field is optional and the task service supplies the defaults, so the
 * bare route works; what this class does is refuse the values that are wrong
 * rather than let them become a default silently.
 *
 * Two things here are easy to get wrong and both are load-bearing:
 *
 * - **`@Type(() => Number)`.** The global pipe runs with `transform: true` but
 *   not `enableImplicitConversion`, so a query string arrives entirely as
 *   strings and `page=1` would fail `@IsInt()` with a `400` — the endpoint
 *   would reject its own documented usage. The explicit `@Type` is what
 *   converts it.
 * - **`pageSize` is checked against a closed set, and rejected when it misses.**
 *   Not clamped. A clamped value answers a question the client did not ask and
 *   gives it no way to know: it would render "48 per page" over 8 rows and
 *   conclude the user has 8 tasks.
 */
export class ListTasksQuery {
  @IsOptional()
  @Type(() => Number)
  // Two distinct messages rather than one repeated: `page=abc` fails both
  // constraints (NaN is neither an integer nor ≥ 1), and a `details` array
  // holding the same sentence twice looks like a bug in the error contract.
  @IsInt({ message: 'page must be a whole number.' })
  @Min(1, { message: 'page must be 1 or more.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES, { message: `pageSize must be one of ${PAGE_SIZES.join(', ')}.` })
  pageSize?: number;

  @IsOptional()
  @IsIn(TASK_STATUS_FILTERS, {
    message: `status must be one of ${TASK_STATUS_FILTERS.join(', ')}.`,
  })
  status?: TaskStatusFilter;

  @IsOptional()
  @IsString()
  @MaxLength(TASK_SEARCH_MAX_LENGTH, {
    message: `search must be ${TASK_SEARCH_MAX_LENGTH} characters or fewer.`,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @IsIn(TASK_SORT_FIELDS, { message: `sortBy must be one of ${TASK_SORT_FIELDS.join(', ')}.` })
  sortBy?: TaskSortField;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: `sortOrder must be one of ${SORT_ORDERS.join(', ')}.` })
  sortOrder?: SortOrder;
}
