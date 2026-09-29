import { describe, expect, it } from 'vitest';
import {
  APIError,
  AuthenticationError,
  ConnectionError,
  InvalidRequestError,
  PermissionError,
  QuotaError,
  RateLimitError,
  Transcdr,
  TranscdrError,
  WaitTimeoutError,
  buildQuery,
  AUDIO_CHANNELS,
  AUDIO_CODECS,
  FITS,
  HE_AAC,
  IMAGE_FORMATS,
  IMAGE_TIERS,
  KINDS,
  ORIENTATIONS,
  PRESET_CATEGORIES,
  type Audio,
  type OutputSpec,
  type VideoOutput,
} from '../src';
import { json, mockFetch } from './helpers';
import { examples, hlsCbr, singleMp4, stills } from './specs';

const job = (id: string, status = 'queued') => ({ object: 'job', id, status, progress: { percent: 0 } });
const list = (data: unknown[], next: string | null) => ({
  object: 'list',
  data,
  has_more: next !== null,
  next_cursor: next,
});

function client(fetch: ReturnType<typeof mockFetch>['fetch'], extra = {}) {
  return new Transcdr({ apiKey: 'tdk_test_abc', baseUrl: 'http://api.test/', fetch, retryDelayMs: 1, ...extra });
}

describe('requests', () => {
  it('sends the bearer token, JSON body and base URL', async () => {
    const { fetch, calls } = mockFetch(json(job('job_1')));
    const transcdr = client(fetch);
    const created = await transcdr.jobs.create({
      input: { type: 'url', url: 'https://example.com/in.mp4' },
      preset: 'hls-av1-abr',
    });
    expect(created.id).toBe('job_1');
    expect(calls[0].url).toBe('http://api.test/v1/jobs');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.authorization).toBe('Bearer tdk_test_abc');
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(calls[0].body).toEqual({ input: { type: 'url', url: 'https://example.com/in.mp4' }, preset: 'hls-av1-abr' });
  });

  it('sends each complete example spec as written', async () => {
    for (const output of Object.values(examples)) {
      const { fetch, calls } = mockFetch(json(job('job_1')));
      await client(fetch).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, output });
      expect(calls[0].body).toEqual({ input: { type: 'asset', asset_id: 'ast_1' }, output });
    }
  });

  it('sends AAC, FLAC and ALAC audio, surround and a stereo fallback as written', async () => {
    const audio: Audio[] = [
      { handling: 'encode', codec: 'aac', bitrate: '96k', channels: 'stereo', he_aac: 'auto', stereo_fallback: false },
      { handling: 'encode', codec: 'flac', bit_depth: '24', flac_compression: 'best', channels: 'source', he_aac: 'core', stereo_fallback: false },
      { handling: 'encode', codec: 'alac', bit_depth: '16', channels: 'source', he_aac: 'passthrough', stereo_fallback: false },
      { handling: 'auto', codec: 'opus', bitrate: 'standard', channels: '5.1', he_aac: 'auto', stereo_fallback: true },
      { handling: 'drop' },
    ];
    for (const a of audio) {
      const output: OutputSpec = { ...hlsCbr, audio: a };
      const { fetch, calls } = mockFetch(json(job('job_1')));
      await client(fetch).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, output });
      expect((calls[0].body as { output: unknown }).output).toEqual(output);
    }
    expect(AUDIO_CHANNELS).toEqual(['source', 'mono', 'stereo', '5.1', '7.1']);
    expect(HE_AAC).toEqual(['auto', 'passthrough', 'core']);
    expect(AUDIO_CODECS).toEqual(['opus', 'mp3', 'aac', 'flac', 'alac']);
  });

  it('sends a ladder, the source size and each size\'s own fitting as written', async () => {
    const outputs: VideoOutput[] = [
      { ...hlsCbr, renditions: { ladder: { max_short_side: 1080, fit: 'contain', upscale: false } } },
      { ...singleMp4, renditions: { source_size: { label: 'by_size', fit: 'pad', upscale: true } } },
      {
        ...singleMp4,
        renditions: {
          sizes: [
            { label: 'wide', width: 1920, height: 1080, fit: 'pad', orientation: 'auto', upscale: true },
            { label: 'tall', width: 1080, height: 1920, fit: 'cover', orientation: 'fixed', upscale: false },
          ],
        },
      },
    ];
    for (const output of outputs) {
      const { fetch, calls } = mockFetch(json(job('job_1')));
      await client(fetch).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, output });
      expect((calls[0].body as { output: unknown }).output).toEqual(output);
    }
    expect(FITS).toEqual(['contain', 'cover', 'pad', 'stretch']);
    expect(ORIENTATIONS).toEqual(['auto', 'fixed']);
  });

  it('reads the resolved spec, its provenance and the display size back from a job', async () => {
    const { fetch } = mockFetch(
      json({
        ...job('job_1'),
        preset_id: 'social-vertical-1080x1920',
        preset: { id: 'social-vertical-1080x1920', version: 1, overrides: { video: { frame_rate: { max: 24 } } } },
        output: { ...singleMp4, privacy: { location: 'strip', capture_time: 'strip', device: 'strip', descriptive: 'strip' } },
        input_info: { width: 720, height: 576, display_width: 1024, display_height: 576 },
      }),
    );
    const got = await client(fetch).jobs.retrieve('job_1');
    expect(got.preset?.version).toBe(1);
    expect(got.preset?.overrides).toEqual({ video: { frame_rate: { max: 24 } } });
    expect(got.output.kind).toBe('video');
    if (got.output.kind !== 'video') throw new Error('not video');
    expect(got.output.container.format).toBe('mp4');
    expect(got.output.renditions.sizes?.[0].fit).toBe('cover');
    expect(got.output.privacy.location).toBe('strip');
    expect(got.input_info?.display_width).toBe(1024);
  });

  it('sends an image output as written', async () => {
    const output: OutputSpec = {
      kind: 'image',
      image: {
        formats: ['avif', 'webp', 'jpeg'],
        lossless: false,
        quality: { avif: 60, webp: 80, jpeg: 82 },
        color_profile: 'keep',
        frames: { at_seconds: [1.5, 10] },
      },
      renditions: {
        sizes: [
          { label: 'by_size', width: 1920, height: 1920, fit: 'contain', orientation: 'auto', upscale: false },
          { label: 'small', width: 641, height: 17, fit: 'contain', orientation: 'auto', upscale: false },
        ],
      },
      privacy: { location: 'approximate', capture_time: 'date', device: 'keep', descriptive: 'strip' },
    };
    const { fetch, calls } = mockFetch(json(job('job_1')));
    await client(fetch).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, output });
    expect((calls[0].body as { output: unknown }).output).toEqual(output);
    expect(IMAGE_FORMATS).toEqual(['avif', 'webp', 'jpeg', 'png']);
    expect(IMAGE_TIERS).toEqual(['up_to_1mp', 'up_to_4mp', 'over_4mp']);
    expect(PRESET_CATEGORIES).toContain('image');
    expect(KINDS).toEqual(['video', 'audio', 'image']);
  });

  it('reads image outputs and their billing back from a job', async () => {
    const { fetch } = mockFetch(
      json({
        ...job('job_1', 'completed'),
        output: { ...stills, image: { ...stills.image, formats: ['avif', 'jpeg'], quality: { avif: 60, jpeg: 82 }, frames: { count: 2 } } },
        outputs: [
          { label: '1920x1080-001.avif', width: 1920, height: 1080, frames: 1, bytes: 120_000, content_type: 'image/avif', path: '1920x1080-001.avif', url: 'https://x/1', format: 'avif', rendition: '1920x1080', frame: 1, at_seconds: 3.3 },
          { label: '1920x1080-002.jpg', width: 1920, height: 1080, frames: 1, bytes: 310_000, content_type: 'image/jpeg', path: '1920x1080-002.jpg', url: 'https://x/2', format: 'jpeg', rendition: '1920x1080', frame: 2, at_seconds: 6.6 },
        ],
        billing: { billable_minutes: 0, billable_images: 2, amount_cents: 1, amount_usd: 0.004, tier: 'up_to_4mp' },
      }),
    );
    const got = await client(fetch).jobs.retrieve('job_1');
    expect(got.output.kind).toBe('image');
    expect(got.output.image?.formats).toEqual(['avif', 'jpeg']);
    expect(got.output.image?.frames).toEqual({ count: 2 });
    expect(got.outputs[1].format).toBe('jpeg');
    expect(got.outputs[1].rendition).toBe('1920x1080');
    expect(got.outputs[1].frame).toBe(2);
    expect(got.outputs[1].at_seconds).toBe(6.6);
    expect(got.billing?.billable_images).toBe(2);
    expect(got.billing?.tier).toBe('up_to_4mp');
  });

  it('generates an Idempotency-Key for jobs.create and uploads.create', async () => {
    const { fetch, calls } = mockFetch(json(job('job_1')), json({ object: 'upload', id: 'upl_1' }));
    const transcdr = client(fetch);
    await transcdr.jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'hls-av1-abr' });
    await transcdr.uploads.create({ filename: 'a.mp4', content_type: 'video/mp4', size_bytes: 1 });
    expect(calls[0].headers['idempotency-key']).toMatch(/.{16,}/);
    expect(calls[1].headers['idempotency-key']).toMatch(/.{16,}/);
    expect(calls[0].headers['idempotency-key']).not.toBe(calls[1].headers['idempotency-key']);
  });

  it('honours an explicit idempotency key and sends one even when retries are off', async () => {
    const { fetch, calls } = mockFetch(json(job('job_1')), json(job('job_2')));
    await client(fetch).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'hls-av1-abr' }, { idempotencyKey: 'mine' });
    await client(fetch, { maxRetries: 0 }).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'hls-av1-abr' });
    expect(calls[0].headers['idempotency-key']).toBe('mine');
    expect(calls[1].headers['idempotency-key']).toMatch(/.{16,}/);
  });

  it('serialises list filters, including metadata[key]=value', () => {
    expect(buildQuery({ status: 'completed', limit: 10, cursor: undefined, metadata: { customer: 'acme' } })).toBe(
      '?status=completed&limit=10&metadata%5Bcustomer%5D=acme',
    );
  });

  it('returns undefined for 204 responses', async () => {
    const { fetch } = mockFetch(new Response(null, { status: 204 }));
    await expect(client(fetch).jobs.del('job_1')).resolves.toBeUndefined();
  });

  it('asks for signed URLs without redirecting', async () => {
    const { fetch, calls } = mockFetch(json({ url: 'https://cdn/x', expires_at: 'soon' }));
    const signed = await client(fetch).jobs.outputUrl('job_1', '1080p');
    expect(signed.url).toBe('https://cdn/x');
    expect(calls[0].url).toBe('http://api.test/v1/jobs/job_1/outputs/1080p?redirect=false');
  });
});

