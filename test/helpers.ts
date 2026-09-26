import { vi } from 'vitest';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = Response | Error | ((call: Call) => Response | Error);

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_test', ...headers },
  });
}

/** A fetch that replays `replies` in order and records every call. */
export function mockFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => (headers[key] = value));
    let body: unknown = init.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        // leave as text
      }
    }
    const call: Call = { url: String(input), method: init.method ?? 'GET', headers, body };
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    const reply = typeof next === 'function' ? next(call) : next;
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { fetch: fn, calls };
}
