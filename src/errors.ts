/** The error classes the API returns in `error.type`. */
export type ErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'rate_limit_error'
  | 'quota_error'
  | 'api_error'
  | 'connection_error';

/** The `error` object of an API error response. */
export interface ErrorBody {
  type: ErrorType | string;
  code?: string | null;
  message: string;
  param?: string | null;
  details?: Record<string, string[]> | null;
  /** An output spec refused: every failure, in order (missing fields first); the first is `param` and `message`. */
  errors?: FieldError[];
  request_id?: string | null;
}

/** One failure of an output spec, at its dotted path. */
export interface FieldError {
  /** E.g. `output.audio.bitrate` or `output.renditions.sizes.0.fit`. */
  param: string;
  message: string;
}

export interface TranscdrErrorInit {
  type: ErrorType | string;
  status?: number;
  code?: string | null;
  param?: string | null;
  details?: Record<string, string[]> | null;
  errors?: FieldError[];
  requestId?: string | null;
  headers?: Headers;
  cause?: unknown;
}

/** Base class for every error the SDK throws. */
export class TranscdrError extends Error {
  /** `error.type` from the API, e.g. `invalid_request_error`. */
  readonly type: ErrorType | string;
  /** HTTP status; `0` when no response arrived. */
  readonly status: number;
  /** Machine-readable code, e.g. `validation_failed` or `insufficient_scope`. */
  readonly code: string | null;
  /** The offending parameter in dotted form, e.g. `output.renditions.sizes.0.width`. */
  readonly param: string | null;
  /** Per-field validation messages. */
  readonly details: Record<string, string[]> | null;
  /** A refused output spec: every failure, in order (missing fields first). Empty otherwise. */
  readonly errors: FieldError[];
  /** The `X-Request-Id` of the failed request, for support. */
  readonly requestId: string | null;
  readonly headers: Headers | null;

  constructor(message: string, init: TranscdrErrorInit) {
    super(message);
    this.name = new.target.name;
    this.type = init.type;
    this.status = init.status ?? 0;
    this.code = init.code ?? null;
    this.param = init.param ?? null;
    this.details = init.details ?? null;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId ?? null;
    this.headers = init.headers ?? null;
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400, 404, 409, 422: the request was wrong. */
export class InvalidRequestError extends TranscdrError {}
/** 401: missing, invalid, expired or revoked token. */
export class AuthenticationError extends TranscdrError {}
/** 403: the key lacks a scope, or the user lacks a role. */
export class PermissionError extends TranscdrError {}
/** 429: slow down; see `retryAfterSeconds`. */
export class RateLimitError extends TranscdrError {
  get retryAfterSeconds(): number | null {
    const value = this.headers?.get('retry-after');
    const seconds = value == null ? NaN : Number(value);
    return Number.isFinite(seconds) ? seconds : null;
  }
}
/**
 * 402: not enough credit (`insufficient_credit`), the job would cost more
 * than its `max_cost_cents` (`cost_limit_exceeded`), or the monthly spending
 * limit is reached (`spend_limit_reached`).
 */
export class QuotaError extends TranscdrError {}
/** 5xx: something went wrong on our side. */
export class APIError extends TranscdrError {}
/** No response: DNS, TLS, connection reset, or a timeout. */
export class ConnectionError extends TranscdrError {}
/** The request exceeded `timeoutMs`. */
export class TimeoutError extends ConnectionError {}
/** `jobs.waitFor` gave up before the job reached a terminal status. */
export class WaitTimeoutError extends TranscdrError {}

function classFor(type: string, status: number): typeof TranscdrError {
  switch (type) {
    case 'invalid_request_error':
      return InvalidRequestError;
    case 'authentication_error':
      return AuthenticationError;
    case 'permission_error':
      return PermissionError;
    case 'rate_limit_error':
      return RateLimitError;
    case 'quota_error':
      return QuotaError;
    case 'api_error':
      return APIError;
  }
  if (status === 401) return AuthenticationError;
  if (status === 402) return QuotaError;
  if (status === 403) return PermissionError;
  if (status === 429) return RateLimitError;
  if (status >= 500) return APIError;
  if (status >= 400) return InvalidRequestError;
  return TranscdrError;
}

function defaultType(status: number): ErrorType {
  if (status === 401) return 'authentication_error';
  if (status === 402) return 'quota_error';
  if (status === 403) return 'permission_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'api_error';
  return 'invalid_request_error';
}

/** Build the right error subclass from a response status and (parsed) body. */
export function errorFromResponse(status: number, body: unknown, headers: Headers): TranscdrError {
  const envelope = (body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined) as
    | Partial<ErrorBody>
    | undefined;
  const type = envelope?.type ?? defaultType(status);
  const message =
    envelope?.message ??
    (typeof body === 'string' && body.trim() ? body.trim().slice(0, 500) : `Request failed with status ${status}`);
  const Class = classFor(type, status);
  return new Class(message, {
    type,
    status,
    code: envelope?.code ?? null,
    param: envelope?.param ?? null,
    details: envelope?.details ?? null,
    errors: Array.isArray(envelope?.errors) ? envelope.errors : [],
    requestId: envelope?.request_id ?? headers.get('x-request-id'),
    headers,
  });
}