describe('errors', () => {
  const cases: [number, string, typeof TranscdrError][] = [
    [422, 'invalid_request_error', InvalidRequestError],
    [401, 'authentication_error', AuthenticationError],
    [403, 'permission_error', PermissionError],
    [402, 'quota_error', QuotaError],
    [429, 'rate_limit_error', RateLimitError],
    [500, 'api_error', APIError],
  ];

  it.each(cases)('maps %i %s to the right class', async (status, type, Class) => {
    const { fetch } = mockFetch(
      json(
        {
          error: {
            type,
            code: 'validation_failed',
            message: 'The output.renditions field is required.',
            param: 'output.renditions',
            details: { 'output.renditions': ['The output.renditions field is required.'] },
            request_id: '3f2a-1c',
          },
        },
        status,
      ),
    );
    const error = await client(fetch, { maxRetries: 0 })
      .jobs.retrieve('job_1')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Class);
    expect(error).toBeInstanceOf(TranscdrError);
    const e = error as TranscdrError;
    expect(e.status).toBe(status);
    expect(e.type).toBe(type);
    expect(e.code).toBe('validation_failed');
    expect(e.param).toBe('output.renditions');
    expect(e.details).toEqual({ 'output.renditions': ['The output.renditions field is required.'] });
    expect(e.requestId).toBe('3f2a-1c');
    expect(e.message).toBe('The output.renditions field is required.');
  });

  it('falls back to the status and X-Request-Id for non-JSON errors', async () => {
    const { fetch } = mockFetch(new Response('Bad gateway', { status: 502, headers: { 'x-request-id': 'abc' } }));
    const error = (await client(fetch, { maxRetries: 0 })
      .status.retrieve()
      .catch((e: unknown) => e)) as TranscdrError;
    expect(error).toBeInstanceOf(APIError);
    expect(error.requestId).toBe('abc');
    expect(error.message).toBe('Bad gateway');
  });
});

