import { describe, expect, it } from 'vitest';
import { Transcdr } from '../src';
import { json, mockFetch } from './helpers';

function client(fetch: ReturnType<typeof mockFetch>['fetch']) {
  return new Transcdr({ apiKey: 'tds_test', baseUrl: 'http://api.test', fetch, retryDelayMs: 1 });
}

describe('usage', () => {
  it('reads the input report for a range', async () => {
    const report = {
      object: 'input_report',
      from: '2026-09-01',
      to: '2026-09-30',
      unmeasured: 1,
      kinds: [{ kind: 'mp4/h264', container: 'mp4', video_codec: 'h264', files: 2, size_bytes: 22_000_000, input_minutes: 2.07, billable_minutes: 4.13 }],
      points: [
        {
          kind: 'mp4/h264',
          files: 2,
          size_bytes: 22_000_000,
          input_minutes: 2.07,
          billable_minutes: 4.13,
          mean_duration_seconds: 62,
          mean_size_bytes: 11_000_000,
          duration_range: [56.23, 100],
          size_range: [10_000_000, 17_782_794],
        },
      ],
    };
    const { fetch, calls } = mockFetch(json(report));
    const res = await client(fetch).usage.inputs({ from: '2026-09-01', to: '2026-09-30' });
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://api.test/v1/usage/inputs?from=2026-09-01&to=2026-09-30');
    expect(res.points[0].mean_duration_seconds).toBe(62);
    expect(res.kinds[0].kind).toBe('mp4/h264');
  });
});
