import type { RequestOptions } from '../core';
import type { PagePromise } from '../pagination';
import type { Announcement, AnnouncementListParams, ListParams, ListResponse } from '../types';
import { Resource } from './base';

/** What's new, and service credits, for the signed-in user. */
export class Announcements extends Resource {
  /**
   * Newest first. With `unseen: true`, only what this user has not seen yet,
   * with service credits before changelog entries.
   */
  list(params: AnnouncementListParams = {}, options?: RequestOptions): Promise<ListResponse<Announcement>> {
    const { unseen, ...rest } = params;
    return this.core.collection('/v1/announcements', {
      ...options,
      query: { ...options?.query, ...rest, unseen: unseen ? 'true' : undefined },
    });
  }

  /** Remember that this user has seen these announcements. Idempotent; session tokens only. */
  async markSeen(ids: string[], options?: RequestOptions): Promise<void> {
    if (!ids.length) return;
    await this.core.request('POST', '/v1/announcements/seen', { ...options, body: { ids } });
  }

  /** Mark everything this user can see as seen. Session tokens only. */
  async markAllSeen(options?: RequestOptions): Promise<void> {
    await this.core.request('POST', '/v1/announcements/seen', { ...options, body: { all: true } });
  }
}

/** The public changelog; no key needed. */
export class Changelog extends Resource {
  /** Published changelog entries, newest first. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Announcement> {
    return this.core.list('/v1/changelog', { ...params }, options);
  }
}
