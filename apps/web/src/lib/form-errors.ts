import type { ApiRequestError } from './api-error';

/**
 * The gateway's per-field validation message for one input, if it named that
 * field. Only the first constraint is shown: a field with three problems still
 * only has room for one line under it.
 */
export function fieldError(error: ApiRequestError | null, field: string): string | undefined {
  return error?.details?.[field]?.[0];
}