describe('retries', () => {
  it('retries GETs on 5xx and then succeeds', async () => {
    const { fetch, calls } = mockFetch(json({ error: { type: 'api_error', message: 'x' } }, 503), json(job('job_1')));
    const result = await client(fetch).jobs.retrieve('job_1');
    expect(result.id).toBe('job_1');
    expect(calls).toHaveLength(2);
  });

  it('retries on 429 honouring Retry-After', async () => {
    const { fetch, calls } = mockFetch(
      json({ error: { type: 'rate_limit_error', message: 'slow down' } }, 429, { 'retry-after': '0' }),
      json(job('job_1')),
    );
    await client(fetch).jobs.retrieve('job_1');
    expect(calls).toHaveLength(2);
  });

  it('retries network errors and gives up after maxRetries', async () => {
    const { fetch, calls } = mockFetch(new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('x'));
    const error = await client(fetch, { maxRetries: 2 })
      .jobs.retrieve('job_1')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionError);
    expect(calls).toHaveLength(3);
  });

  it('retries a POST only when it carries an idempotency key', async () => {
    const fail = () => json({ error: { type: 'api_error', message: 'boom' } }, 500);
    const a = mockFetch(fail(), json(job('job_1')));
    await client(a.fetch).jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'hls-av1-abr' });
    expect(a.calls).toHaveLength(2);
    expect(a.calls[0].headers['idempotency-key']).toBe(a.calls[1].headers['idempotency-key']);

    const b = mockFetch(fail(), json(job('job_1')));
    const error = await client(b.fetch)
      .jobs.cancel('job_1')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIError);
    expect(b.calls).toHaveLength(1);
  });

  it('does not retry 4xx', async () => {
    const { fetch, calls } = mockFetch(json({ error: { type: 'invalid_request_error', message: 'no' } }, 404));
    await expect(client(fetch).jobs.retrieve('job_x')).rejects.toBeInstanceOf(InvalidRequestError);
    expect(calls).toHaveLength(1);
  });
});

