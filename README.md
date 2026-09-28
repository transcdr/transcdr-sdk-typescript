# @transcdr/sdk

The official TypeScript SDK for [Transcdr](https://transcdr.com): GPU-accelerated AV1, H.264 and H.265 transcoding
with MP4 and CMAF/HLS output, behind one small REST API.

- Zero runtime dependencies. Uses the platform `fetch`.
- Works in Node 18+, Deno, Bun, edge runtimes and browsers.
- ESM and CommonJS builds with full type definitions for every API object.
- Automatic retries with backoff, safe idempotency keys, cursor pagination helpers.
- Webhook signature verification on Web Crypto.

## Install

The package is installed from GitHub (it is not on the npm registry); it builds on install:

```sh
npm install github:transcdr/transcdr-sdk-typescript#v0.5.0
```

It is imported as `@transcdr/sdk`.

## Quickstart

Upload a file, transcode it to an AV1 HLS ladder, wait for it, and get the playlist.

```ts
import { readFile } from 'node:fs/promises';
import { Transcdr } from '@transcdr/sdk';

const transcdr = new Transcdr({ apiKey: process.env.TRANSCDR_API_KEY });

// 1. Upload: creates an upload session, PUTs the bytes to the presigned URL, completes it.
const asset = await transcdr.uploads.uploadFile(await readFile('keynote.mov'), {
  filename: 'keynote.mov',
  contentType: 'video/quicktime',
});

// 2. Transcode with a system preset (override any field with `output`).
const job = await transcdr.jobs.create({
  input: { type: 'asset', asset_id: asset.id },
  preset: 'hls-av1-abr',
  metadata: { customer: 'acme' },
});

// 3. Wait. In production, prefer the job.completed webhook.
const done = await transcdr.jobs.waitFor(job.id, {
  pollMs: 2000,
  onProgress: (j) => console.log(`${j.status} ${j.progress.stage} ${j.progress.percent.toFixed(1)}%`),
});

if (done.status !== 'completed') {
  throw new Error(`Job ${done.status}: ${done.error?.code} ${done.error?.message}`);
}

// 4. Download. Output URLs need your key and redirect to short-lived signed URLs.
for (const output of done.outputs) {
  const { url, expires_at } = await transcdr.jobs.outputUrl(done.id, output.label);
  console.log(output.label, url, expires_at);
}

// HLS: hand done.playback_url to a player. It is signed, valid for 6 hours, needs no
// Authorization header, and the playlist's relative segment paths resolve under it.
// (done.playlist_url is the bearer-authenticated API URL of the same master playlist.)
console.log(done.playback_url);
```

Already hosting the source? Skip the upload:

```ts
await transcdr.jobs.create({ input: { type: 'url', url: 'https://example.com/in.mp4' }, preset: 'web-av1-1080p' });
```

### Constant bit rate

By default each rendition is coded to a quality level (`quality.target`, or a `crf`), so its bitrate follows the
content. When a player, network or broadcast chain needs predictable bandwidth, set `quality.target: 'cbr'` and
every rendition is coded at a constant bit rate: its own `bitrate`, else `quality.bitrate`, else a default for
its resolution and codec (H.264 about 5 Mb/s at 1080p30, 3 at 720p, 1.2 at 480p and 0.8 at 360p; H.265 about
0.65× that and AV1 about 0.5×; more above 30 fps). `quality.buffer_ms` (100–10000, default 1000) sets the rate
buffer. Rates are 100k to 200M.

```ts
await transcdr.jobs.create({
  input,
  output: {
    mode: 'hls',
    codec: 'h264',
    renditions: [
      { width: 1920, height: 1080, bitrate: '5M' },
      { width: 1280, height: 720 }, // takes quality.bitrate
    ],
    quality: { target: 'cbr', bitrate: '3M', buffer_ms: 1000 },
  },
});
```

`crf` with `'cbr'` is refused, and so is a rendition `bitrate`, `quality.bitrate` or `buffer_ms` without it. The
`hls-h264-cbr` system preset is H.264 HLS at 5M, 3M, 1200k and 800k for 1080p, 720p, 480p and 360p.

### Rendition sizes are maximums: fit and upscale

A rendition's `width` × `height` is the largest it may be, not its exact size. The video keeps its shape inside the
box, a portrait video turns a landscape box portrait, and nothing is enlarged past the source: a 640×480 video
through a 1920×1080 rendition comes out 640×480 (and is billed as SD). Each output reports the size it came out at.

- `fit: 'contain'` (default) keeps the shape inside the box; `'cover'` fills the box and centre-crops; `'pad'` adds
  black bars to exactly the box; `'stretch'` distorts the picture to exactly the box.
- `upscale: true` lets a rendition be larger than the source. Without it, renditions that would come out the same
  size are produced once.
- A rendition may set its own `fit`, `upscale` and `orientation` (`'fixed'` keeps its box as written).

```ts
await transcdr.jobs.create({
  input,
  output: {
    renditions: [
      { width: 1920, height: 1080 }, // up to 1080p, the video's own shape
      { width: 1080, height: 1920, fit: 'cover', orientation: 'fixed' }, // 9:16, a landscape video cropped
    ],
    fit: 'contain',
    upscale: false,
  },
});
```

### Audio: AAC, lossless, MP3, audio-only, channels

`audio.mode` is `'auto'` (the default: compatible audio passes through, the rest becomes Opus), `'opus'`, `'aac'`,
`'mp3'`, `'flac'`, `'alac'` or `'drop'`.

- `'aac'` is AAC-LC, the audio that plays on the most devices: every browser, iPhone, Android phone and TV. An AAC
  source passes through. It works in a single MP4, HLS and audio-only `.m4a` output. `bitrate` is 8k to 288k per main
  channel (the LFE of 5.1 and 7.1 does not count); the default is 64k mono, 128k stereo, 384k 5.1 and 512k 7.1.
- `'flac'` and `'alac'` are lossless: a source already in that codec is copied, and they take no `bitrate`. Both work
  in a single MP4, HLS and audio-only output. `audio.bit_depth` is `'source'` (the default: 16-bit for a 16-bit or
  lossy source, 24-bit for a deeper one), `'16'` or `'24'`. For FLAC, `audio.flac_compression` is `'fast'`,
  `'default'` or `'best'`: the same audio either way, a smaller file for more work.
- `'mp3'` is constant bit rate, stereo at most, in a single MP4 or audio-only output (not HLS); its `bitrate` is one
  of 32k, 40k, 48k, 56k, 64k, 80k, 96k, 112k, 128k, 160k, 192k, 224k, 256k or 320k (default 128k stereo, 64k mono).

AAC sources are decoded, so they can be downmixed or made Opus, MP3, FLAC or ALAC; they still pass through wherever
nothing asks for a change. HE-AAC is decoded only as its AAC-LC core (no spectral band replication or parametric
stereo: half the rate, less bandwidth), and `audio.he_aac` (`HE_AAC`) says what an HE-AAC source becomes: `'auto'`
(the default) passes it through when only a codec change is asked and decodes its core when the job needs PCM (a
downmix, an `.mp3` or `.flac` file); `'passthrough'` never decodes it, failing a job that would need it; `'core'`
decodes its core whenever another codec is asked. AAC-LC sources are decoded in full whatever it says.

`mode: 'audio'` writes the audio alone as one file (label `audio`, width and height 0), billed per output minute at
the SD rate. `audio.container` picks the file: `'auto'` (the default) follows the codec, a `.flac` for FLAC, an
`.m4a` for ALAC and an `.mp3` otherwise (`'auto'` audio is then MP3); `'m4a'` holds any codec (`'auto'` audio in an
`.m4a` is Opus); `'flac'` holds FLAC only and `'mp3'` MP3 only. The file is `audio.mp3` (`audio/mpeg`), `audio.flac`
(`audio/flac`) or `audio.m4a` (`audio/mp4`). `container` applies only to mode `'audio'`. A `single` job whose input
has no video becomes audio-only by itself; with AAC or Opus audio it is an `.m4a`.

`audio.channels` is `'source'` (the default), `'mono'`, `'stereo'`, `'5.1'` or `'7.1'` (`AUDIO_CHANNELS`); it
downmixes and never upmixes. In HLS with surround audio, `audio.stereo_fallback: true` adds a stereo rendition to the
same audio group for players that cannot play surround.

```ts
// A podcast episode from a video recording.
await transcdr.jobs.create({ input, output: { mode: 'audio', audio: { mode: 'mp3', bitrate: '128k', channels: 'stereo' } } });

// AAC in an .m4a for phones and browsers.
await transcdr.jobs.create({ input, output: { mode: 'audio', audio: { mode: 'aac', container: 'm4a' } } });

// A lossless 24-bit FLAC master.
await transcdr.jobs.create({ input, output: { mode: 'audio', audio: { mode: 'flac', bit_depth: '24', flac_compression: 'best' } } });

// Stereo Opus from any source, never decoding an HE-AAC one to its core.
await transcdr.jobs.create({ input, output: { codec: 'h264', audio: { mode: 'opus', channels: 'stereo', he_aac: 'passthrough' } } });

// Surround AAC in HLS with a stereo rendition beside it.
await transcdr.jobs.create({ input, output: { mode: 'hls', codec: 'h264', audio: { mode: 'aac', channels: '5.1', stereo_fallback: true } } });
```

Audio system presets (category `audio`): `audio-mp3-podcast` and `audio-mp3-speech` (MP3 at 128k stereo and 64k
mono), `audio-aac-m4a` (AAC in an `.m4a`) and `audio-alac-m4a` (Apple Lossless in an `.m4a`). In category `archive`,
`audio-flac` is a native `.flac` at best compression and `archive-av1-flac` is visually lossless AV1 with FLAC audio
in one MP4. The reach presets (`mp4-h264-compat-1080p`, `mp4-h265-1080p`, `hls-h264-abr`, `hls-h264-cbr`,
`social-vertical-1080x1920`, `hls-h264-surround` and `mp4-h264-surround-1080p`, now in category `tv`) use AAC audio.

## Configuration

```ts
const transcdr = new Transcdr({
  apiKey: 'tdk_live_…',              // API key (tdk_live_/tdk_test_) or session token (tds_)
  baseUrl: 'https://api.transcdr.com', // default
  maxRetries: 2,                      // retries for 429, 5xx and network errors (default 2)
  timeoutMs: 60_000,                  // per attempt (default 60 s)
  retryDelayMs: 500,                  // backoff base (default 500 ms)
  fetch: customFetch,                 // optional fetch implementation
  headers: { 'X-Team': 'video' },     // sent with every request
});

transcdr.setApiKey(token); // e.g. after transcdr.auth.login(...)
```

Every method also takes a trailing `RequestOptions` (`signal`, `timeoutMs`, `maxRetries`, `headers`,
`idempotencyKey`).

## Resources

| Namespace | Methods |
|---|---|
| `auth` | `register`, `login`, `switch`, `logout`, `me`, `changePassword` |
| `organization` | `retrieve`, `update`, `members.list`, `members.create`, `members.update`, `members.del`, `members.leave`, `rotateJobWebhookSecret` |
| `organizations` | session tokens only: `list` (the user's memberships), `create` |
| `apiKeys` | `list`, `listAll`, `retrieve` (404 once revoked), `create`, `revoke` (`del`) |
| `uploads` | `create`, `complete`, `uploadFile` |
| `assets` | `list`, `listAll`, `create` (link by URL), `retrieve`, `contentUrl`, `del` |
| `jobs` | `create`, `list`, `listAll`, `retrieve`, `cancel`, `retry`, `del`, `events`, `outputs`, `outputUrl`, `fileUrl`, `waitFor`, `deliveries`, `deliver` |
| `probe` | `create({ input, wait })` |
| `presets` | `list` / `listAll` (filter by `category`, `compatible_with`), `create`, `retrieve` (id or slug), `update` (PATCH: `output` merges), `replace` (PUT: the whole preset), `del` |
| `webhooks` | `list`, `listAll`, `create` (HTTPS, SNS, SQS or through a connection), `retrieve`, `update`, `del`, `rotateSecret`, `test`, `check`, `checkSaved`, `deliveries`, `redeliver`, `verifySignature`, `verifySnsSqsSignature`, `constructEvent` |
| `events` | `list`, `retrieve` |
| `usage` | `retrieve({ from, to, granularity })`, `inputs({ from, to })` (inputs by duration, size and kind) |
| `billing` | `retrieve`, `checkout({ plan } \| { creditCents })`, `portal`, `updateSettings`, `transactions`, `changePlan`, `invoices.list` (monthly statements) |
| `plans` | `list` |
| `capabilities` | `retrieve` |
| `connections` | `list`, `listAll`, `create`, `retrieve`, `update`, `enable`, `disable`, `del`, `test`, `check`, `checkSaved`, `browse({ prefix, recursive })` |
| `automations` | `list`, `listAll`, `create`, `retrieve`, `update`, `del`, `run`, `trigger`, `rotateHookToken`, `items` |
| `deliveries` | `retry` (see also `jobs.deliveries`, `jobs.deliver`) |
| `status` | `retrieve`: `{ status, queue_depth, running_jobs, version }` |
| `stats` | `get`: public platform totals, last 24 h and 30 daily points |
| `announcements` | `list({ unseen, kind, limit })`, `markSeen(ids)`, `markAllSeen()` |
| `changelog` | `list`: public, published changelog entries |
| `admin` | platform operators only: `overview`, `jobs`, `organizations`, `updateOrganization`, `announcements.list`, `announcements.create`, `announcements.update`, `announcements.del` |

For anything newer than the SDK, `transcdr.request(method, path, options)` calls an endpoint directly.

## Organizations

One login can belong to several organizations, with a role in each. A session token belongs to one of them:
login lands in the one used last, or pass `organization_id`. Every auth response lists the user's memberships.

```ts
const session = await transcdr.auth.login({ email, password });
transcdr.setApiKey(session.token);
for (const m of session.organizations) console.log(m.organization.id, m.organization.name, m.role);

// Switch: the old token is revoked, so keep the new one.
const other = await transcdr.auth.switch('org_…');
transcdr.setApiKey(other.token);

// Create an organization you own, with a session in it (the current token keeps working).
const created = await transcdr.organizations.create({ name: 'Studio' });
transcdr.setApiKey(created.token);
```

Members: adding the email of an existing Transcdr user gives them access (no `name` or `password`); an unknown email
creates the user and needs both. An organization may have several owners, and only owners add, promote or remove
owners (403 `role_required`). The last owner cannot be demoted or removed (409 `last_owner`).
`organization.members.leave()` removes your own membership. `auth.switch` and `organizations` need a session: an API
key gets 403 `session_required`; an organization you do not belong to gets 403 `not_a_member`.

```ts
await transcdr.organization.members.create({ email: 'ada@example.com', role: 'admin' });
await transcdr.organization.members.create({ email: 'new@example.com', role: 'member', name: 'New', password: '…' });
```

## Pagination

List methods return a `PagePromise`: await it for one page, or iterate every item lazily.

```ts
const page = await transcdr.jobs.list({ status: 'completed', limit: 50 });
console.log(page.data.length, page.has_more, page.next_cursor);

for await (const job of transcdr.jobs.list({ status: 'failed' }).autoPaginate()) {
  if (job.error?.retryable) await transcdr.jobs.retry(job.id);
}

const everything = await transcdr.jobs.listAll({ metadata: { customer: 'acme' } });
const first500 = await transcdr.assets.listAll({}, 500);
```

## Errors

Failed requests throw a subclass of `TranscdrError`, chosen by the API's `error.type`:

| Class | Status | `error.type` |
|---|---|---|
| `InvalidRequestError` | 400, 404, 409, 422 | `invalid_request_error` |
| `AuthenticationError` | 401 | `authentication_error` |
| `QuotaError` | 402 | `quota_error` |
| `PermissionError` | 403 | `permission_error` |
| `RateLimitError` | 429 | `rate_limit_error` (`retryAfterSeconds`) |
| `APIError` | 5xx | `api_error` |
| `ConnectionError` / `TimeoutError` | — | no response |
| `WaitTimeoutError` | — | `jobs.waitFor` gave up |

Each carries `status`, `type`, `code`, `param` (dotted, e.g. `output.renditions.0.height`), `details` (per-field
messages), `requestId` and `headers`.

```ts
import { InvalidRequestError, TranscdrError } from '@transcdr/sdk';

try {
  await transcdr.jobs.create({ input, output: { renditions: [{ width: 1281, height: 720 }] } });
} catch (err) {
  if (err instanceof InvalidRequestError) console.error(err.param, err.message);
  else if (err instanceof TranscdrError) console.error(err.status, err.code, err.requestId);
  else throw err;
}
```

A job that fails is not an exception: it reaches `status: 'failed'` with `job.error = { code, message, retryable }`.

## Credit and spending

Transcoding is paid from prepaid credit, per output minute: $0.005 SD, $0.010 HD and $0.025 UHD, whatever the codec.
A job the account cannot pay for is refused before it starts with a `QuotaError` (402) whose `code` is
`insufficient_credit`, `cost_limit_exceeded` (above the job's `maxCostCents`) or `spend_limit_reached` (the monthly
limit).

```ts
const { account } = await transcdr.billing.retrieve();
console.log(account.available_usd, account.this_month.spent_usd);

// Cap a single job.
await transcdr.jobs.create({ input, preset: 'hls-av1-abr', maxCostCents: 200 });

// Buy $50 of credit, or subscribe: send the customer to `url`.
const { url } = await transcdr.billing.checkout({ creditCents: 5000 });

// A monthly limit and auto-recharge (needs a card saved by an earlier purchase).
await transcdr.billing.updateSettings({
  monthly_limit_cents: 50_000,
  auto_recharge: { enabled: true, threshold_cents: 1000, amount_cents: 5000, monthly_cap_cents: 20_000 },
});

for (const entry of (await transcdr.billing.transactions({ limit: 20 })).data) {
  console.log(entry.created_at, entry.kind, entry.amount_usd);
}
```

## Retries and idempotency

Requests are retried up to `maxRetries` times with exponential backoff and jitter (honouring `Retry-After`) on 429,
5xx and network errors, but only when that is safe: `GET`, `PUT` and `DELETE`, and `POST`s that carry an
`Idempotency-Key`. Every create (`jobs`, `probe`, `uploads`, `assets`, `presets`, `webhooks`, `connections`,
`automations`, `apiKeys`, `organization.members`, `organizations`) sends a random key, so a retried create never makes
a duplicate: the API replays the first response (with `Idempotent-Replayed: true`). Keys last 24 hours per
organization. Pass your own to make restarts safe too:

```ts
await transcdr.jobs.create(params, { idempotencyKey: `video-${video.id}` });
```

The same key with a different body is refused with 409 `idempotency_key_reused`. Only a successful create is
remembered, so after an error the key can be used again.

## Where a preset plays

Every preset has a `category` (`web`, `mobile`, `streaming`, `tv`, `social`, `audio`, `archive`), the group the
dashboard shows it in, and `compatibility`: the platforms its output plays on (`web`, `ios`, `android`, `smart_tv`,
`legacy`, `editing`), with a note for each giving minimum versions and conditions. Both are derived from the output
spec. A platform is listed only when the codec, the container and the audio all play there; with `audio: 'auto'`, a
source whose audio is not AAC gets Opus, and the notes say which platforms need a newer version for that.

```ts
// Presets that play on iPhones and Android phones.
const both = await transcdr.presets.listAll({ compatible_with: ['ios', 'android'] });
// Web or social presets.
const page = await transcdr.presets.list({ category: ['web', 'social'] });
for (const preset of page.data) {
  console.log(preset.slug, preset.category, preset.compatibility, preset.compatibility_notes.ios);
}
// Your own preset may state its own; null derives them again.
await transcdr.presets.update('pre_…', { category: 'tv', compatibility: ['smart_tv', 'legacy'] });
await transcdr.presets.update('pre_…', { category: null, compatibility: null, compatibility_notes: null });
```

`PRESET_CATEGORIES` and `PLATFORMS` list the known values in display order; more may be added, so handle a value
you do not know.

## Updating: left out, or null

`update` methods send `PATCH`: a field left out keeps its value, and an explicit `null` clears it. That covers an
automation's `destination`, `preset`, `output`, `metadata`, `webhook_url` and `trigger_connection_id`; a webhook's
`description`, `aws.endpoint` and `aws.message_group_id`; a connection's `config` fields and storage `secrets`; a
preset's `description` and `metadata` (and `category`, `compatibility` and `compatibility_notes`, which are then
derived from `output` again); and the organization's `billing_email`.

```ts
await transcdr.automations.update('aut_…', { destination: null, webhook_url: null });
await transcdr.presets.replace('pre_…', { name: 'Web 1080p', output: { codec: 'av1' } }); // PUT: the whole preset
```

Connections and webhooks never return their secrets. `secrets` lists the ones that are set, each with a
`fingerprint` (`hmac-sha256:<12 hex>`) that changes when the secret does: compare it with an earlier read to notice a
change made elsewhere.

`auth.me()` returns a `user` for API keys too (the user who created the key); use `isSession(me)` to tell a session
(`api_key.prefix` starts `tds_`) from an API key.

## Webhooks

Deliveries carry `Transcdr-Signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<raw body>")>`. Verify against the
**raw** body, before parsing JSON. The default tolerance is 300 seconds.

Express:

```ts
import express from 'express';
import { Transcdr } from '@transcdr/sdk';

const transcdr = new Transcdr({ apiKey: process.env.TRANSCDR_API_KEY });
const app = express();

app.post('/hooks/transcdr', express.raw({ type: 'application/json' }), async (req, res) => {
  const ok = await transcdr.webhooks.verifySignature(
    req.body, // Buffer
    req.header('Transcdr-Signature'),
    process.env.TRANSCDR_WEBHOOK_SECRET!,
  );
  if (!ok) return res.status(400).send('invalid signature');

  const event = JSON.parse(req.body.toString('utf8'));
  if (event.type === 'job.completed') {
    // event.data.object is the Job
  }
  res.sendStatus(200);
});
```

Fetch-style handlers (Next.js route handlers, Cloudflare Workers, Deno, Bun):

```ts
import { constructEvent, type Event, type Job } from '@transcdr/sdk';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const event = await constructEvent<Event<Job>>(
      body,
      request.headers.get('Transcdr-Signature'),
      process.env.TRANSCDR_WEBHOOK_SECRET!,
    );
    if (event.type === 'job.failed') console.warn(event.data.object.error);
    return new Response('ok');
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
}
```

`verifySignature`, `constructEvent`, `signPayload` (for testing your receiver) and `computeSignature` are also
exported as standalone functions. Deliveries may repeat or arrive out of order: deduplicate on `event.id`.

### Amazon SNS and SQS destinations

An endpoint can also publish to an Amazon SNS topic or send to an Amazon SQS queue. The API stores the secret access
key and never returns it (`aws.secret_access_key_set` is `true`); on update, omit it to keep the stored one.

```ts
const topic = await transcdr.webhooks.create({
  type: 'sns',
  topic_arn: 'arn:aws:sns:us-east-1:123456789012:transcdr-events',
  aws: { access_key_id: process.env.AWS_KEY_ID!, secret_access_key: process.env.AWS_SECRET!, region: 'us-east-1' },
  events: ['job.completed', 'job.failed'],
});
console.log(topic.secret); // whsec_…, signs the transcdr-signature message attribute

await transcdr.webhooks.update(topic.id, { aws: { access_key_id: 'AKIA…', secret_access_key: 'rotated' } });
```

The message (SNS `Message`, SQS `MessageBody`) is the same event JSON a webhook receives, and the
`transcdr-signature` message attribute uses the webhook scheme. `verifySnsSqsSignature` accepts the attribute map in
any AWS shape (Lambda SQS events, `ReceiveMessage`, SNS notification JSON) or the bare value:

```ts
import { verifySnsSqsSignature } from '@transcdr/sdk';
import type { SQSHandler } from 'aws-lambda';

export const handler: SQSHandler = async (sqsEvent) => {
  for (const record of sqsEvent.Records) {
    const ok = await verifySnsSqsSignature(record.body, record.messageAttributes, process.env.TRANSCDR_SECRET!, 3600);
    if (!ok) throw new Error('invalid signature');
    const event = JSON.parse(record.body);
    // …
  }
};
```

Messages can wait in a queue, so pass a tolerance longer than the default 300 seconds (or `Infinity`, relying on the
event id for de-duplication) when you consume a backlog.

## Messaging connections and queue automations

Besides storage, a connection can be an Amazon SQS queue, an Amazon SNS topic or an HTTPS webhook (`class:
"messaging"`). They receive events through an endpoint that names them, and an SQS queue can trigger automations:
S3 bucket notifications (sent straight to the queue or fanned out through SNS), EventBridge `Object Created` events,
`POST /v1/jobs` bodies and `{path}` / `{paths}` messages all start jobs.

```ts
const queue = await transcdr.connections.create({
  name: 'Ingest queue',
  kind: 'sqs',
  config: { queue_url: 'https://sqs.us-east-1.amazonaws.com/123456789012/transcdr-ingest', region: 'us-east-1' },
  secrets: { access_key_id: 'AKIA…', secret_access_key: '…' },
});

await transcdr.automations.create({
  name: 'Ingest → HLS',
  trigger: 'queue',
  trigger_connection_id: queue.id,
  source: { connection_id: bucket.id, prefix: 'incoming/', pattern: '**/*.{mp4,mov}' },
  preset: 'hls-av1-abr',
});

// Events through the same kind of connection
await transcdr.webhooks.create({ connection_id: topic.id, events: ['job.completed', 'connection.disabled'] });
```

`connections.checkSaved(queue.id)` returns the IAM policy for the consumer key plus the queue policies for S3 and SNS
and the bucket notification JSON in `setup`.

A connection that fails permanently (credentials rejected, access denied, bucket, queue or topic gone), or fails 5
times in a row, is turned off (`enabled: false`, with `disabled_reason` and `disabled_at`), a `connection.disabled`
event is sent and the organization's owners get an email. While off, anything that names it gets a 409
`connection_disabled`. Fix the cause, then `await transcdr.connections.enable(id)`.

## Announcements

What's new, and the service credits your organization received after an incident. A dashboard asks for what the
signed-in user has not seen yet (service credits come first), shows it, and records that it was seen:

```ts
const { data } = await transcdr.announcements.list({ unseen: true });
for (const a of data) {
  if (a.kind === 'service_credit') console.log(`Credit: $${a.credit!.amount_usd} for ${a.credit!.jobs.length} jobs`);
  else console.log(a.title, a.tags, a.link?.url);
}
await transcdr.announcements.markSeen(data.map((a) => a.id)); // or markAllSeen()
```

`body` is Markdown. Seen state belongs to a user, so it needs a session token: with an API key `seen` is always
`false` and nothing is recorded. The changelog is also public, with no key at all:

```ts
for await (const entry of new Transcdr().changelog.list().autoPaginate()) console.log(entry.published_at, entry.title);
```

## Test mode

Use a test key (`tdk_test_…`) while developing. Test jobs are validated like live ones but never touch a GPU: they
complete in a few seconds with synthetic outputs, are free, and are flagged `livemode: false`. Webhooks fire as usual.

## In the browser

The SDK runs in browsers (`uploads.uploadFile` reports real upload progress there via `XMLHttpRequest`):

```ts
const asset = await transcdr.uploads.uploadFile(fileInput.files[0], {
  onProgress: ({ percent }) => (progress.value = percent),
});
```

Never ship a secret API key to a browser. Call the API from your server, or use a session token for a signed-in
dashboard user.

## Verifying an integration

`connections.check` and `webhooks.check` take the same body as `create` and run a live check without saving;
`checkSaved(id)` checks a stored one. The report lists each step (`passed`, `failed` or `skipped`, with a `detail`
and, on failure, a `hint`), who the credentials sign in as, which roles the connection can serve, and the exact
policy or role to grant.

```ts
const report = await transcdr.connections.check({
  kind: 's3',
  config: { bucket: 'media', region: 'us-east-1', root: 'uploads/' },
  secrets: { access_key_id: 'AKIA…', secret_access_key: '…' },
});
for (const step of report.steps) console.log(step.status, step.label, step.hint ?? '');
if (!report.roles.destination) console.log(JSON.stringify(report.setup?.iam_policy, null, 2));
```

## Types

Every API object is exported as a type: `Job`, `OutputSpec`, `OutputSpecInput`, `Rendition`, `Asset`, `Upload`,
`Preset`, `WebhookEndpoint`, `WebhookDelivery`, `ConnectionCheck`, `WebhookCheck`, `Event`, `ApiKey`, `Organization`, `User`, `Membership`, `Usage`, `InputReport`, `Plan`, `Billing`,
`CreditAccount`, `CreditTransaction`, `Statement`, `Announcement`, `ServiceCredit`, `MediaInfo`, `ListResponse<T>` and more, plus constants such as `JOB_STATUSES`, `EVENT_TYPES` and `SCOPES`.

## License

MIT

## Other languages

- Go: [transcdr-sdk-go](https://github.com/transcdr/transcdr-sdk-go)
- Swift (iOS and macOS): [transcdr-sdk-swift](https://github.com/transcdr/transcdr-sdk-swift)

## License

MIT
