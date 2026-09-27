import type { RequestOptions } from '../core';
import type { PagePromise } from '../pagination';
import {
  constructEvent,
  verifySignature,
  verifySnsSqsSignature,
  type SignatureAttributes,
  type VerifyOptions,
} from '../signature';
import type {
  Event,
  ListParams,
  WebhookCreateParams,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookUpdateParams,
} from '../types';
import { Resource, seg } from './base';

export class Webhooks extends Resource {
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<WebhookEndpoint> {
    return this.core.list('/v1/webhooks', { ...params }, options);
  }

  /** Every item, across every page. */
  listAll(params: ListParams = {}, max?: number): Promise<WebhookEndpoint[]> {
    return this.list(params).toArray(max);
  }

  /**
   * Create an HTTPS, Amazon SNS or Amazon SQS destination.
   * The returned endpoint carries `secret`: store it now, it is not shown again.
   */
  create(params: WebhookCreateParams, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request('POST', '/v1/webhooks', { ...options, body: params });
  }

  retrieve(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request('GET', `/v1/webhooks/${seg(id)}`, options);
  }

  update(id: string, params: WebhookUpdateParams, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request('PATCH', `/v1/webhooks/${seg(id)}`, { ...options, body: params });
  }

  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/webhooks/${seg(id)}`, options);
  }

  /** Issue a new signing secret; the old one stops working. */
  rotateSecret(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.core.request('POST', `/v1/webhooks/${seg(id)}/rotate-secret`, options);
  }

  /** Send a `webhook.test` event to the endpoint. */
  test(id: string, options?: RequestOptions): Promise<WebhookDelivery | Event> {
    return this.core.request('POST', `/v1/webhooks/${seg(id)}/test`, options);
  }

  deliveries(id: string, params: ListParams = {}, options?: RequestOptions): PagePromise<WebhookDelivery> {
    return this.core.list(`/v1/webhooks/${seg(id)}/deliveries`, { ...params }, options);
  }

  /** Queue another attempt of a delivery. */
  redeliver(deliveryId: string, options?: RequestOptions): Promise<WebhookDelivery> {
    return this.core.request('POST', `/v1/webhook-deliveries/${seg(deliveryId)}/redeliver`, options);
  }

  /**
   * Verify a `Transcdr-Signature` header against the raw request body.
   * Works in browsers and Node 18+ (Web Crypto).
   */
  verifySignature(
    payload: string | Uint8Array | ArrayBuffer,
    header: string | null | undefined,
    secret: string,
    toleranceSec: number | VerifyOptions = 300,
  ): Promise<boolean> {
    return verifySignature(payload, header, secret, toleranceSec);
  }

  /**
   * Verify an Amazon SNS or SQS delivery: `message` is the SNS `Message` or SQS body,
   * `attributes` its message attributes (any AWS shape) or the `transcdr-signature` value.
   */
  verifySnsSqsSignature(
    message: string | Uint8Array | ArrayBuffer,
    attributes: SignatureAttributes,
    secret: string,
    toleranceSec: number | VerifyOptions = 300,
  ): Promise<boolean> {
    return verifySnsSqsSignature(message, attributes, secret, toleranceSec);
  }

  /** Verify and parse a delivery; throws when the signature is invalid. */
  constructEvent<T = Event>(
    payload: string | Uint8Array | ArrayBuffer,
    header: string | null | undefined,
    secret: string,
    toleranceSec: number | VerifyOptions = 300,
  ): Promise<T> {
    return constructEvent<T>(payload, header, secret, toleranceSec);
  }
}