describe('pagination', () => {
  it('awaits to the first page', async () => {
    const { fetch, calls } = mockFetch(json(list([job('job_3'), job('job_2')], 'job_2')));
    const page = await client(fetch).jobs.list({ status: 'completed', limit: 2 });
    expect(page.data.map((j) => j.id)).toEqual(['job_3', 'job_2']);
    expect(page.has_more).toBe(true);
    expect(calls[0].url).toBe('http://api.test/v1/jobs?status=completed&limit=2');
  });

  it('auto-paginates with the cursor', async () => {
    const { fetch, calls } = mockFetch(
      json(list([job('job_3'), job('job_2')], 'job_2')),
      json(list([job('job_1')], null)),
    );
    const ids: string[] = [];
    for await (const j of client(fetch).jobs.list({ limit: 2 }).autoPaginate()) ids.push(j.id);
    expect(ids).toEqual(['job_3', 'job_2', 'job_1']);
    expect(calls[1].url).toBe('http://api.test/v1/jobs?limit=2&cursor=job_2');
  });

  it('listAll collects every page and respects max', async () => {
    const { fetch } = mockFetch(json(list([job('job_3'), job('job_2')], 'job_2')), json(list([job('job_1')], null)));
    expect((await client(fetch).jobs.listAll()).map((j) => j.id)).toEqual(['job_3', 'job_2', 'job_1']);

    const second = mockFetch(json(list([job('job_3'), job('job_2')], 'job_2')));
    expect(await client(second.fetch).jobs.listAll({}, 1)).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });

  it('normalises bare arrays to a list', async () => {
    const { fetch } = mockFetch(json([{ object: 'job_event', type: 'created' }]));
    const events = await client(fetch).jobs.events('job_1');
    expect(events.object).toBe('list');
    expect(events.data).toHaveLength(1);
    expect(events.has_more).toBe(false);
  });
});

