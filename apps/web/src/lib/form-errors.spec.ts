import { ErrorCode } from '@tally/contracts';

import { ApiRequestError } from './api-error';
import { isFormFailure } from './form-errors';

/**
 * The one decision that keeps the auth forms honest: an inline "check the form
 * below" is a claim about what the user typed, and a toast is a claim about the
 * deployment. Getting the split wrong once showed both at the same time for a
 * `429`, blaming a form with nothing wrong in it.
 */

function failure(statusCode: number, error: ErrorCode): ApiRequestError {
  return new ApiRequestError({ statusCode, error, message: 'Something happened.' });
}

describe('isFormFailure', () => {
  it.each([
    ['400 named a bad field', 400, ErrorCode.Validation],
    ['401 rejected the credential pair', 401, ErrorCode.Unauthorized],
    ['409 rejected the email as taken', 409, ErrorCode.Conflict],
  ])('is true when %s', (_case, statusCode, error) => {
    expect(isFormFailure(failure(statusCode, error))).toBe(true);
  });

  it.each([
    ['429 throttled the request', 429, ErrorCode.Throttled],
    ['500 broke inside the gateway', 500, ErrorCode.Internal],
    ['503 had no service to call', 503, ErrorCode.Upstream],
  ])('is false when %s', (_case, statusCode, error) => {
    expect(isFormFailure(failure(statusCode, error))).toBe(false);
  });

  it('is false for the request that never got a response at all', () => {
    expect(isFormFailure(failure(0, ErrorCode.Upstream))).toBe(false);
  });

  it('is false when nothing failed', () => {
    expect(isFormFailure(null)).toBe(false);
  });
});
