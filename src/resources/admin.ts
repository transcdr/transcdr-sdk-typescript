import type { RequestOptions } from '../core';
import type {
  AdminJob,
  AdminOrganizationUpdateParams,
  AdminOverview,
  JobStatus,
  ListParams,
  ListResponse,
  Organization,
} from '../types';
import { Resource, seg } from './base';

/** Platform operator console. Answers 404 to anyone who is not an operator signed in with a session. */
export class Admin extends Resource {
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
