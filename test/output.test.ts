import { describe, expect, it } from 'vitest';
import {
  InvalidRequestError,
  Transcdr,
  validateOutput,
  type FieldError,
  type OutputOverrides,
  type OutputSpec,
  type VideoOutput,
} from '../src';
import fixtures from './fixtures/output-validation-cases.json';
import { json, mockFetch } from './helpers';
import { audioMp3, examples, hlsCbr, singleMp4, stills } from './specs';

function client(fetch: ReturnType<typeof mockFetch>['fetch']) {
  return new Transcdr({ apiKey: 'tdk_test_abc', baseUrl: 'http://api.test', fetch, retryDelayMs: 1, maxRetries: 0 });
}

const job = (id: string) => ({ object: 'job', id, status: 'queued', progress: { percent: 0 } });

interface Case {
  name: string;
  output: unknown;
  errors: FieldError[];
}

const cases: Case[] = fixtures;

describe('validateOutput', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(validateOutput(c.output)).toEqual(c.errors);
  });

  it('passes every complete example', () => {
    for (const spec of Object.values(examples)) expect(validateOutput(spec)).toEqual([]);
  });

  it('refuses what is not an object', () => {
    expect(validateOutput(null)).toEqual([{ param: 'output', message: 'output must be an object.' }]);
    expect(validateOutput([])).toEqual([{ param: 'output', message: 'output must be an object.' }]);
  });
});

describe('the types', () => {
  it('require every field of a kind, and exactly one choice of a group', () => {
    // @ts-expect-error frame_rate is required
    const noFrameRate: VideoOutput = { ...singleMp4, video: { codec: 'h264', quality: 'high', bit_depth: 'from_color', color: 'sdr', gop: { seconds: 2 }, filters: [] } };
    // @ts-expect-error quality and crf are one choice
    const twoRates: VideoOutput = { ...singleMp4, video: { ...singleMp4.video, crf: 23 } };
    // @ts-expect-error without a preset, privacy needs all four categories
    const partialPrivacy: OutputSpec = { ...audioMp3, privacy: { location: 'keep' } };
    const refinedPrivacy: OutputSpec = { ...audioMp3, privacy: { preset: 'strip_all', location: 'approximate' } };
    // @ts-expect-error a lossy codec needs a bitrate
    const noBitrate: OutputSpec = { ...audioMp3, audio: { handling: 'encode', codec: 'aac', channels: 'stereo', he_aac: 'auto' } };
    // @ts-expect-error audio output has no video section
    const audioWithVideo: OutputSpec = { ...audioMp3, video: singleMp4.video };
    // @ts-expect-error an image has no ladder
    const imageLadder: OutputSpec = { ...stills, renditions: { ladder: { max_short_side: 1080, fit: 'contain', upscale: false } } };
    const overrides: OutputOverrides = { video: { frame_rate: { max: 24 } }, container: { format: 'mp4', segment_seconds: null } };
    expect([noFrameRate, twoRates, partialPrivacy, refinedPrivacy, noBitrate, audioWithVideo, imageLadder, overrides]).toHaveLength(8);
  });
});

describe('sending a spec', () => {
  it('checks a whole spec before sending it, listing every missing field', async () => {
    const { fetch, calls } = mockFetch();
    const incomplete = { kind: 'audio', container: { format: 'mp3' }, audio: { handling: 'encode', codec: 'mp3' } } as unknown as OutputSpec;
    const error = await client(fetch)
      .jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, output: incomplete })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidRequestError);
    const e = error as InvalidRequestError;
    expect(e.code).toBe('validation_failed');
    expect(e.param).toBe('output.privacy');
    expect(e.errors.map((x) => x.param)).toEqual([
      'output.privacy',
      'output.audio.bitrate',
      'output.audio.channels',
      'output.audio.he_aac',
    ]);
    expect(e.message).toBe(e.errors[0].message);
    expect(calls).toHaveLength(0);
  });

  it('refuses a job with neither a preset nor an output', async () => {
    const { fetch, calls } = mockFetch();
    const params = { input: { type: 'asset', asset_id: 'ast_1' } } as unknown as Parameters<Transcdr['jobs']['create']>[0];
    await expect(client(fetch).jobs.create(params)).rejects.toBeInstanceOf(InvalidRequestError);
    expect(calls).toHaveLength(0);
  });

  it('sends a preset with partial overrides unchecked, versions pinned as written', async () => {
    const { fetch, calls } = mockFetch(json(job('job_1')));
    await client(fetch).jobs.create({
      input: { type: 'asset', asset_id: 'ast_1' },
      preset: 'social-vertical-1080x1920@1',
      output: { video: { frame_rate: { max: 24 } } },
    });
    expect(calls[0].body).toEqual({
      input: { type: 'asset', asset_id: 'ast_1' },
      preset: 'social-vertical-1080x1920@1',
      output: { video: { frame_rate: { max: 24 } } },
    });
  });

  it('checks presets on create and replace, not on update', async () => {
    const { fetch, calls } = mockFetch(json({ object: 'preset', id: 'pre_1' }));
    const t = client(fetch);
    const partial = { kind: 'video' } as unknown as OutputSpec;
    await expect(t.presets.create({ name: 'x', output: partial })).rejects.toBeInstanceOf(InvalidRequestError);
    await expect(t.presets.replace('pre_1', { name: 'x', output: partial })).rejects.toBeInstanceOf(InvalidRequestError);
    expect(calls).toHaveLength(0);
    await t.presets.update('pre_1', { output: { container: { format: 'mp4', segment_seconds: null } } });
    expect(calls[0].body).toEqual({ output: { container: { format: 'mp4', segment_seconds: null } } });
  });

  it('reads every failure of a 422 into errors', async () => {
    const errors = [
      { param: 'output.audio.bitrate', message: 'output.audio.bitrate is required when …' },
      { param: 'output.privacy', message: 'output.privacy is required: …' },
    ];
    const { fetch } = mockFetch(
      json(
        { error: { type: 'invalid_request_error', code: 'validation_failed', param: errors[0].param, message: errors[0].message, errors } },
        422,
      ),
    );
    const e = (await client(fetch)
      .jobs.create({ input: { type: 'asset', asset_id: 'ast_1' }, preset: 'podcast-mp3' })
      .catch((x: unknown) => x)) as InvalidRequestError;
    expect(e).toBeInstanceOf(InvalidRequestError);
    expect(e.param).toBe('output.audio.bitrate');
    expect(e.errors).toEqual(errors);
  });

  it('gives an empty errors list for other errors', async () => {
    const { fetch } = mockFetch(json({ error: { type: 'invalid_request_error', code: 'not_found', message: 'x' } }, 404));
    const e = (await client(fetch).jobs.retrieve('job_1').catch((x: unknown) => x)) as InvalidRequestError;
    expect(e.errors).toEqual([]);
  });
});

