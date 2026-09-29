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

  it('reads image usage, rates and capabilities', async () => {
    const usage = {
      object: 'usage',
      from: '2026-09-01',
      to: '2026-09-30',
      granularity: 'day',
      totals: { jobs: 2, billable_minutes: 1.5, billable_images: 4, input_minutes: 1.5, output_bytes: 9, amount_cents: 3, amount_usd: 0.025 },
      by_tier: { sd: 0, hd: 1.5, uhd: 0 },
      by_image_tier: { up_to_1mp: 1, up_to_4mp: 1, over_4mp: 2 },
      by_codec: { av1: 1.5, h264: 0, h265: 0 },
      series: [{ date: '2026-09-01', jobs: 2, billable_minutes: 1.5, billable_images: 4, amount_cents: 3, amount_usd: 0.025 }],
    };
    const imageRates = {
      unit: 'output_image',
      currency: 'usd',
      up_to_1mp: 0.001,
      up_to_4mp: 0.002,
      over_4mp: 0.004,
      tiers: { up_to_1mp: 'up to 1 megapixel', up_to_4mp: 'over 1, up to 4 megapixels', over_4mp: 'over 4 megapixels' },
    };
    const caps = {
      object: 'capabilities',
      image_formats: [
        { id: 'avif', name: 'AVIF', default: true, lossy: true, lossless: false, alpha: true, default_quality: 60 },
        { id: 'png', name: 'PNG', default: false, lossy: false, lossless: true, alpha: true },
      ],
      input_image_formats: ['jpeg', 'png', 'heic'],
      limits: { image: { min_dimension: 16, max_dimension: 8192, max_outputs: 200, max_frames: 100, max_input_megapixels: 100 } },
    };
    const { fetch } = mockFetch(
      json(usage),
      json({ object: 'billing', rates: {}, image_rates: imageRates, usage_minutes: 1.5, usage_images: 4 }),
      json({ object: 'list', data: [{ object: 'plan', id: 'free', image_rates: imageRates }], has_more: false, next_cursor: null }),
      json(caps),
      json({ object: 'billing', usage_minutes: 0 }),
    );
    const t = client(fetch);
    const u = await t.usage.retrieve();
    expect(u.totals.billable_images).toBe(4);
    expect(u.by_image_tier?.over_4mp).toBe(2);
    expect(u.series[0].billable_images).toBe(4);
    const b = await t.billing.retrieve();
    expect(b.image_rates?.unit).toBe('output_image');
    expect(b.usage_images).toBe(4);
    const plans = await t.plans.list();
    expect(plans.data[0].image_rates?.over_4mp).toBe(0.004);
    const c = await t.capabilities.retrieve();
    expect(c.image_formats?.[0].default_quality).toBe(60);
    expect(c.image_formats?.[1].default_quality).toBeUndefined();
    expect(c.input_image_formats).toContain('heic');
    expect(c.limits?.image?.max_dimension).toBe(8192);
    // An older server leaves the image fields out.
    const old = await t.billing.retrieve();
    expect(old.image_rates).toBeUndefined();
    expect(old.usage_images).toBeUndefined();
  });
});
