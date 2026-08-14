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
