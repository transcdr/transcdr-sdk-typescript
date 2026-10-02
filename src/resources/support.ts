import type { RequestOptions } from '../core';
import type {
  ListResponse,
  SupportPreferences,
  SupportPreferencesUpdateParams,
  SupportTicket,
  SupportTicketCreateParams,
  SupportTicketListParams,
} from '../types';
import { Resource, seg } from './base';

const path = (id: string) => `/v1/support/tickets/${seg(id)}`;

export class SupportTickets extends Resource {
  /** Your tickets, most recent activity first. */
  list(params: SupportTicketListParams = {}, options?: RequestOptions): Promise<ListResponse<SupportTicket>> {
    const status = Array.isArray(params.status) ? params.status.join(',') : params.status;
    return this.core.collection('/v1/support/tickets', {
      ...options,
      query: { ...options?.query, status, limit: params.limit },
    });
  }

  /** Open a ticket. Returns it with its first message. */
  create(params: SupportTicketCreateParams, options?: RequestOptions): Promise<SupportTicket> {
    return this.core.request('POST', '/v1/support/tickets', { ...options, body: params });
  }

  /** One ticket with its messages. `id` is `tck_…` or the reference, e.g. `TCK-1001`. */
  retrieve(id: string, options?: RequestOptions): Promise<SupportTicket> {
    return this.core.request('GET', path(id), options);
  }

  /** Add a message. Replying to a resolved or closed ticket reopens it. Returns the ticket. */
  reply(id: string, body: string, options?: RequestOptions): Promise<SupportTicket> {
    return this.core.request('POST', `${path(id)}/messages`, { ...options, body: { body } });
  }

  /** Mark the ticket resolved. It closes on its own after a while without replies. */
  resolve(id: string, options?: RequestOptions): Promise<SupportTicket> {
    return this.core.request('POST', `${path(id)}/resolve`, options);
  }

  /** Reopen a resolved or closed ticket. */
  reopen(id: string, options?: RequestOptions): Promise<SupportTicket> {
    return this.core.request('POST', `${path(id)}/reopen`, options);
  }
}

/** Whether ticket emails are sent to the key's user. */
export class SupportPreferencesResource extends Resource {
  retrieve(options?: RequestOptions): Promise<SupportPreferences> {
    return this.core.request('GET', '/v1/support/preferences', options);
  }

  update(params: SupportPreferencesUpdateParams, options?: RequestOptions): Promise<SupportPreferences> {
    return this.core.request('PUT', '/v1/support/preferences', { ...options, body: params });
  }
}

/**
 * Support tickets: report a problem or ask a question, and follow the conversation. Owners and admins see every
 * ticket in the organization; members see the ones they opened. Scopes: `support:read`, `support:write`.
 *
 * Creates and replies are not retried automatically: a retry after a lost response could file a duplicate.
 */
export class Support extends Resource {
  readonly tickets = new SupportTickets(this.core);
  readonly preferences = new SupportPreferencesResource(this.core);
}
