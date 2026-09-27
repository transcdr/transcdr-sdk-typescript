import { describe, expect, it } from 'vitest';
import { InvalidRequestError, PermissionError, Transcdr } from '../src';
import { json, mockFetch } from './helpers';

function client(fetch: ReturnType<typeof mockFetch>['fetch']) {
  return new Transcdr({ apiKey: 'tds_session', baseUrl: 'http://api.test', fetch, retryDelayMs: 1 });
}

const membership = (id: string, role = 'owner') => ({
  object: 'membership',
  organization: { id, name: id, slug: id, plan: 'free' },
  role,
  created_at: '2026-09-01T00:00:00Z',
});
const user = { object: 'user', id: 'usr_1', name: 'Ada', email: 'ada@example.com', role: 'admin', organization_id: 'org_2' };
const session = (token: string, org: string) => ({
  token,
  user: { ...user, organization_id: org },
  organization: { object: 'organization', id: org, name: org, slug: org, plan: 'free' },
  organizations: [membership('org_1'), membership('org_2', 'admin')],
});

describe('organizations', () => {
  it('logs in to a chosen organization', async () => {
    const { fetch, calls } = mockFetch(json(session('tds_a', 'org_2')));
    const res = await client(fetch).auth.login({ email: 'ada@example.com', password: 'pw', organization_id: 'org_2' });
    expect(calls[0].body).toEqual({ email: 'ada@example.com', password: 'pw', organization_id: 'org_2' });
    expect(res.organizations.map((m) => m.organization.id)).toEqual(['org_1', 'org_2']);
  });

  it('switches with the organization id and returns the new token', async () => {
    const { fetch, calls } = mockFetch(json(session('tds_new', 'org_1')));
    const res = await client(fetch).auth.switch('org_1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://api.test/v1/auth/switch');
    expect(calls[0].body).toEqual({ organization_id: 'org_1' });
    expect(calls[0].headers['idempotency-key']).toBeUndefined();
    expect(res.token).toBe('tds_new');
    expect(res.organization.id).toBe('org_1');
  });

  it('surfaces not_a_member and session_required as permission errors', async () => {
    const { fetch } = mockFetch(
      json({ error: { type: 'permission_error', code: 'not_a_member', message: 'no' } }, 403),
    );
    const err = await client(fetch).auth.switch('org_x').catch((e) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect(err.code).toBe('not_a_member');
  });

  it('lists the memberships', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'list', data: [membership('org_1')], has_more: false }));
    const list = await client(fetch).organizations.list();
    expect(calls[0].url).toBe('http://api.test/v1/organizations');
    expect(list.data[0].organization.id).toBe('org_1');
    expect(list.data[0].role).toBe('owner');
  });

  it('creates an organization and returns a session in it', async () => {
    const { fetch, calls } = mockFetch(json(session('tds_b', 'org_3')));
    const res = await client(fetch).organizations.create({ name: 'Studio' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://api.test/v1/organizations');
    expect(calls[0].body).toEqual({ name: 'Studio' });
    expect(res.token).toBe('tds_b');
  });
});

describe('members', () => {
  it('adds an existing user by email alone', async () => {
    const { fetch, calls } = mockFetch(json(user));
    await client(fetch).organization.members.create({ email: 'ada@example.com', role: 'admin' });
    expect(calls[0].body).toEqual({ email: 'ada@example.com', role: 'admin' });
  });

  it('leaves by deleting its own membership', async () => {
    const { fetch, calls } = mockFetch(
      json({ user, organization: {}, organizations: [], scopes: ['*'] }),
      new Response(null, { status: 204 }),
    );
    await client(fetch).organization.members.leave();
    expect(calls[0].url).toBe('http://api.test/v1/me');
    expect(calls[1].method).toBe('DELETE');
    expect(calls[1].url).toBe('http://api.test/v1/organization/members/usr_1');
  });

  it('refuses to leave with an API key', async () => {
    const { fetch, calls } = mockFetch(json({ user: null, organization: {}, organizations: [], scopes: ['*'] }));
    await expect(client(fetch).organization.members.leave()).rejects.toThrow(/session token/);
    expect(calls).toHaveLength(1);
  });

  it('surfaces last_owner as an invalid request with its code', async () => {
    const { fetch } = mockFetch(json({ error: { type: 'invalid_request_error', code: 'last_owner', message: 'no' } }, 409));
    const err = await client(fetch).organization.members.del('usr_1').catch((e) => e);
    expect(err).toBeInstanceOf(InvalidRequestError);
    expect(err.code).toBe('last_owner');
  });
});
