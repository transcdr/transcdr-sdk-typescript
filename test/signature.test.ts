import { describe, expect, it } from 'vitest';
import { Transcdr, TranscdrError, computeSignature, constructEvent, signPayload, verifySignature } from '../src';

// Known vector, computed independently with Node's crypto:
// hmac_sha256("whsec_test_secret", '1700000000.{"id":"evt_1","type":"job.completed"}')
const SECRET = 'whsec_test_secret';
const TIMESTAMP = 1_700_000_000;
const BODY = '{"id":"evt_1","type":"job.completed"}';
const EXPECTED = '76323e66a6eb95011512d61a834db013378975ecf841d3d43eb14fcb08fbb0e4';
const HEADER = `t=${TIMESTAMP},v1=${EXPECTED}`;

describe('webhook signatures', () => {
  it('computes the known HMAC-SHA256 vector', async () => {
    expect(await computeSignature(BODY, SECRET, TIMESTAMP)).toBe(EXPECTED);
    expect(await signPayload(BODY, SECRET, TIMESTAMP)).toBe(HEADER);
  });

  it('verifies a valid header within tolerance (string and bytes)', async () => {
    expect(await verifySignature(BODY, HEADER, SECRET, { now: TIMESTAMP + 100 })).toBe(true);
    expect(await verifySignature(new TextEncoder().encode(BODY), HEADER, SECRET, { now: TIMESTAMP })).toBe(true);
  });

  it('rejects stale timestamps, wrong secrets and tampered bodies', async () => {
    expect(await verifySignature(BODY, HEADER, SECRET, { now: TIMESTAMP + 301 })).toBe(false);
    expect(await verifySignature(BODY, HEADER, 'whsec_other', { now: TIMESTAMP })).toBe(false);
    expect(await verifySignature(BODY.replace('evt_1', 'evt_2'), HEADER, SECRET, { now: TIMESTAMP })).toBe(false);
  });

  it('rejects malformed headers', async () => {
    for (const header of ['', 'garbage', `t=${TIMESTAMP}`, `v1=${EXPECTED}`, `t=abc,v1=${EXPECTED}`]) {
      expect(await verifySignature(BODY, header, SECRET, { now: TIMESTAMP })).toBe(false);
    }
    expect(await verifySignature(BODY, null, SECRET)).toBe(false);
  });

  it('accepts any matching v1 among several (secret rotation)', async () => {
    const header = `t=${TIMESTAMP},v1=${'0'.repeat(64)},v1=${EXPECTED}`;
    expect(await verifySignature(BODY, header, SECRET, { now: TIMESTAMP })).toBe(true);
  });

  it('uses the current time by default', async () => {
    const header = await signPayload(BODY, SECRET);
    expect(await verifySignature(BODY, header, SECRET)).toBe(true);
    const transcdr = new Transcdr({ fetch: async () => new Response() });
    expect(await transcdr.webhooks.verifySignature(BODY, header, SECRET, 300)).toBe(true);
  });

  it('constructEvent parses verified payloads and throws on bad ones', async () => {
    const event = await constructEvent<{ id: string }>(BODY, HEADER, SECRET, { now: TIMESTAMP });
    expect(event.id).toBe('evt_1');
    await expect(constructEvent(BODY, HEADER, 'nope', { now: TIMESTAMP })).rejects.toBeInstanceOf(TranscdrError);
  });
});
