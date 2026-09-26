import type { RequestOptions } from '../core';
import type { PagePromise } from '../pagination';
import type {
  Automation,
  AutomationCreateParams,
  AutomationItem,
  AutomationRun,
  AutomationUpdateParams,
  BrowseParams,
  Connection,
  ConnectionCreateParams,
  ConnectionTestResult,
  ConnectionUpdateParams,
  Delivery,
  ListParams,
  ListResponse,
  RemoteObject,
} from '../types';
import { Resource, seg } from './base';

/** Your storage: where inputs come from and outputs go. */
export class Connections extends Resource {
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Connection> {
    return this.core.list('/v1/connections', { ...params }, options);
  }

  listAll(params: ListParams = {}, max?: number): Promise<Connection[]> {
    return this.list(params).toArray(max);
  }

  /** The connection is tested before it is saved; a failing one is refused with a 422. */
  create(params: ConnectionCreateParams, options?: RequestOptions): Promise<Connection> {
    return this.core.request('POST', '/v1/connections', { ...options, body: params });
  }

  retrieve(id: string, options?: RequestOptions): Promise<Connection> {
    return this.core.request('GET', `/v1/connections/${seg(id)}`, options);
  }

  /** Config merges; an omitted secret is kept and `""` clears it. */
  update(id: string, params: ConnectionUpdateParams, options?: RequestOptions): Promise<Connection> {
    return this.core.request('PATCH', `/v1/connections/${seg(id)}`, { ...options, body: params });
  }

  /** Refused with 409 while an automation uses the connection. */
  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/connections/${seg(id)}`, options);
  }

  /** Check the credentials and reachability again. */
  test(id: string, options?: RequestOptions): Promise<ConnectionTestResult> {
    return this.core.request('POST', `/v1/connections/${seg(id)}/test`, options);
  }

  /** List files under a prefix (up to 1,000; `has_more` means the listing was cut short). */
  browse(id: string, params: BrowseParams = {}, options?: RequestOptions): Promise<ListResponse<RemoteObject>> {
    return this.core.collection(`/v1/connections/${seg(id)}/browse`, {
      ...options,
      query: { ...options?.query, prefix: params.prefix, recursive: params.recursive ? 'true' : undefined },
    });
  }
}

/** "When a file lands in a connection, transcode it like this, deliver it there." */
export class Automations extends Resource {
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Automation> {
    return this.core.list('/v1/automations', { ...params }, options);
  }

  listAll(params: ListParams = {}, max?: number): Promise<Automation[]> {
    return this.list(params).toArray(max);
  }

  create(params: AutomationCreateParams, options?: RequestOptions): Promise<Automation> {
    return this.core.request('POST', '/v1/automations', { ...options, body: params });
  }

  retrieve(id: string, options?: RequestOptions): Promise<Automation> {
    return this.core.request('GET', `/v1/automations/${seg(id)}`, options);
  }

  update(id: string, params: AutomationUpdateParams, options?: RequestOptions): Promise<Automation> {
    return this.core.request('PATCH', `/v1/automations/${seg(id)}`, { ...options, body: params });
  }

  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/automations/${seg(id)}`, options);
  }

  /** Poll the source now. */
  run(id: string, options?: RequestOptions): Promise<AutomationRun> {
    return this.core.request('POST', `/v1/automations/${seg(id)}/run`, options);
  }

  /** Process specific paths now, as a hook push would. */
  trigger(id: string, params: { path: string } | { paths: string[] }, options?: RequestOptions): Promise<AutomationRun> {
    return this.core.request('POST', `/v1/automations/${seg(id)}/trigger`, { ...options, body: params });
  }

  /** Issue a new `hook_url`; the old one stops working. */
  rotateHookToken(id: string, options?: RequestOptions): Promise<Automation> {
    return this.core.request('POST', `/v1/automations/${seg(id)}/rotate-hook-token`, options);
  }

  /** Source objects the automation has processed, newest first. */
  items(id: string, params: ListParams = {}, options?: RequestOptions): Promise<ListResponse<AutomationItem>> {
    return this.core.collection(`/v1/automations/${seg(id)}/items`, { ...options, query: { ...options?.query, ...params } });
  }
}

export class Deliveries extends Resource {
  /** Run a failed (or finished) delivery again. */
  retry(id: string, options?: RequestOptions): Promise<Delivery> {
    return this.core.request('POST', `/v1/deliveries/${seg(id)}/retry`, options);
  }
}
