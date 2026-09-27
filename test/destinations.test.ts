import { describe, expect, it } from 'vitest';
import {
  Transcdr,
  signPayload,
  signatureFromAttributes,
  verifySnsSqsSignature,
  type WebhookCreateParams,
  type WebhookEndpoint,
} from '../src';
import { json, mockFetch } from './helpers';

function client(fetch: ReturnType<typeof mockFetch>['fetch']) {
  return new Transcdr({ apiKey: 'tdk_test_abc', baseUrl: 'http://api.test/', fetch, retryDelayMs: 1 });
}

const endpoint = (extra: Partial<WebhookEndpoint>): WebhookEndpoint => ({
  object: 'webhook_endpoint',
  id: 'we_1',
  type: 'https',
  url: 'https://example.com/hooks',
  topic_arn: null,
  queue_url: null,
  aws: null,
  description: '',
  events: ['*'],
  enabled: true,
  created_at: '2026-01-01T00:00:00Z',
  last_delivery_at: null,
  failure_count: 0,
  connection_id: null,
  ...extra,
});

const TOPIC = 'arn:aws:sns:us-east-1:123456789012:transcdr-events';
const QUEUE = 'https://sqs.us-east-1.amazonaws.com/123456789012/transcdr-events';

describe('event destinations: requests', () => {
  it('creates an HTTPS endpoint without a type (backwards compatible)', async () => {
    const { fetch, calls } = mockFetch(json(endpoint({ secret: 'whsec_1' })));
    const created = await client(fetch).webhooks.create({ url: 'https://example.com/hooks', events: ['job.completed'] });
    expect(created.secret).toBe('whsec_1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://api.test/v1/webhooks');
    expect(calls[0].body).toEqual({ url: 'https://example.com/hooks', events: ['job.completed'] });
  });

  it('sends through a messaging connection', async () => {
    const { fetch, calls } = mockFetch(json(endpoint({ type: 'sqs', url: QUEUE, queue_url: QUEUE, connection_id: 'con_q' })));
    const created = await client(fetch).webhooks.create({ connection_id: 'con_q', events: ['connection.disabled'] });
    expect(calls[0].body).toEqual({ connection_id: 'con_q', events: ['connection.disabled'] });
    expect(created.connection_id).toBe('con_q');
  });

  it('sends an SNS destination with its AWS settings', async () => {
    const params: WebhookCreateParams = {
      type: 'sns',
      topic_arn: TOPIC,
      aws: { access_key_id: 'AKIAEXAMPLE', secret_access_key: 'shh' },
      events: ['job.completed', 'job.failed'],
      description: 'Prod topic',
    };
    const reply = endpoint({
      type: 'sns',
      url: TOPIC,
      topic_arn: TOPIC,
      aws: { region: 'us-east-1', access_key_id: 'AKIAEXAMPLE', endpoint: null, message_group_id: null, secret_access_key_set: true },
    });
    const { fetch, calls } = mockFetch(json(reply));
    const created = await client(fetch).webhooks.create(params);
    expect(calls[0].body).toEqual(params);
    expect(created.type).toBe('sns');
    expect(created.aws?.secret_access_key_set).toBe(true);
    expect(created.aws).not.toHaveProperty('secret_access_key');
  });

  it('sends an SQS FIFO destination with region, endpoint and message group', async () => {
    const params: WebhookCreateParams = {
      type: 'sqs',
      queue_url: `${QUEUE}.fifo`,
      aws: {
        access_key_id: 'AKIAEXAMPLE',
        secret_access_key: 'shh',
        region: 'us-east-1',
        endpoint: 'https://sqs.example.internal',
        message_group_id: 'videos',
      },
      events: ['*'],
    };
    const { fetch, calls } = mockFetch(json(endpoint({ type: 'sqs', url: `${QUEUE}.fifo`, queue_url: `${QUEUE}.fifo` })));
    await client(fetch).webhooks.create(params);
    expect(calls[0].body).toEqual(params);
  });

  it('updates AWS settings without resending the secret access key', async () => {
    const { fetch, calls } = mockFetch(json(endpoint({ type: 'sqs' })));
    await client(fetch).webhooks.update('we_1', { queue_url: QUEUE, aws: { access_key_id: 'AKIANEW' } });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toBe('http://api.test/v1/webhooks/we_1');
    expect(calls[0].body).toEqual({ queue_url: QUEUE, aws: { access_key_id: 'AKIANEW' } });
  });

  it('rejects mismatched create params at compile time', () => {
    // @ts-expect-error an SNS destination needs topic_arn and aws
    const bad: WebhookCreateParams = { type: 'sns', url: 'https://example.com' };
    expect(bad).toBeTruthy();
  });
});

describe('event destinations: signatures', () => {
  const SECRET = 'whsec_test_secret';
  const BODY = '{"id":"evt_1","type":"job.completed"}';

  it('verifies every AWS attribute shape and the bare value', async () => {
    const signature = await signPayload(BODY, SECRET);
    const shapes = [
      signature,
      { 'transcdr-signature': { DataType: 'String', StringValue: signature } }, // SQS ReceiveMessage / AWS SDK
      { 'transcdr-signature': { dataType: 'String', stringValue: signature } }, // Lambda SQS event
      { 'transcdr-signature': { Type: 'String', Value: signature } }, // SNS notification JSON
      { 'Transcdr-Signature': signature },
    ];
    for (const attributes of shapes) {
      expect(await verifySnsSqsSignature(BODY, attributes, SECRET)).toBe(true);
    }
    const transcdr = new Transcdr({ fetch: async () => new Response() });
    expect(await transcdr.webhooks.verifySnsSqsSignature(BODY, shapes[2], SECRET)).toBe(true);
  });

  it('rejects missing attributes, wrong secrets and tampered messages', async () => {
    const signature = await signPayload(BODY, SECRET);
    const attributes = { 'transcdr-signature': { stringValue: signature } };
    expect(await verifySnsSqsSignature(BODY, {}, SECRET)).toBe(false);
    expect(await verifySnsSqsSignature(BODY, null, SECRET)).toBe(false);
    expect(await verifySnsSqsSignature(BODY, attributes, 'whsec_other')).toBe(false);
    expect(await verifySnsSqsSignature(BODY.replace('evt_1', 'evt_2'), attributes, SECRET)).toBe(false);
  });

  it('extracts the attribute value', () => {
    expect(signatureFromAttributes({ 'transcdr-event-type': 'job.completed' })).toBeNull();
    expect(signatureFromAttributes({ 'transcdr-signature': { Value: 't=1,v1=ab' } })).toBe('t=1,v1=ab');
  });
});
