import type { RequestOptions } from '../core';
import type { PagePromise } from '../pagination';
import type { ApiKey, ApiKeyCreateParams, ListParams } from '../types';
import { Resource, seg } from './base';

export class ApiKeys extends Resource {
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<ApiKey> {
    return this.core.list('/v1/api-keys', { ...params }, options);
  }

  /** Every item, across every page. */
  listAll(params: ListParams = {}, max?: number): Promise<ApiKey[]> {
    return this.list(params).toArray(max);
  }

  /** The returned key carries `secret`, the only time it is ever shown. */
  create(params: ApiKeyCreateParams, options?: RequestOptions): Promise<ApiKey> {
    return this.core.request('POST', '/v1/api-keys', { ...options, body: params });
  }

  /** Revoke a key immediately. */
  async revoke(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/api-keys/${seg(id)}`, options);
  }

  /** Alias of `revoke`. */
  del(id: string, options?: RequestOptions): Promise<void> {
    return this.revoke(id, options);
  }
}
