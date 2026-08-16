import type { ApiRequestError } from './api-error';

/**
 * The gateway's per-field validation message for one input, if it named that
 * field. Only the first constraint is shown: a field with three problems still
 * only has room for one line under it.
 */
export function fieldError(error: ApiRequestError | null, field: string): string | undefined {
  return error?.details?.[field]?.[0];
}

/**
 * The statuses that are a verdict on what was submitted: `400` names a bad
 * field, `401` rejects the credential pair, `409` rejects an email already
 * taken.
 */
const FORM_FAILURE_STATUSES = new Set([400, 401, 409]);

/**
 * Whether a failure is about the values the user typed, and so belongs beside
 * them rather than in a toast.
 *
 * The two are exclusive by design: a throttled, unreachable or broken gateway
 * says nothing about the form, and answering it with "check the form below"
 * blames the user for the deployment.
 */
export function isFormFailure(error: ApiRequestError | null): boolean {
  return error !== null && FORM_FAILURE_STATUSES.has(error.statusCode);
}
