import { ConnectionError, TimeoutError, TranscdrError, errorFromResponse } from './errors';
import { PagePromise, asList } from './pagination';
import type { ListResponse } from './types';

export const DEFAULT_BASE_URL = 'https://api.transcdr.com';
export const SDK_VERSION = '0.1.0';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** A secret API key (`tdk_live_…` / `tdk_test_…`) or a session token (`tds_…`). */
  apiKey?: string | null;
  /** Default `https://api.transcdr.com`. An empty string means "same origin" in browsers. */
  baseUrl?: string;
  /** A custom `fetch` (defaults to the global one). */
  fetch?: FetchLike;
  /** Retries for 429, 5xx and network failures. Default 2. */
  maxRetries?: number;
  /** Per-attempt timeout. Default 60 000 ms. */
  timeoutMs?: number;
  /** Base delay for exponential backoff. Default 500 ms. */
  retryDelayMs?: number;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
}

export type QueryValue = string | number | boolean | null | undefined | Record<string, string>;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Makes a POST safely retryable. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Override the client's retry count for this call. */
  maxRetries?: number;
  timeoutMs?: number;
}

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);
const MAX_BACKOFF_MS = 8_000;

/** A random idempotency key. */
export function idempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Serialise a query object; `metadata: {k: v}` becomes `metadata[k]=v`. */
export function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      for (const [inner, innerValue] of Object.entries(value)) {
        if (innerValue !== undefined && innerValue !== null) params.append(`${key}[${inner}]`, String(innerValue));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** The HTTP engine every resource shares. */
export class Core {
  apiKey: string | null;
  readonly baseUrl: string;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly retryDelayMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey ?? null;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.defaultHeaders = options.headers ?? {};
    const f = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) throw new Error('No fetch implementation found: pass `fetch` in the Transcdr options (Node 18+ has one).');
    // Bind so a global fetch keeps its receiver in browsers.
    this.fetchImpl = options.fetch ?? ((input, init) => f.call(globalThis, input, init));
  }

  /** Resolve an API path (`/v1/…`) or an absolute URL. */
  url(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  /** The raw fetch, for uploads to presigned URLs. */
  rawFetch(input: string, init?: RequestInit): Promise<Response> {
    return this.fetchImpl(input, init);
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const upper = method.toUpperCase();
    const url = this.url(path) + buildQuery(options.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const retryable = RETRYABLE_METHODS.has(upper) || Boolean(options.idempotencyKey);
    const maxRetries = retryable ? (options.maxRetries ?? this.maxRetries) : 0;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchWithTimeout(url, { method: upper, headers, body }, timeoutMs, options.signal);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        const wrapped =
          error instanceof TimeoutError
            ? error
            : new ConnectionError(`Could not reach the Transcdr API: ${(error as Error)?.message ?? error}`, {
                type: 'connection_error',
                cause: error,
              });
        if (attempt < maxRetries) {
          await sleep(this.backoff(attempt, null), options.signal);
          continue;
        }
        throw wrapped;
      }

      if (response.ok) return (await parseBody(response)) as T;

      const shouldRetry = response.status === 429 || response.status >= 500;
      if (shouldRetry && attempt < maxRetries) {
        // Drain so the connection can be reused.
        await response.text().catch(() => undefined);
        await sleep(this.backoff(attempt, response.headers.get('retry-after')), options.signal);
        continue;
      }
      throw errorFromResponse(response.status, await parseBody(response).catch(() => null), response.headers);
    }
  }

  /** A list endpoint as a `PagePromise` that can also auto-paginate. */
  list<T>(path: string, query: Record<string, QueryValue> = {}, options: RequestOptions = {}): PagePromise<T> {
    const { cursor, ...rest } = query;
    return new PagePromise<T>(
      async (next) =>
        asList<T>(
          await this.request<unknown>('GET', path, { ...options, query: { ...rest, cursor: next ?? undefined } }),
        ),
      typeof cursor === 'string' ? cursor : undefined,
    );
  }

  /** Fetch a non-paginated collection and normalise it to a list. */
  async collection<T>(path: string, options: RequestOptions = {}): Promise<ListResponse<T>> {
    return asList<T>(await this.request<unknown>('GET', path, options));
  }

  private backoff(attempt: number, retryAfter: string | null): number {
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 60_000));
    }
    const exp = Math.min(this.retryDelayMs * 2 ** attempt, MAX_BACKOFF_MS);
    // Full jitter in [exp/2, exp].
    return exp / 2 + Math.random() * (exp / 2);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer =
      timeoutMs > 0 && Number.isFinite(timeoutMs)
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new TimeoutError(`Request timed out after ${timeoutMs} ms.`, { type: 'connection_error', cause: error });
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('json') || /^[\s]*[{[]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new TranscdrError('The API returned malformed JSON.', {
          type: 'api_error',
          status: response.status,
          requestId: response.headers.get('x-request-id'),
        });
      }
    }
  }
  return text;
}
