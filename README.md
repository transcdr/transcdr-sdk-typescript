# @transcdr/sdk

The official TypeScript SDK for [Transcdr](https://transcdr.io): GPU-accelerated AV1, H.264 and H.265 transcoding
with MP4 and CMAF/HLS output, behind one small REST API.

- Zero runtime dependencies. Uses the platform `fetch`.
- Works in Node 18+, Deno, Bun, edge runtimes and browsers.
- ESM and CommonJS builds with full type definitions for every API object.
- Automatic retries with backoff, safe idempotency keys, cursor pagination helpers.
- Webhook signature verification on Web Crypto.

## Install

```sh
npm install @transcdr/sdk
```

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
| `auth` | `register`, `login`, `logout`, `me`, `changePassword` |
| `organization` | `retrieve`, `update`, `members.list`, `members.create`, `members.update`, `members.del`, `rotateJobWebhookSecret` |
| `apiKeys` | `list`, `listAll`, `create`, `revoke` (`del`) |
| `uploads` | `create`, `complete`, `uploadFile` |
| `assets` | `list`, `listAll`, `create` (link by URL), `retrieve`, `contentUrl`, `del` |
| `jobs` | `create`, `list`, `listAll`, `retrieve`, `cancel`, `retry`, `del`, `events`, `outputs`, `outputUrl`, `fileUrl`, `waitFor`, `deliveries`, `deliver` |
| `probe` | `create({ input, wait })` |
| `presets` | `list`, `listAll`, `create`, `retrieve` (id or slug), `update`, `del` |
| `webhooks` | `list`, `listAll`, `create` (HTTPS, SNS or SQS), `retrieve`, `update`, `del`, `rotateSecret`, `test`, `deliveries`, `redeliver`, `verifySignature`, `verifySnsSqsSignature`, `constructEvent` |
| `events` | `list`, `retrieve` |
| `usage` | `retrieve({ from, to, granularity })` |
| `billing` | `retrieve`, `checkout({ plan } \| { creditCents })`, `portal`, `updateSettings`, `transactions`, `changePlan`, `invoices.list` (monthly statements) |
| `plans` | `list` |
| `capabilities` | `retrieve` |
| `connections` | `list`, `listAll`, `create`, `retrieve`, `update`, `del`, `test`, `browse({ prefix, recursive })` |
| `automations` | `list`, `listAll`, `create`, `retrieve`, `update`, `del`, `run`, `trigger`, `rotateHookToken`, `items` |
| `deliveries` | `retry` (see also `jobs.deliveries`, `jobs.deliver`) |
| `status` | `retrieve`: `{ status, queue_depth, running_jobs, version }` |
| `stats` | `get`: public platform totals, last 24 h and 30 daily points |
| `admin` | platform operators only: `overview`, `jobs`, `organizations`, `updateOrganization` |

For anything newer than the SDK, `transcdr.request(method, path, options)` calls an endpoint directly.

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
`Idempotency-Key`. `jobs.create` and `uploads.create` generate a key automatically when retries are enabled, so a
retried create never makes a duplicate. Pass your own to make restarts safe too:

```ts
await transcdr.jobs.create(params, { idempotencyKey: `video-${video.id}` });
```

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

## Types

Every API object is exported as a type: `Job`, `OutputSpec`, `OutputSpecInput`, `Rendition`, `Asset`, `Upload`,
`Preset`, `WebhookEndpoint`, `WebhookDelivery`, `Event`, `ApiKey`, `Organization`, `User`, `Usage`, `Plan`, `Billing`,
`CreditAccount`, `CreditTransaction`, `Statement`, `MediaInfo`, `ListResponse<T>` and more, plus constants such as `JOB_STATUSES`, `EVENT_TYPES` and `SCOPES`.

## License

MIT
