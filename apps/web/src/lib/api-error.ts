import axios from 'axios';
import { type ApiError, ErrorCode } from '@tally/contracts';

/**
 * The failure type every layer above the transport speaks.
 *
 * It lives here rather than in `api-client.ts` because it is not a transport
 * detail: hooks type their mutations on it, forms read `details` off it, and a
 * drawer renders its `message`. Keeping it in the HTTP module meant a component
 * that never makes a request still imported the module that owns axios — true
 * only as a type, and erased at compile time, but it made the one rule this app
 * is checked against ("no UI file imports the client") read as broken when it
 * was not.
 */

/**
 * A gateway error, in the one shape the gateway's global exception filter emits.
 *
 * Thrown in place of `AxiosError` so a component rendering a failure never has
 * to know the transport. `statusCode` is `0` for a request that never got a
 * response at all — the server being down is not a status code.
 */
export class ApiRequestError extends Error implements ApiError {
  readonly statusCode: number;
  readonly error: ErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(body: ApiError, options?: { cause?: unknown }) {
    super(body.message, options);
    this.name = 'ApiRequestError';
    this.statusCode = body.statusCode;
    this.error = body.error;
    this.details = body.details;
  }
}

/** Copy for the case the gateway never answered — there is no server message to show. */
const UNREACHABLE: ApiError = {
  statusCode: 0,
  error: ErrorCode.Upstream,
  message: "We couldn't reach the server. Check your connection and try again.",
};

function isApiErrorBody(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const body = value as Partial<ApiError>;
  return typeof body.statusCode === 'number' && typeof body.message === 'string';
}

/**
 * Normalises anything thrown by axios into an {@link ApiRequestError}.
 *
 * The gateway answers every failure with `{ statusCode, error, message,
 * details? }`, so the happy path is to pass that through untouched — the
 * message a user sees is the one the API wrote, not one invented here. A
 * response that is *not* that shape (a proxy's HTML error page, a body the
 * browser could not parse) is reported by status alone rather than rendered.
 */
export function toApiRequestError(cause: unknown): ApiRequestError {
  if (cause instanceof ApiRequestError) {
    return cause;
  }

  // `isAxiosError` rather than `instanceof`: it duck-types on a flag axios sets,
  // so it still recognises an error raised by a second copy of the module — a
  // bundler chunk boundary, or a test that reset the module registry.
  if (axios.isAxiosError(cause)) {
    const response = cause.response;
    if (response === undefined) {
      return new ApiRequestError(UNREACHABLE, { cause });
    }
    if (isApiErrorBody(response.data)) {
      return new ApiRequestError(response.data, { cause });
    }
    return new ApiRequestError(
      {
        statusCode: response.status,
        error: ErrorCode.Internal,
        message: 'Something went wrong. Try again.',
      },
      { cause },
    );
  }

  return new ApiRequestError(
    { statusCode: 0, error: ErrorCode.Internal, message: 'Something went wrong. Try again.' },
    { cause },
  );
}
