import { describe, expect, it } from 'vitest';
import { Transcdr, type ConnectionCheck, type WebhookCheck } from '../src';
import { json, mockFetch } from './helpers';

function client(fetch: ReturnType<typeof mockFetch>['fetch']) {
  return new Transcdr({ apiKey: 'tdk_test_abc', baseUrl: 'http://api.test/', fetch, retryDelayMs: 1 });
}

const connectionReport: ConnectionCheck = {
  object: 'connection_check',
  ok: false,
  steps: [
    { id: 'settings', label: 'Settings are complete', status: 'passed', detail: 'ok', duration_ms: 0 },
    { id: 'identity', label: 'Credentials identify an account', status: 'passed', detail: 'arn:aws:iam::123456789012:user/transcdr', duration_ms: 90 },
    { id: 'write', label: 'Can write files', status: 'failed', detail: 'AccessDenied', hint: 'grant s3:PutObject', duration_ms: 80 },
    { id: 'read', label: 'Can read files', status: 'skipped', detail: 'Nothing was written to read back.' },
  ],
  identity: { provider: 'aws', arn: 'arn:aws:iam::123456789012:user/transcdr', account: '123456789012' },
  roles: { source: true, watch_folder: true, destination: false },
  setup: { summary: 'Create an IAM user…', iam_policy: { Version: '2012-10-17', Statement: [] } },
};

describe('integration checks', () => {
  it('checks unsaved connection settings', async () => {
    const { fetch, calls } = mockFetch(json(connectionReport));
    const params = {
      kind: 's3' as const,
      config: { bucket: 'media', region: 'us-east-1' },
      secrets: { access_key_id: 'AKIA', secret_access_key: 'shh' },
    };
    const report = await client(fetch).connections.check(params);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://api.test/v1/connections/check');
    expect(calls[0].body).toEqual(params);
    expect(report.roles.destination).toBe(false);
    expect(report.steps.find((s) => s.status === 'failed')?.hint).toBe('grant s3:PutObject');
    if (report.identity?.provider === 'aws') expect(report.identity.account).toBe('123456789012');
    else throw new Error('expected an AWS identity');
  });

  it('checks a saved connection', async () => {
    const { fetch, calls } = mockFetch(json({ ...connectionReport, ok: true }));
    const report = await client(fetch).connections.checkSaved('con 1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://api.test/v1/connections/con%201/check');
    expect(calls[0].body).toBeUndefined();
    expect(report.ok).toBe(true);
  });

  it('checks an unsaved and a saved destination', async () => {
    const reply: WebhookCheck = {
      object: 'webhook_check',
      ok: true,
      steps: [
        { id: 'identity', label: 'Credentials identify an account', status: 'passed' },
        { id: 'publish', label: 'Can publish to the topic', status: 'passed', duration_ms: 40 },
      ],
      identity: { provider: 'aws', arn: 'arn:aws:iam::1:user/x', account: '1' },
      roles: { notifications: true },
      setup: null,
    };
    const { fetch, calls } = mockFetch(json(reply), json(reply));
    const transcdr = client(fetch);
    const params = {
      type: 'sns' as const,
      topic_arn: 'arn:aws:sns:us-east-1:1:t',
      aws: { access_key_id: 'AKIA', secret_access_key: 'shh' },
      events: ['job.completed'],
    };
    const first = await transcdr.webhooks.check(params);
    expect(calls[0].url).toBe('http://api.test/v1/webhooks/check');
    expect(calls[0].body).toEqual(params);
    expect(first.roles.notifications).toBe(true);
    await transcdr.webhooks.checkSaved('we_1');
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe('http://api.test/v1/webhooks/we_1/check');
  });
});