describe('waitFor', () => {
  it('polls until the job is terminal', async () => {
    const { fetch } = mockFetch(json(job('job_1', 'running')), json(job('job_1', 'completed')));
    const seen: string[] = [];
    const done = await client(fetch).jobs.waitFor('job_1', { pollMs: 1, onProgress: (j) => seen.push(j.status) });
    expect(done.status).toBe('completed');
    expect(seen).toEqual(['running', 'completed']);
  });

  it('throws WaitTimeoutError after timeoutMs', async () => {
    const { fetch } = mockFetch(json(job('job_1', 'running')));
    await expect(client(fetch).jobs.waitFor('job_1', { pollMs: 50, timeoutMs: 10 })).rejects.toBeInstanceOf(
      WaitTimeoutError,
    );
  });
});

describe('public endpoints', () => {
  it('stats.get fetches /v1/stats without a key', async () => {
    const { fetch, calls } = mockFetch(
      json({
        object: 'stats',
        since: '2026-01-01T00:00:00Z',
        updated_at: '2026-09-26T12:00:00Z',
        totals: { jobs_completed: 12345, output_minutes: 1.2e6, source_minutes: 4e5, bytes_delivered: 3.4e12, renditions_delivered: 50000, customers: 42 },
        last_24h: { jobs_completed: 300, output_minutes: 9000 },
        daily: [{ date: '2026-09-25', jobs_completed: 280, output_minutes: 8500 }],
      }),
    );
    const transcdr = new Transcdr({ baseUrl: 'http://api.test', fetch, retryDelayMs: 1 });
    const stats = await transcdr.stats.get();
    expect(stats.totals.jobs_completed).toBe(12345);
    expect(calls[0].url).toBe('http://api.test/v1/stats');
    expect(calls[0].headers.authorization).toBeUndefined();
  });
});

describe('integrations', () => {
  it('browses a connection with prefix and recursive flags', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'list', data: [{ object: 'remote_object', path: 'in/a.mp4', size: 3, last_modified: null }], has_more: false, next_cursor: null }));
    const page = await client(fetch).connections.browse('con_1', { prefix: 'in/', recursive: true });
    expect(page.data[0].path).toBe('in/a.mp4');
    expect(calls[0].url).toBe('http://api.test/v1/connections/con_1/browse?prefix=in%2F&recursive=true');
  });

  it('turns a connection off and back on', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'connection', id: 'con_1', enabled: false }), json({ object: 'connection', id: 'con_1', enabled: true }));
    const t = client(fetch);
    expect((await t.connections.disable('con_1')).enabled).toBe(false);
    expect((await t.connections.enable('con_1')).enabled).toBe(true);
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['PATCH', 'http://api.test/v1/connections/con_1', { enabled: false }],
      ['PATCH', 'http://api.test/v1/connections/con_1', { enabled: true }],
    ]);
  });

  it('reads a queue automation now', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'automation_run', messages_received: 3, messages_deleted: 3, jobs_created: 2 }));
    const run = await client(fetch).automations.run('aut_q');
    expect(run).toMatchObject({ messages_received: 3, messages_deleted: 3, jobs_created: 2 });
    expect(calls[0].url).toBe('http://api.test/v1/automations/aut_q/run');
  });

  it('triggers an automation and delivers a job', async () => {
    const { fetch, calls } = mockFetch(
      json({ object: 'automation_run', jobs_created: 1, job_ids: ['job_1'] }),
      json({ object: 'delivery', id: 'dlv_1', status: 'pending' }),
      json({ object: 'delivery', id: 'dlv_1', status: 'pending' }),
    );
    const t = client(fetch);
    expect((await t.automations.trigger('aut_1', { path: 'in/a.mp4' })).job_ids).toEqual(['job_1']);
    await t.jobs.deliver('job_1', { connection_id: 'con_1', prefix: 'out/{job_id}/' });
    await t.deliveries.retry('dlv_1');
    expect(calls[0].body).toEqual({ path: 'in/a.mp4' });
    expect(calls[1].url).toBe('http://api.test/v1/jobs/job_1/deliveries');
    expect(calls[1].body).toEqual({ connection_id: 'con_1', prefix: 'out/{job_id}/' });
    expect(calls[2].url).toBe('http://api.test/v1/deliveries/dlv_1/retry');
  });
});

