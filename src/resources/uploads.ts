import type { RequestOptions } from '../core';
import { ConnectionError, errorFromResponse } from '../errors';
import type { Asset, Metadata, Upload, UploadCreateParams } from '../types';
import { Resource, seg } from './base';

/** Anything with bytes: a browser `File`/`Blob`, a Node `Buffer`, a `Uint8Array` or an `ArrayBuffer`. */
export type UploadBody = Blob | Uint8Array | ArrayBuffer;

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadFileOptions {
  /** Defaults to `File.name`, else `"upload"`. */
  filename?: string;
  /** Defaults to `Blob.type`, else `application/octet-stream`. */
  contentType?: string;
  metadata?: Metadata;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** Rewrite the presigned URL before the PUT (e.g. to route through a dev proxy). */
  transformUploadUrl?: (url: string) => string;
}

function sizeOf(body: UploadBody): number {
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (body instanceof Uint8Array) return body.byteLength;
  return body.size;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Storage backends answer with XML or plain text.
    return text;
  }
}

export class Uploads extends Resource {
  /** Open an upload session. Retries are made safe with an automatic idempotency key. */
  create(params: UploadCreateParams, options: RequestOptions = {}): Promise<Upload> {
    return this.core.create('/v1/uploads', params, options);
  }

  /** Mark the upload finished; returns the ready asset. */
  complete(id: string, options?: RequestOptions): Promise<Asset> {
    return this.core.request('POST', `/v1/uploads/${seg(id)}/complete`, options);
  }

  /**
   * Upload a file in one call: create the session, PUT the bytes to
   * `upload_url`, and complete it. Returns the asset.
   */
  async uploadFile(body: UploadBody, options: UploadFileOptions = {}): Promise<Asset> {
    const blobLike = typeof Blob !== 'undefined' && body instanceof Blob ? body : null;
    const filename = options.filename ?? (blobLike as { name?: string } | null)?.name ?? 'upload';
    const contentType = options.contentType || blobLike?.type || 'application/octet-stream';
    const size = sizeOf(body);

    const upload = await this.create(
      { filename, content_type: contentType, size_bytes: size, metadata: options.metadata },
      { signal: options.signal },
    );
    const rawUrl = this.core.url(upload.upload_url);
    const url = options.transformUploadUrl ? options.transformUploadUrl(rawUrl) : rawUrl;
    const method = upload.upload_method || 'PUT';
    const headers: Record<string, string> = { 'Content-Type': contentType, ...upload.upload_headers };

    options.onProgress?.({ loaded: 0, total: size, percent: 0 });
    if (options.onProgress && typeof XMLHttpRequest !== 'undefined') {
      await putWithXhr(url, method, headers, body, size, options.onProgress, options.signal);
    } else {
      let response: Response;
      try {
        response = await this.core.rawFetch(url, { method, headers, body: body as BodyInit, signal: options.signal });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new ConnectionError(`Upload failed: ${(error as Error)?.message ?? error}`, {
          type: 'connection_error',
          cause: error,
        });
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw errorFromResponse(response.status, parseMaybeJson(text), response.headers);
      }
    }
    options.onProgress?.({ loaded: size, total: size, percent: 100 });

    return this.complete(upload.id, { signal: options.signal });
  }
}

function putWithXhr(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: UploadBody,
  size: number,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : size;
      onProgress({ loaded: event.loaded, total, percent: total ? Math.min(100, (event.loaded / total) * 100) : 0 });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const bag = new Headers();
      const requestId = xhr.getResponseHeader('x-request-id');
      if (requestId) bag.set('x-request-id', requestId);
      reject(errorFromResponse(xhr.status, parseMaybeJson(xhr.responseText), bag));
    };
    xhr.onerror = () => reject(new ConnectionError('Upload failed: network error.', { type: 'connection_error' }));
    xhr.onabort = () => reject(signal?.reason ?? new ConnectionError('Upload aborted.', { type: 'connection_error' }));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body as XMLHttpRequestBodyInit);
  });
}
