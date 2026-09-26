import type { ListResponse } from './types';

/** Fetch one page given a cursor (`undefined` for the first page). */
export type PageFetcher<T> = (cursor: string | undefined) => Promise<ListResponse<T>>;

/**
 * The result of a `list()` call: await it for the first page, or iterate it
 * to walk every page lazily.
 *
 * ```ts
 * const page = await client.jobs.list({ limit: 50 });
 * for await (const job of client.jobs.list({ status: 'completed' }).autoPaginate()) { … }
 * ```
 */
export class PagePromise<T> implements PromiseLike<ListResponse<T>>, AsyncIterable<T> {
  private readonly fetchPage: PageFetcher<T>;
  private readonly startCursor: string | undefined;
  private first: Promise<ListResponse<T>> | null = null;

  constructor(fetchPage: PageFetcher<T>, startCursor?: string) {
    this.fetchPage = fetchPage;
    this.startCursor = startCursor;
  }

  private firstPage(): Promise<ListResponse<T>> {
    this.first ??= this.fetchPage(this.startCursor);
    return this.first;
  }

  then<R1 = ListResponse<T>, R2 = never>(
    onfulfilled?: ((value: ListResponse<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.firstPage().then(onfulfilled, onrejected);
  }

  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<ListResponse<T> | R> {
    return this.firstPage().catch(onrejected);
  }

  /** Every item across every page, fetched one page at a time. */
  async *autoPaginate(): AsyncGenerator<T, void, undefined> {
    let page = await this.firstPage();
    for (;;) {
      for (const item of page.data) yield item;
      if (!page.has_more || !page.next_cursor) return;
      page = await this.fetchPage(page.next_cursor);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.autoPaginate();
  }

  /** Collect every item into an array, stopping after `max` items if given. */
  async toArray(max = Infinity): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this.autoPaginate()) {
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  }
}

/**
 * Accept the list envelope, and also a bare array (some single-page
 * collections may be returned that way), normalising to the envelope.
 */
export function asList<T>(body: unknown): ListResponse<T> {
  if (Array.isArray(body)) {
    return { object: 'list', data: body as T[], has_more: false, next_cursor: null };
  }
  const list = (body ?? {}) as Partial<ListResponse<T>>;
  return {
    object: 'list',
    data: Array.isArray(list.data) ? list.data : [],
    has_more: Boolean(list.has_more),
    next_cursor: list.next_cursor ?? null,
  };
}