describe('announcements', () => {
  const credit = {
    object: 'announcement',
    id: 'ann_c',
    kind: 'service_credit',
    title: 'Audio dropped from some outputs',
    body: 'We credited 3x.',
    published_at: '2026-09-27T09:00:00Z',
    link: null,
    tags: [],
    credit: { incident_id: 'inc_1', amount_usd: 0.2563, multiplier: 3, jobs: ['job_1', 'job_2'], applied_at: '2026-09-27T09:00:00Z' },
    seen: false,
    seen_at: null,
  };

  it('lists unseen announcements and marks them seen', async () => {
    const { fetch, calls } = mockFetch(json(list([credit], null)), json(undefined, 204), json(undefined, 204));
    const t = client(fetch);
    const page = await t.announcements.list({ unseen: true, kind: 'service_credit', limit: 5 });
    expect(page.data[0].credit?.jobs).toHaveLength(2);
    await t.announcements.markSeen(['ann_c', 'ann_2']);
    await t.announcements.markAllSeen();
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['GET', 'http://api.test/v1/announcements?kind=service_credit&limit=5&unseen=true', undefined],
      ['POST', 'http://api.test/v1/announcements/seen', { ids: ['ann_c', 'ann_2'] }],
      ['POST', 'http://api.test/v1/announcements/seen', { all: true }],
    ]);
  });

  it('skips marking an empty list and omits unseen=false', async () => {
    const { fetch, calls } = mockFetch(json(list([], null)));
    const t = client(fetch);
    await t.announcements.markSeen([]);
    await t.announcements.list({ unseen: false });
    expect(calls.map((c) => c.url)).toEqual(['http://api.test/v1/announcements']);
  });

  it('pages through the public changelog without a key', async () => {
    const entry = (id: string) => ({ ...credit, id, kind: 'changelog', credit: null, tags: ['integrations'] });
    const { fetch, calls } = mockFetch(json(list([entry('ann_1')], 'ann_1')), json(list([entry('ann_2')], null)));
    const transcdr = new Transcdr({ baseUrl: 'http://api.test', fetch, retryDelayMs: 1 });
    const all = await transcdr.changelog.list({ limit: 1 }).toArray();
    expect(all.map((a) => a.id)).toEqual(['ann_1', 'ann_2']);
    expect(calls.map((c) => c.url)).toEqual([
      'http://api.test/v1/changelog?limit=1',
      'http://api.test/v1/changelog?limit=1&cursor=ann_1',
    ]);
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it('lets operators write changelog entries and drafts', async () => {
    const draft = { ...credit, id: 'ann_d', kind: 'changelog', credit: null, published_at: null };
    const { fetch, calls } = mockFetch(
      json(list([draft], null)),
      json(draft),
      json({ ...draft, published_at: '2026-09-27T10:00:00Z' }),
      json(undefined, 204),
    );
    const t = client(fetch);
    expect((await t.admin.announcements.list({ limit: 100 })).data[0].published_at).toBeNull();
    await t.admin.announcements.create({ title: 'New', body: '**Hi**', tags: ['api'], link: { label: 'Docs', url: '/docs' }, published_at: null });
    await t.admin.announcements.update('ann_d', { published_at: '2026-09-27T10:00:00Z' });
    await t.admin.announcements.del('ann_d');
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['GET', 'http://api.test/v1/admin/announcements?limit=100', undefined],
      ['POST', 'http://api.test/v1/admin/announcements', { title: 'New', body: '**Hi**', tags: ['api'], link: { label: 'Docs', url: '/docs' }, published_at: null }],
      ['PATCH', 'http://api.test/v1/admin/announcements/ann_d', { published_at: '2026-09-27T10:00:00Z' }],
      ['DELETE', 'http://api.test/v1/admin/announcements/ann_d', undefined],
    ]);
  });
});

