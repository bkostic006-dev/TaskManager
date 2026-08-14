/**
 * Domain error codes raised by the services and translated to HTTP by the
 * gateway's global exception filter.
 *
 * The services know nothing about HTTP — they raise one of these, and the
 * gateway owns the mapping. Adding a member here without adding it to the
 * gateway's map is a bug: the fallback is `500`.
 */
export enum ErrorCode {
  /** Credentials missing, malformed, expired, or already rotated. */
  Unauthorized = 'UNAUTHORIZED',
  /** The resource does not exist, or belongs to another user. Never `403`. */
  NotFound = 'NOT_FOUND',
  /** A uniqueness constraint was violated — currently only a taken email. */
  Conflict = 'CONFLICT',
  /** Request shape or values rejected by a DTO validator. */
  Validation = 'VALIDATION',
  /** A downstream service was unreachable or exceeded its timeout budget. */
  Upstream = 'UPSTREAM_UNAVAILABLE',
  /** Anything unplanned. Carries no detail outward — never leak a stack. */
  Internal = 'INTERNAL',
}

/**
 * The single response body shape for every error the gateway emits.
 *
 * One shape for all failures means a client can branch on `statusCode`
 * without sniffing the payload. `details` carries per-field validation
 * messages and is absent on everything else.
 */
export interface ApiError {
  statusCode: number;
  error: ErrorCode;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * The plan's API table, executable. Every status code the stack emits comes
 * from this map and from nowhere else.
 *
 * It is shared rather than gateway-local because the internal hop is also
 * HTTP: a service renders its `DomainError` with the status from this table,
 * and the gateway reads the code back off the body and re-raises. One table
 * means the two ends cannot drift into disagreeing about what a `CONFLICT` is.
 */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.Validation]: 400,
  [ErrorCode.Unauthorized]: 401,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.Conflict]: 409,
  [ErrorCode.Internal]: 500,
  [ErrorCode.Upstream]: 503,
};

/**
 * A failure a service raises on purpose, tagged with the domain reason rather
 * than an HTTP status.
 *
 * Services stay HTTP-ignorant: they throw this, and the edge that owns the
 * response — each service's own translating filter inward, the gateway's
 * global filter outward — converts the code through {@link ERROR_STATUS}.
 * Anything that is *not* a `DomainError` is unplanned and becomes a `500` with
 * its message swallowed.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
