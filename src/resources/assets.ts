import type { RequestOptions } from '../core';
import type { PagePromise } from '../pagination';
import type { Asset, AssetImportParams, ListParams, SignedUrl } from '../types';
import { Resource, seg } from './base';

export class Assets extends Resource {
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Asset> {
    return this.core.list('/v1/assets', { ...params }, options);
  }

  /** Every asset, across every page. */
  listAll(params: ListParams = {}, max?: number): Promise<Asset[]> {
    return this.list(params).toArray(max);
  }

  /** Link a remote file by URL. The asset is `ready` at once; jobs read the URL directly. */
  create(params: AssetImportParams, options?: RequestOptions): Promise<Asset> {
    return this.core.create('/v1/assets', params, options);
  }

  retrieve(id: string, options?: RequestOptions): Promise<Asset> {
    return this.core.request('GET', `/v1/assets/${seg(id)}`, options);
  }

  /** A short-lived signed download URL for the original file. */
  contentUrl(id: string, options?: RequestOptions): Promise<SignedUrl> {
    return this.core.request('GET', `/v1/assets/${seg(id)}/content`, {
      ...options,
      query: { ...options?.query, redirect: 'false' },
    });
  }

  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/assets/${seg(id)}`, options);
  }
}
