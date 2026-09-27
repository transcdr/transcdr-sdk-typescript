import type { RequestOptions } from '../core';
import type {
  AuthResponse,
  ListResponse,
  Me,
  MemberCreateParams,
  Membership,
  Organization,
  OrganizationCreateParams,
  OrganizationUpdateParams,
  Role,
  User,
} from '../types';
import { Resource, seg } from './base';

export class Members extends Resource {
  list(options?: RequestOptions): Promise<ListResponse<User>> {
    return this.core.collection('/v1/organization/members', options);
  }

  /**
   * Add a member. An existing Transcdr user is given access; an unknown email
   * creates the user, with `name` and `password`.
   */
  create(params: MemberCreateParams, options?: RequestOptions): Promise<User> {
    return this.core.request('POST', '/v1/organization/members', { ...options, body: params });
  }

  update(id: string, params: { role: Role }, options?: RequestOptions): Promise<User> {
    return this.core.request('PATCH', `/v1/organization/members/${seg(id)}`, { ...options, body: params });
  }

  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/organization/members/${seg(id)}`, options);
  }

  /**
   * Leave the organization: remove the signed-in user's own membership (sessions
   * only). The session then has no access here; switch to another organization
   * or sign in again. The last owner cannot leave (409 `last_owner`).
   */
  async leave(options?: RequestOptions): Promise<void> {
    const me = await this.core.request<Me>('GET', '/v1/me', options);
    if (!me.user) throw new TypeError('members.leave() needs a session token, not an API key');
    await this.del(me.user.id, options);
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

/** The organizations the signed-in user belongs to (session tokens only). */
export class Organizations extends Resource {
  list(options?: RequestOptions): Promise<ListResponse<Membership>> {
    return this.core.collection('/v1/organizations', options);
  }

  /**
   * Create an organization owned by the caller. Returns a session token in it;
   * the current token keeps working.
   */
  create(params: OrganizationCreateParams, options?: RequestOptions): Promise<AuthResponse> {
    return this.core.request('POST', '/v1/organizations', { ...options, body: params });
  }
}
