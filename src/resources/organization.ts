import type { RequestOptions } from '../core';
import type { ListResponse, MemberCreateParams, Organization, OrganizationUpdateParams, Role, User } from '../types';
import { Resource, seg } from './base';

export class Members extends Resource {
  list(options?: RequestOptions): Promise<ListResponse<User>> {
    return this.core.collection('/v1/organization/members', options);
  }

  create(params: MemberCreateParams, options?: RequestOptions): Promise<User> {
    return this.core.request('POST', '/v1/organization/members', { ...options, body: params });
  }

  update(id: string, params: { role: Role }, options?: RequestOptions): Promise<User> {
    return this.core.request('PATCH', `/v1/organization/members/${seg(id)}`, { ...options, body: params });
  }

  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/organization/members/${seg(id)}`, options);
  }
}

export class OrganizationResource extends Resource {
  readonly members = new Members(this.core);

  retrieve(options?: RequestOptions): Promise<Organization> {
    return this.core.request('GET', '/v1/organization', options);
  }

  update(params: OrganizationUpdateParams, options?: RequestOptions): Promise<Organization> {
    return this.core.request('PATCH', '/v1/organization', { ...options, body: params });
  }

  /** Issue a new `job_webhook_secret` (signs per-job `webhook_url` deliveries). */
  rotateJobWebhookSecret(options?: RequestOptions): Promise<Organization> {
    return this.core.request('POST', '/v1/organization/rotate-job-webhook-secret', options);
  }
}