describe('preset versions', () => {
  it('lists the versions and gets one', async () => {
    const version = { object: 'preset_version', version: 2, output: hlsCbr, created_at: '2026-09-29T00:00:00Z' };
    const { fetch, calls } = mockFetch(
      json({ object: 'list', data: [version], has_more: false, next_cursor: null }),
      json({ object: 'preset', id: 'pre_1', slug: 'my abr', version: 2, output: hlsCbr }),
    );
    const t = client(fetch);
    const list = await t.presets.versions('pre_1');
    expect(list.data[0].version).toBe(2);
    expect(list.data[0].output.kind).toBe('video');
    const got = await t.presets.getVersion('my abr', 2);
    expect(got.version).toBe(2);
    expect(calls[0].url).toBe('http://api.test/v1/presets/pre_1/versions');
    expect(calls[1].url).toBe('http://api.test/v1/presets/my%20abr@2');
  });
});

describe('automations and capabilities', () => {
  it('reads an automation\'s overrides and resolved spec', async () => {
    const { fetch } = mockFetch(
      json({
        object: 'automation',
        id: 'aut_1',
        preset: 'hls-h264-abr@1',
        output: { audio: { codec: 'opus' } },
        resolved_output: hlsCbr,
      }),
    );
    const got = await client(fetch).automations.retrieve('aut_1');
    expect(got.output).toEqual({ audio: { codec: 'opus' } });
    expect(got.resolved_output?.kind).toBe('video');
  });

  it('reads the output capabilities', async () => {
    const { fetch } = mockFetch(
      json({
        output: {
          version: 2,
          kinds: ['video', 'audio', 'image'],
          fields: [
            {
              path: 'container.segment_seconds',
              required: true,
              when: [{ kind: ['video'], 'container.format': ['hls'] }],
              shape: { type: 'number', min: 1, max: 20, words: [] },
              group: null,
              description: 'Seconds per HLS segment.',
            },
          ],
          groups: [{ name: 'video.rate', members: ['video.quality', 'video.crf', 'video.cbr'], when: [{ kind: ['video'] }], exactly_one: true }],
          conditions: '…',
          containers: [{ id: 'mp3', kind: 'audio', audio_codecs: ['mp3'] }],
          audio_codecs: [{ id: 'mp3', name: 'MP3', lossless: false, max_channels: 2, bitrates: ['32k'] }],
          follow_values: { 'trim.end: source': 'the end of the source' },
          compatibility: {
            v1_requests: 'accepted',
            v1_responses: { header: 'Transcdr-Output-Spec', value: 'v1', query: 'output_spec=v1 (GET)', sunset: 'Wed, 31 Mar 2027 00:00:00 GMT' },
          },
        },
      }),
    );
    const caps = await client(fetch).capabilities.retrieve();
    expect(caps.output?.version).toBe(2);
    expect(caps.output?.fields[0].when[0]['container.format']).toEqual(['hls']);
    expect(caps.output?.groups[0].members).toContain('video.crf');
    expect(caps.output?.compatibility.v1_responses.header).toBe('Transcdr-Output-Spec');
  });
});
