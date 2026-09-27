import { describe, expect, it } from 'vitest';
import { InvalidRequestError, PLATFORMS, PRESET_CATEGORIES, Transcdr, isSession, type Connection, type WebhookEndpoint } from '../src';
import { json, mockFetch } from './helpers';

function client(fetch: ReturnType<typeof mockFetch>['fetch'], maxRetries = 2) {
  return new Transcdr({ apiKey: 'tdk_test_abc', baseUrl: 'http://api.test', fetch, retryDelayMs: 1, maxRetries });
}

const preset = { object: 'preset', id: 'pre_1', slug: 'mine', name: 'Mine', description: '', system: false, output: {}, metadata: {} };

describe('idempotent creates', () => {
  const creates: [string, string, (t: Transcdr) => Promise<unknown>][] = [
    ['assets', '/v1/assets', (t) => t.assets.create({ url: 'https://example.com/a.mp4' })],
    ['presets', '/v1/presets', (t) => t.presets.create({ name: 'Mine', output: {} })],
    ['webhooks', '/v1/webhooks', (t) => t.webhooks.create({ url: 'https://example.com/hook' })],
    ['connections', '/v1/connections', (t) => t.connections.create({ name: 'c', kind: 's3', config: { bucket: 'b' } })],
    ['automations', '/v1/automations', (t) => t.automations.create({ name: 'a', source: { connection_id: 'con_1' } })],
    ['api keys', '/v1/api-keys', (t) => t.apiKeys.create({ name: 'CI' })],
    ['members', '/v1/organization/members', (t) => t.organization.members.create({ email: 'a@b.c', role: 'member' })],
    ['organizations', '/v1/organizations', (t) => t.organizations.create({ name: 'Acme' })],
    ['probe', '/v1/probe', (t) => t.probe.create({ input: { type: 'url', url: 'https://example.com/a.mp4' } })],
  ];

  it.each(creates)('sends an Idempotency-Key on %s', async (_name, path, call) => {
    const { fetch, calls } = mockFetch(json({ object: 'x', id: 'x_1' }));
    await call(client(fetch));
    expect(calls[0].method).toBe('POST');
    expect(new URL(calls[0].url).pathname).toBe(path);
    expect(calls[0].headers['idempotency-key']).toMatch(/.{16,}/);
  });

  it('retries a create with the same key after a 503', async () => {
    const { fetch, calls } = mockFetch(
      json({ error: { type: 'api_error', code: 'unavailable', message: 'x' } }, 503),
      json(preset, 201, { 'idempotent-replayed': 'true' }),
    );
    const created = await client(fetch).presets.create({ name: 'Mine', output: {} });
    expect(created.id).toBe('pre_1');
    expect(calls).toHaveLength(2);
    expect(calls[1].headers['idempotency-key']).toBe(calls[0].headers['idempotency-key']);
  });

  it('retries a create with the same key after a network failure', async () => {
    const { fetch, calls } = mockFetch(new TypeError('socket hang up'), json({ object: 'webhook_endpoint', id: 'whk_1' }));
    await client(fetch).webhooks.create({ url: 'https://example.com/hook' });
    expect(calls).toHaveLength(2);
    expect(calls[1].headers['idempotency-key']).toBe(calls[0].headers['idempotency-key']);
  });

  it('surfaces idempotency_key_reused without retrying', async () => {
    const { fetch, calls } = mockFetch(
      json({ error: { type: 'invalid_request_error', code: 'idempotency_key_reused', message: 'x' } }, 409),
    );
    const err = await client(fetch)
      .presets.create({ name: 'Mine', output: {} }, { idempotencyKey: 'k1' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(InvalidRequestError);
    expect(err.code).toBe('idempotency_key_reused');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['idempotency-key']).toBe('k1');
  });

  it('does not add a key to non-create POSTs', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'webhook_endpoint', id: 'whk_1' }));
    await client(fetch).webhooks.rotateSecret('whk_1');
    expect(calls[0].headers['idempotency-key']).toBeUndefined();
  });
});