describe('uploads', () => {
  it('creates, PUTs the bytes to upload_url, and completes', async () => {
    const { fetch, calls } = mockFetch(
      json({
        object: 'upload',
        id: 'upl_1',
        asset_id: 'ast_1',
        status: 'pending',
        upload_url: '/media/signed-token',
        upload_method: 'PUT',
        upload_headers: { 'Content-Type': 'video/mp4' },
        expires_at: '2026-09-27T00:00:00Z',
      }),
      new Response(null, { status: 200 }),
      json({ object: 'asset', id: 'ast_1', status: 'ready' }),
    );
    const progress: number[] = [];
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const asset = await client(fetch).uploads.uploadFile(bytes, {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      onProgress: (p) => progress.push(p.percent),
    });
    expect(asset.id).toBe('ast_1');
    expect(calls[0].body).toEqual({ filename: 'clip.mp4', content_type: 'video/mp4', size_bytes: 4 });
    expect(calls[1].url).toBe('http://api.test/media/signed-token');
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].headers.authorization).toBeUndefined();
    expect(calls[2].url).toBe('http://api.test/v1/uploads/upl_1/complete');
    expect(progress).toEqual([0, 100]);
  });
});

describe('billing', () => {
  const summary = { object: 'billing', account: { available_usd: 12.5 } };

  it('starts a checkout for a plan or for credit', async () => {
    const { fetch, calls } = mockFetch(
      json({ object: 'checkout', url: 'https://pay.test/s', changed: false }),
      json({ object: 'checkout', url: 'https://pay.test/c', changed: false }),
    );
    const t = client(fetch);
    const sub = await t.billing.checkout({ plan: 'growth' });
    const buy = await t.billing.checkout({ creditCents: 5000 });
    expect(sub.url).toBe('https://pay.test/s');
    expect(buy.url).toBe('https://pay.test/c');
    expect(calls[0].url).toBe('http://api.test/v1/billing/checkout');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({ plan: 'growth' });
    expect(calls[1].body).toEqual({ credit_cents: 5000 });
  });

  it('opens the portal, updates settings and lists transactions', async () => {
    const { fetch, calls } = mockFetch(
      json({ object: 'portal', url: 'https://pay.test/p' }),
      json(summary),
      json(list([{ object: 'credit_transaction', id: 'ctx_1', kind: 'usage', amount_usd: -0.25 }], null)),
      json(summary),
    );
    const t = client(fetch);
    expect((await t.billing.portal()).url).toBe('https://pay.test/p');
    const updated = await t.billing.updateSettings({
      monthly_limit_cents: null,
      auto_recharge: { enabled: true, threshold_cents: 1000, amount_cents: 5000 },
    });
    expect(updated.account.available_usd).toBe(12.5);
    const ledger = await t.billing.transactions({ limit: 10 });
    expect(ledger.data[0].amount_usd).toBe(-0.25);
    await t.billing.changePlan('scale');
    expect(calls[0].url).toBe('http://api.test/v1/billing/portal');
    expect(calls[0].method).toBe('POST');
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].url).toBe('http://api.test/v1/billing/settings');
    expect(calls[1].body).toEqual({
      monthly_limit_cents: null,
      auto_recharge: { enabled: true, threshold_cents: 1000, amount_cents: 5000 },
    });
    expect(calls[2].url).toBe('http://api.test/v1/billing/transactions?limit=10');
    expect(calls[3].url).toBe('http://api.test/v1/billing/plan');
    expect(calls[3].body).toEqual({ plan: 'scale' });
  });

  it('sends a job cost cap and surfaces credit errors as QuotaError', async () => {
    const { fetch, calls } = mockFetch(
      json({ error: { type: 'quota_error', code: 'insufficient_credit', message: 'Not enough credit.' } }, 402),
    );
    const error = await client(fetch, { maxRetries: 0 })
      .jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'hls-av1-abr', maxCostCents: 150 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(QuotaError);
    expect(error.code).toBe('insufficient_credit');
    expect(calls[0].body).toEqual({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'hls-av1-abr', max_cost_cents: 150 });
  });
});
