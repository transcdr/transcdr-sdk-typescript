import { describe, expect, it } from 'vitest';
import { SCOPES, Transcdr } from '../src';
import { json, mockFetch } from './helpers';

function client(fetch: ReturnType<typeof mockFetch>['fetch']) {
  return new Transcdr({ apiKey: 'tdk_test_x', baseUrl: 'http://api.test', fetch, retryDelayMs: 1 });
}

const ticket = {
  object: 'support_ticket',
  id: 'tck_4QmZ0123456789abcdefgh',
  reference: 'TCK-1001',
  number: 1001,
  subject: 'Output has no audio',
  category: 'job_problem',
  severity: 'high',
  filed_severity: 'high',
  status: 'open',
  job_ids: ['job_1'],
  asset_ids: [],
  requester: { id: 'usr_1', name: 'Ada', email: 'ada@example.com' },
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z',
  last_message_at: '2026-09-28T10:00:00Z',
  waiting_since: '2026-09-28T10:00:00Z',
  resolved_at: null,
  closed_at: null,
  credits: [],
  credit_total_micros: 0,
  messages: [],
};

describe('support', () => {
  it('opens a ticket, without retrying the create', async () => {
    const { fetch, calls } = mockFetch(json({ error: { type: 'api_error', code: 'internal_error', message: 'boom' } }, 503));
    await expect(
      client(fetch).support.tickets.create({ subject: 'Output has no audio', category: 'job_problem', severity: 'high', description: 'Silent.', job_ids: ['job_1'] }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://api.test/v1/support/tickets');
    expect(calls[0].body).toEqual({ subject: 'Output has no audio', category: 'job_problem', severity: 'high', description: 'Silent.', job_ids: ['job_1'] });
    expect(calls[0].headers['idempotency-key']).toBeUndefined();
  });

  it('lists by several statuses and reads one by its reference', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'list', data: [ticket], has_more: false }), json(ticket));
    const transcdr = client(fetch);
    const list = await transcdr.support.tickets.list({ status: ['open', 'waiting_on_us'], limit: 10 });
    expect(calls[0].url).toBe('http://api.test/v1/support/tickets?status=open%2Cwaiting_on_us&limit=10');
    expect(list.data[0].reference).toBe('TCK-1001');
    const one = await transcdr.support.tickets.retrieve('TCK-1001');
    expect(calls[1].url).toBe('http://api.test/v1/support/tickets/TCK-1001');
    expect(one.id).toBe(ticket.id);
  });

  it('replies, resolves and reopens', async () => {
    const { fetch, calls } = mockFetch(json(ticket, 201), json({ ...ticket, status: 'resolved' }), json(ticket));
    const t = client(fetch).support.tickets;
    await t.reply(ticket.id, 'Retried, works now.');
    await t.resolve(ticket.id);
    await t.reopen(ticket.id);
    expect(calls.map((c) => `${c.method} ${c.url.replace('http://api.test', '')}`)).toEqual([
      `POST /v1/support/tickets/${ticket.id}/messages`,
      `POST /v1/support/tickets/${ticket.id}/resolve`,
      `POST /v1/support/tickets/${ticket.id}/reopen`,
    ]);
    expect(calls[0].body).toEqual({ body: 'Retried, works now.' });
  });

  it('reads and updates email preferences', async () => {
    const prefs = { object: 'support_preferences', ticket_emails: false, org_ticket_emails: false, can_receive_org_emails: true };
    const { fetch, calls } = mockFetch(json(prefs), json({ ...prefs, ticket_emails: true }));
    const p = client(fetch).support.preferences;
    expect((await p.retrieve()).ticket_emails).toBe(false);
    expect((await p.update({ ticket_emails: true })).ticket_emails).toBe(true);
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].body).toEqual({ ticket_emails: true });
  });

  it('knows the support scopes', () => {
    expect(SCOPES).toContain('support:read');
    expect(SCOPES).toContain('support:write');
  });
});