describe('presets', () => {
  it('replaces with PUT', async () => {
    const { fetch, calls } = mockFetch(json(preset));
    await client(fetch).presets.replace('pre_1', { name: 'Mine', output: { codec: 'av1' } });
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe('http://api.test/v1/presets/pre_1');
    expect(calls[0].body).toEqual({ name: 'Mine', output: { codec: 'av1' } });
    expect(calls[0].headers['idempotency-key']).toBeUndefined();
  });

  it('clears description and metadata with explicit null on PATCH', async () => {
    const { fetch, calls } = mockFetch(json(preset));
    await client(fetch).presets.update('pre_1', { description: null, metadata: null });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].body).toEqual({ description: null, metadata: null });
  });

  it('filters by category and platforms, comma-joined', async () => {
    const page = { object: 'list', data: [], has_more: false, next_cursor: null };
    const { fetch, calls } = mockFetch(json(page), json(page), json(page));
    const t = client(fetch);
    await t.presets.list({ category: ['web', 'mobile'], compatible_with: ['ios', 'android'], limit: 5 });
    await t.presets.list({ category: 'streaming', compatible_with: 'smart_tv', system: false });
    await t.presets.list({ category: [] });
    const first = new URL(calls[0].url).searchParams;
    expect(first.get('category')).toBe('web,mobile');
    expect(first.get('compatible_with')).toBe('ios,android');
    expect(first.get('limit')).toBe('5');
    const second = new URL(calls[1].url).searchParams;
    expect(second.get('category')).toBe('streaming');
    expect(second.get('compatible_with')).toBe('smart_tv');
    expect(second.get('system')).toBe('false');
    expect(new URL(calls[2].url).search).toBe('');
  });

  it('sets and clears category and compatibility', async () => {
    const { fetch, calls } = mockFetch(json(preset), json(preset));
    const t = client(fetch);
    await t.presets.create({
      name: 'Mine',
      output: { codec: 'h264' },
      category: 'tv',
      compatibility: ['smart_tv', 'legacy'],
      compatibility_notes: { smart_tv: 'Our set-top box app.' },
    });
    await t.presets.update('pre_1', { category: null, compatibility: null, compatibility_notes: null });
    expect(calls[0].body).toMatchObject({
      category: 'tv',
      compatibility: ['smart_tv', 'legacy'],
      compatibility_notes: { smart_tv: 'Our set-top box app.' },
    });
    expect(calls[1].body).toEqual({ category: null, compatibility: null, compatibility_notes: null });
  });

  it('reads category, compatibility and notes, keeping unknown values', async () => {
    const { fetch } = mockFetch(
      json({
        ...preset,
        category: 'podcast',
        compatibility: ['web', 'vr_headset'],
        compatibility_notes: { web: 'Every current browser.' },
      }),
    );
    const got = await client(fetch).presets.retrieve('pre_1');
    expect(got.category).toBe('podcast');
    expect(got.compatibility).toEqual(['web', 'vr_headset']);
    expect(got.compatibility_notes.web).toBe('Every current browser.');
    expect(PRESET_CATEGORIES).toContain('archive');
    expect(PLATFORMS).toEqual(['web', 'ios', 'android', 'smart_tv', 'legacy', 'editing']);
  });
});

describe('PATCH with null', () => {
  it('sends null for automations, webhooks, connections and the organization', async () => {
    const { fetch, calls } = mockFetch(json({}), json({}), json({}), json({}));
    const t = client(fetch);
    await t.automations.update('aut_1', {
      destination: null,
      preset: null,
      output: null,
      metadata: null,
      webhook_url: null,
      trigger_connection_id: null,
    });
    await t.webhooks.update('whk_1', { description: null, aws: { endpoint: null, message_group_id: null } });
    await t.connections.update('con_1', { config: { endpoint: null, message_group_id: null }, secrets: { session_token: null } });
    await t.organization.update({ billing_email: null });
    expect(calls[0].body).toEqual({
      destination: null,
      preset: null,
      output: null,
      metadata: null,
      webhook_url: null,
      trigger_connection_id: null,
    });
    expect(calls[1].body).toEqual({ description: null, aws: { endpoint: null, message_group_id: null } });
    expect(calls[2].body).toEqual({ config: { endpoint: null, message_group_id: null }, secrets: { session_token: null } });
    expect(calls[3].body).toEqual({ billing_email: null });
  });

  it('leaves out fields that are undefined', async () => {
    const { fetch, calls } = mockFetch(json({}));
    await client(fetch).automations.update('aut_1', { name: 'x', preset: undefined });
    expect(calls[0].body).toEqual({ name: 'x' });
  });
});

describe('api keys', () => {
  it('retrieves one key', async () => {
    const { fetch, calls } = mockFetch(
      json({ object: 'api_key', id: 'key_1', name: 'CI', prefix: 'tdk_live_ab12', revoked_at: null }),
    );
    const key = await client(fetch).apiKeys.retrieve('key_1');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://api.test/v1/api-keys/key_1');
    expect(key.revoked_at).toBeNull();
  });

  it('is a 404 once revoked', async () => {
    const { fetch } = mockFetch(json({ error: { type: 'invalid_request_error', code: 'not_found', message: 'x' } }, 404));
    await expect(client(fetch).apiKeys.retrieve('key_1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('secret fingerprints', () => {
  it('types the secrets map on connections and webhooks', async () => {
    const fp = { set: true, fingerprint: 'hmac-sha256:3f9a0c1b2d4e' };
    const { fetch } = mockFetch(
      json({ object: 'connection', id: 'con_1', secrets_set: ['access_key_id'], secrets: { access_key_id: fp } }),
      json({ object: 'webhook_endpoint', id: 'whk_1', secrets: { secret: fp } }),
    );
    const t = client(fetch);
    const conn: Connection = await t.connections.retrieve('con_1');
    const hook: WebhookEndpoint = await t.webhooks.retrieve('whk_1');
    expect(conn.secrets?.access_key_id?.fingerprint).toMatch(/^hmac-sha256:[0-9a-f]{12}$/);
    expect(hook.secrets?.secret?.set).toBe(true);
    expect(hook.secrets?.secret_access_key).toBeUndefined();
  });
});

describe('isSession', () => {
  it('tells a session from an API key by the token prefix', () => {
    expect(isSession({ api_key: { prefix: 'tds_ab12' } as never, organizations: [] })).toBe(true);
    expect(isSession({ api_key: { prefix: 'tdk_live_ab12' } as never, organizations: [] })).toBe(false);
    expect(isSession({ api_key: { prefix: 'tdk_test_ab12' } as never, organizations: [] })).toBe(false);
  });

  it('falls back to the memberships when there is no api_key', () => {
    expect(isSession({ organizations: [{} as never] })).toBe(true);
    expect(isSession({ api_key: null, organizations: [] })).toBe(false);
  });
});
