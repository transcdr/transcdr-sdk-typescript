import type { RequestOptions } from '../core';
import type {
  AdminAnnouncementCreateParams,
  AdminAnnouncementUpdateParams,
  AdminJob,
  AdminOrganizationUpdateParams,
  AdminOverview,
  Announcement,
  JobStatus,
  ListParams,
  ListResponse,
  Organization,
} from '../types';
import { Resource, seg } from './base';

/** Changelog entries, as the operator console writes them. */
export class AdminAnnouncements extends Resource {
  /** Every announcement, including drafts (`published_at: null`) and service credits. */
  list(params: ListParams = {}, options?: RequestOptions): Promise<ListResponse<Announcement>> {
    return this.core.collection('/v1/admin/announcements', { ...options, query: { ...options?.query, ...params } });
  }

  /** A changelog entry. `published_at` defaults to now; `null` saves a draft. */
  create(params: AdminAnnouncementCreateParams, options?: RequestOptions): Promise<Announcement> {
    return this.core.request('POST', '/v1/admin/announcements', { ...options, body: params });
  }

  /** Changelog entries only. `published_at: null` takes one back to a draft. */
  update(id: string, params: AdminAnnouncementUpdateParams, options?: RequestOptions): Promise<Announcement> {
    return this.core.request('PATCH', `/v1/admin/announcements/${seg(id)}`, { ...options, body: params });
  }

  /** Changelog entries only. */
  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/admin/announcements/${seg(id)}`, options);
  }
}

/** Platform operator console. Answers 404 to anyone who is not an operator signed in with a session. */
export class Admin extends Resource {
  readonly announcements = new AdminAnnouncements(this.core);

  overview(options?: RequestOptions): Promise<AdminOverview> {
    return this.core.request('GET', '/v1/admin/overview', options);
  }

  /** Recent jobs across every organization. */
  jobs(params: ListParams & { status?: JobStatus } = {}, options?: RequestOptions): Promise<ListResponse<AdminJob>> {
    return this.core.collection('/v1/admin/jobs', { ...options, query: { ...options?.query, ...params } });
  }

  organizations(params: ListParams = {}, options?: RequestOptions): Promise<ListResponse<Organization>> {
    return this.core.collection('/v1/admin/organizations', { ...options, query: { ...options?.query, ...params } });
  }

  /** Change an organization's plan or suspend it. */
  updateOrganization(id: string, params: AdminOrganizationUpdateParams, options?: RequestOptions): Promise<Organization> {
    return this.core.request('PATCH', `/v1/admin/organizations/${seg(id)}`, { ...options, body: params });
  }
}
