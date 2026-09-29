# @transcdr/sdk

The official TypeScript SDK for [Transcdr](https://transcdr.com): fast AV1, H.264 and H.265 transcoding with MP4 and
CMAF/HLS output, audio-only and image output, behind one small REST API.

- Zero runtime dependencies. Uses the platform `fetch`.
- Works in Node 18+, Deno, Bun, edge runtimes and browsers.
- ESM and CommonJS builds with full type definitions for every API object.
- Automatic retries with backoff, safe idempotency keys, cursor pagination helpers.
- Webhook signature verification on Web Crypto.

## Install

The package is installed from GitHub (it is not on the npm registry); it builds on install:

```sh
npm install github:transcdr/transcdr-sdk-typescript#v1.0.0
```

It is imported as `@transcdr/sdk`. Version 1.0 speaks output spec v2; see [Migrating from v1](#migrating-from-v1).

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

// 2. Transcode with a system preset (change any field with `output`; see "Presets, versions and overrides").
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

## The output spec

A job either names a preset or gives its whole output spec (v2). The spec is declared in sections, and **nothing has
a default**: it states every field its kind, container, codec and audio handling need. Where the output should
follow the source, you write that as a value: `'source'`, `'standard'`, `'from_color'`, `'by_size'`, `'poster'`,
`'segment'`, `'all'`.

| Section | Describes | For kind |
|---|---|---|
| `kind` | What is produced: `'video'`, `'audio'` or `'image'` | all |
| `container` | The file or package: `{ format: 'mp4' }`, `{ format: 'hls', segment_seconds }`, or `'mp3'`, `'flac'`, `'m4a'` | video, audio |
| `video` | `codec`, one of `quality` / `crf` / `cbr`, `bit_depth`, `color`, `frame_rate.max`, `gop`, `filters` | video |
| `audio` | `handling` (`'auto'`, `'encode'`, `'drop'`) and, with a track, `codec`, `bitrate`, `channels`, `he_aac`, … | video, audio |
| `image` | `formats`, `quality` per lossy format, `lossless` (WebP), `color_profile`, `frames` | image |
| `renditions` | One of `sizes`, `ladder` (video) or `source_size` | video, image |
| `subtitles` | `{ tracks: 'all' \| 'none' }` or `{ languages: ['eng'] }` | video |
| `trim` | `{ start, end }`, `end` in seconds or `'source'` | video |
| `privacy` | a `preset` (categories given refine it), or all of `location`, `capture_time`, `device`, `descriptive` | all |

`OutputSpec` is `VideoOutput | AudioOutput | ImageOutput`, and every field a kind always needs is required in its type.
Exclusive choices are unions, so giving both `quality` and `crf`, or privacy categories without a preset and
without all four, does not type-check. A field whose need depends on another (an audio `bitrate` for a lossy codec, `stereo_fallback` in HLS,
`image.quality` for a lossy format, a lossless codec's `bit_depth`) is optional in the type and checked at runtime.

### Values that follow the source

| Value | Resolves to |
|---|---|
| `video.frame_rate.max: 'source'` | the source's frame rate, not capped |
| `video.bit_depth: 'from_color'` | 8-bit for `sdr`, 10-bit for `hdr10` / `hlg`, the source's for `passthrough` |
| `video.cbr.bitrate: 'standard'` | a rate for each size by codec, short side and frame rate: H.264 at 30 fps about 5M at 1080p, 3M at 720p, 1.2M at 480p, 0.8M at 360p; H.265 about 0.65× that, AV1 about 0.5×; more above 30 fps |
| `video.gop: 'segment'` | HLS: one keyframe at the start of each segment and none inside it |
| `audio.bitrate: 'standard'` | AAC 64k mono, 128k stereo, 384k 5.1, 512k 7.1; Opus 96k stereo, 320k 5.1, 416k 7.1; MP3 64k mono, 128k stereo |
| `audio.channels: 'source'` | the source's layout (MP3 folds a wider one to stereo) |
| `audio.bit_depth: 'source'` | 16-bit for a 16-bit or lossy source, 24-bit for a deeper one |
| `audio.he_aac: 'auto'` | an HE-AAC source is kept where only a codec change is asked, and its core decoded where the job needs PCM |
| `audio.handling: 'auto'` | the source's audio is kept where the container carries it, otherwise made `codec` |
| `label: 'by_size'` | video: `<short side>p` of the size it comes out at; image: `<width>x<height>` |
| `trim.end: 'source'` | the end of the source |
| `image.frames: 'poster'` | an image input as it is; a video's frame 10% of the way in |
| `subtitles.tracks: 'all'` | every subtitle track of the source |

### Checked before it is sent

`jobs.create`, `presets.create` and `presets.replace` check a whole spec against the same table of required fields
the API uses, and throw an `InvalidRequestError` without sending anything when fields are missing or given where they
do not apply. Its `errors` lists **every** failure at once, in the API's words and order, as a 422 would:

```ts
import { InvalidRequestError, validateOutput } from '@transcdr/sdk';

try {
  await transcdr.jobs.create({ input, output: spec });
} catch (err) {
  if (err instanceof InvalidRequestError) {
    for (const e of err.errors) console.error(e.param, e.message);
    // output.audio.bitrate  output.audio.bitrate is required when kind is video or audio and audio.handling is auto or encode and audio.codec is opus, mp3 or aac.
    // output.privacy        output.privacy is required: give privacy.preset (strip_all, strip_location or keep_all), or …
  }
}

validateOutput(spec); // the same check, returning the list ([] when complete)
```

Values against each other (HDR color with 8-bit, MP3 in HLS, a size above the plan's maximum) are checked by the API.
`capabilities.retrieve()` returns the same table as data under `output.fields` and `output.groups`.

### ABR HLS, H.264 at a constant bit rate

```ts
import type { OutputSpec } from '@transcdr/sdk';

const hls: OutputSpec = {
  kind: 'video',
  container: { format: 'hls', segment_seconds: 6 },
  video: {
    codec: 'h264',
    cbr: { bitrate: 'standard', buffer_ms: 1000 }, // or quality: 'standard', or crf: 23
    bit_depth: 'from_color',
    color: 'sdr',
    frame_rate: { max: 'source' },
    gop: 'segment',
    filters: [],
  },
  audio: { handling: 'encode', codec: 'aac', bitrate: 'standard', channels: 'source', he_aac: 'auto', stereo_fallback: false },
  renditions: {
    sizes: [
      { label: 'by_size', width: 1920, height: 1080, fit: 'contain', orientation: 'auto', upscale: false, video: { cbr: { bitrate: '5M' } } },
      { label: 'by_size', width: 1280, height: 720, fit: 'contain', orientation: 'auto', upscale: false, video: { cbr: { bitrate: '3M' } } },
    ],
  },
  subtitles: { tracks: 'all' },
  trim: { start: 0, end: 'source' },
  privacy: { preset: 'strip_all' },
};
await transcdr.jobs.create({ input, output: hls });

// An automatic ladder instead of explicit sizes:
// renditions: { ladder: { max_short_side: 1080, fit: 'contain', upscale: false } }
```

With `cbr`, each size is coded at its own `video.cbr.bitrate` (optional), else `video.cbr.bitrate`; the rate is held
within `buffer_ms` (100–10000). Rates are 100k to 200M. HLS `BANDWIDTH` states each rung's rate.

### One MP4

```ts
await transcdr.jobs.create({
  input,
  output: {
    kind: 'video',
    container: { format: 'mp4' },
    video: { codec: 'h264', quality: 'high', bit_depth: 'from_color', color: 'sdr', frame_rate: { max: 30 }, gop: { seconds: 2 }, filters: [] },
    audio: { handling: 'encode', codec: 'aac', bitrate: 'standard', channels: 'source', he_aac: 'auto' },
    renditions: {
      sizes: [{ label: 'by_size', width: 1080, height: 1920, fit: 'cover', orientation: 'fixed', upscale: false }],
    },
    subtitles: { tracks: 'all' },
    trim: { start: 0, end: 'source' },
    privacy: { preset: 'strip_all' },
  },
});
```

### Sizes are maximums: fit and upscale

A size's `width` × `height` is a box the picture is fitted into, not its exact size. Each output reports the size it
came out at (`outputs[].width` / `height`).

- `fit` (`FITS`): `'contain'` keeps the shape inside the box; `'cover'` fills the box and centre-crops; `'pad'` adds
  black bars to exactly the box; `'stretch'` distorts the picture to exactly the box.
- `orientation`: `'auto'` turns the box to the picture's orientation (1920×1080 on a portrait video is 1080×1920);
  `'fixed'` uses it as written, so a 1080×1920 `'cover'` size crops a landscape video to 9:16.
- `upscale: true` lets a size be larger than the source. Without it, sizes that come out the same are made once.
- `ladder` makes the standard short sides up to `max_short_side`, never above the source; `source_size` makes one
  output at the source's size.

### Audio

- `handling: 'auto'` keeps compatible audio as it is (AAC, Opus, AC-3, E-AC-3, DTS; MP3 too into an MP4) and makes the
  rest `codec`, which must be `'opus'` (`'mp3'` in an `.mp3`). `'encode'` makes `codec`, copying a source already in
  it when nothing else changes. `'drop'` (video only) has no track, and takes no other audio field.
- `'aac'` is AAC-LC, which every browser, iPhone, Android device, TV and editor plays: choose it for reach. It takes
  8k to 288k per main channel (the LFE does not count).
- `'mp3'` is constant bit rate at 32k, 40k, 48k, 56k, 64k, 80k, 96k, 112k, 128k, 160k, 192k, 224k, 256k or 320k,
  stereo at most; for an MP4 or an `.mp3`, not HLS.
- `'flac'` and `'alac'` are lossless and take no `bitrate`; they need `bit_depth` (`'source'`, `'16'`, `'24'`), and
  FLAC needs `flac_compression` (`'fast'`, `'balanced'`, `'best'`: the same audio, a smaller file for more work).
- `channels` (`AUDIO_CHANNELS`) sets the layout, or `'source'` keeps the source's. Audio is never upmixed.
- `stereo_fallback` is required in HLS with a track: `true` adds a stereo downmix beside surround audio.
- `he_aac` (`HE_AAC`): HE-AAC decodes only as its AAC-LC core (half the sample rate, less bandwidth). `'auto'` keeps an
  HE-AAC source where only a codec change is asked and decodes its core where the job needs PCM; `'passthrough'`
  never decodes it (a job that would need it fails); `'core'` decodes its core whenever another codec or a change is
  asked.

`kind: 'audio'` writes the audio alone as one file, labelled `audio`: `audio.mp3` (`audio/mpeg`, MP3 only),
`audio.flac` (`audio/flac`, FLAC only) or `audio.m4a` (`audio/mp4`, any codec), billed per output minute at the SD rate.

```ts
// A podcast episode from a video recording.
await transcdr.jobs.create({
  input,
  output: {
    kind: 'audio',
    container: { format: 'mp3' },
    audio: { handling: 'encode', codec: 'mp3', bitrate: '64k', channels: 'mono', he_aac: 'auto' },
    privacy: { preset: 'strip_all' },
  },
});

// A lossless 24-bit FLAC master that keeps the recording date and tags.
await transcdr.jobs.create({
  input,
  output: {
    kind: 'audio',
    container: { format: 'flac' },
    audio: { handling: 'encode', codec: 'flac', bit_depth: '24', flac_compression: 'best', channels: 'source', he_aac: 'auto' },
    privacy: { location: 'strip', capture_time: 'keep', device: 'strip', descriptive: 'keep' },
  },
});
```

### Image jobs

`kind: 'image'` makes still images, of an image input (JPEG, PNG, WebP, AVIF, GIF, TIFF, BMP, HEIC) or taken from a
video. Every size is made in every format in `image.formats` (`IMAGE_FORMATS`: `'avif'`, `'webp'`, `'jpeg'`,
`'png'`, one to four). Image sizes are 16 to 8192 on a side, odd sizes allowed.

- `image.quality` has one entry, 1 to 100, for each lossy format made and no others: `{ avif: 60, jpeg: 82 }`.
  `image.lossless` is required with WebP (`true` makes it lossless, and then it takes no quality); PNG always is.
- `image.color_profile`: `'srgb'` converts; `'keep'` keeps the source's profile (PNG, JPEG, WebP).
- `image.frames`: `'poster'` (an image as it is; a video's frame 10% in), or for a video `{ count: 12 }` evenly spaced
  or `{ at_seconds: [1.5, 10] }`.
- Each output carries its `format`, its `rendition`, and for a video's stills its `frame` (from 1) and `at_seconds`.
- Images are billed per output image by the pixels it came out at: `billing.billable_images` counts them and
  `billing.tier` is `'up_to_1mp'`, `'up_to_4mp'` or `'over_4mp'` (`IMAGE_TIERS`).

```ts
// Twelve evenly spaced JPEG stills of a video.
const job = await transcdr.jobs.create({
  input,
  output: {
    kind: 'image',
    image: { formats: ['jpeg'], quality: { jpeg: 80 }, color_profile: 'srgb', frames: { count: 12 } },
    renditions: {
      sizes: [{ label: 'sheet', width: 320, height: 320, fit: 'contain', orientation: 'auto', upscale: false }],
    },
    privacy: { preset: 'strip_all' },
  },
});

const done = await transcdr.jobs.waitFor(job.id);
for (const o of done.outputs) console.log(o.rendition, o.format, o.url);
console.log(done.billing?.billable_images, done.billing?.tier);
```

### Privacy

`privacy` says which identifying metadata survives: a `preset` (`'strip_all'`, `'strip_location'`, `'keep_all'`),
with any categories given refining it, or all four categories without a preset: `location` (`'strip'`, `'approximate'`, `'keep'`), `capture_time` (`'strip'`,
`'date'`, `'keep'`), `device` (`'strip'`, `'keep'`, `'keep_all'`) and `descriptive` (`'strip'`, `'keep'`). Responses
always show the four categories. HLS keeps nothing.

## Presets, versions and overrides

A preset is a complete spec, and presets are versioned: editing a preset's output adds a version, and a version
never changes. Name one by slug or id for its latest version, or `slug@N` to pin version N. With a preset, `output`
gives only what to change (`OutputOverrides`):

| In `output` | Effect |
|---|---|
| an object | merged key by key |
| a scalar or an array (`sizes`, `formats`, `filters`, …) | replaces |
| one choice of a group (`quality` / `crf` / `cbr`, `sizes` / `ladder` / `source_size`, `tracks` / `languages`) | replaces the others |
| `privacy.preset` | replaces the preset's privacy |
| `null` | removes the field |
| `kind` | cannot change |

The merged result must be complete; a field left dangling (`segment_seconds` after switching to `mp4`) is refused by
name, so set it to `null`. The SDK does not check overrides (it does not know the preset's content); the API does.

```ts
const job = await transcdr.jobs.create({
  input,
  preset: 'social-vertical-1080x1920@1',
  output: { video: { frame_rate: { max: 24 } } },
});
job.preset; // { id: 'social-vertical-1080x1920', slug: 'social-vertical-1080x1920', version: 1, overrides: { video: { frame_rate: { max: 24 } } } }
job.output; // the resolved, complete spec: what runs

await transcdr.jobs.create({ input, preset: 'hls-h264-abr', output: { container: { format: 'mp4', segment_seconds: null }, video: { gop: { seconds: 2 } }, audio: { stereo_fallback: null } } });

const versions = await transcdr.presets.versions('pre_…'); // every version, oldest first
const v1 = await transcdr.presets.getVersion('pre_…', 1); // the preset as it was at version 1
await transcdr.presets.update('pre_…', { output: { video: { crf: 28 } } }); // a new version
```

A job's `output` is always the resolved spec, and `preset` is `{ id, slug, version, overrides }`, or `null` for a job given
its whole spec. An automation's `output` is its overrides, and `resolved_output` the spec they resolve to now.

## Migrating from v1

1.0 speaks output spec v2 only. The flat v1 spec (`mode`, `codec`, `quality`, a `renditions` list, `audio.mode`, `fit`,
`upscale`, `ladder`, …) is replaced by the sections above, and a spec states every field its kind needs: the SDK fills
nothing in, and neither does the API. Every v1 spec has an exact v2 form; the table gives each v1 field's place, and
the value v1 used when it was left out, which you now write.

| v1 | v2 | v1 default, written out in v2 |
|---|---|---|
| `mode: 'single'` | `kind: 'video'`, `container.format: 'mp4'` | `single` |
| `mode: 'hls'` | `kind: 'video'`, `container.format: 'hls'` | |
| `segment_seconds` | `container.segment_seconds` | `4` |
| `mode: 'audio'` | `kind: 'audio'` | |
| `audio.container` | `container.format` (`mp4` read as `m4a`) | `auto` → `flac` for flac, `m4a` for alac, else `mp3` |
| `mode: 'image'` | `kind: 'image'` | |
| `codec` | `video.codec` | `av1` |
| `quality.target` (a level) | `video.quality` | none set → `quality: 'standard'` |
| `quality.crf` | `video.crf` (a level `target` is dropped: crf won) | |
| `quality.target: 'cbr'` | `video.cbr` | |
| `quality.bitrate` | `video.cbr.bitrate` | `'standard'` |
| `quality.buffer_ms` | `video.cbr.buffer_ms` | `1000` |
| `bit_depth` | `video.bit_depth` (`auto` → `from_color`) | `from_color` |
| `color` | `video.color` | `sdr` |
| `max_fps` | `video.frame_rate.max` | `'source'` |
| `gop` | `video.gop.frames` | mp4: `{ seconds: 2 }`; hls: `'segment'` |
| `filters: 'a,b'` | `video.filters: ['a', 'b']` | `[]` |
| `renditions[]` | `renditions.sizes[]` | none and no ladder → `source_size`, with the top-level `fit` and `upscale` |
| `renditions[].label` | `sizes[].label` | `'by_size'` |
| `renditions[].fit` / `upscale` | `sizes[].fit` / `upscale` | the top-level `fit` / `upscale`, which default to `contain` / `false` |
| `renditions[].orientation` | `sizes[].orientation` | `auto` |
| `renditions[].bitrate` | `sizes[].video.cbr.bitrate` | |
| `fit`, `upscale` (top level) | written onto every size, the ladder or the source size; dropped for audio | `contain`, `false` |
| `ladder` | `renditions.ladder` (dropped when `renditions` is non-empty, as v1 ignored it) | `max_short_side` → `1080` |
| `audio.mode: 'auto'` | `handling: 'auto'`, `codec: 'opus'` (`'mp3'` in an mp3 container) | |
| `audio.mode: 'opus'` \| `'mp3'` \| `'aac'` \| `'flac'` \| `'alac'` | `handling: 'encode'`, `codec` | |
| `audio.mode: 'drop'` | `handling: 'drop'` | |
| `audio.bitrate` | `audio.bitrate` | `'standard'` (lossy) |
| `audio.channels` | `audio.channels` | `source` |
| `audio.he_aac` | `audio.he_aac` | `auto` |
| `audio.stereo_fallback` | `audio.stereo_fallback` | `false` (hls) |
| `audio.bit_depth` | `audio.bit_depth` | `source` (flac/alac) |
| `audio.flac_compression` | `audio.flac_compression` (`default` → `balanced`) | `balanced` (flac) |
| `subtitles: 'all' \| 'none'` | `subtitles.tracks` | `all` |
| `subtitles: 'eng,deu'` | `subtitles.languages: ['eng', 'deu']` | |
| `trim` | `trim` | `{ start: 0, end: 'source' }`; `end` unset → `'source'` |
| `image.formats` | `image.formats` | `['avif']` |
| `image.quality: 70` | `image.quality: { <each lossy format>: 70 }` | avif 60, webp 80, jpeg 82 |
| `image.lossless` | `image.lossless` | `false` (webp) |
| `image.keep_color_profile` | `image.color_profile: 'keep' \| 'srgb'` | `srgb` |
| `image.frames` | `image.frames` | `'poster'` |
| `privacy` | `privacy`, all four fields resolved | `{ preset: 'strip_all' }` |

Fields v1 accepted where they did not apply (such as `fit` on audio-only output) have no v2 form: leave them out.

Also changed:

- A job gives a `preset` (with optional `output` overrides) or a whole `output`; neither is refused.
- `Job.preset` records the preset version and the overrides; `Preset.version` is the latest version, and
  `presets.versions` / `presets.getVersion` read the others. `Automation.resolved_output` is the spec its preset and
  overrides resolve to now.
- A 422 for a spec lists every failure in `TranscdrError.errors`; `param` and `message` are the first.
- `capabilities.retrieve()` has `output`: the spec's fields, when each is required, and what each takes.
- Error params name v2 paths (`output.video.codec`, `output.renditions.sizes.0.width`).
- Removed: `OutputSpecInput`, `Rendition`, `Quality`, `QualityTarget`, `Mode`, `AudioMode`, `BitDepth`, and
  `ImageSpec.keep_color_profile`. `FlacCompression` `'default'` is now `'balanced'`.

**Older SDK releases keep working until the sunset.** The API still accepts v1 requests, with v1's defaults, and
returns responses in the v1 shape to a client that asks for them with the `Transcdr-Output-Spec: v1` header (or
`?output_spec=v1` on a `GET`). A 0.x client sends it through its `headers` option, so its `OutputSpec` reads jobs,
presets and automations as before:

```ts
const transcdr = new Transcdr({ apiKey, headers: { 'Transcdr-Output-Spec': 'v1' } }); // @transcdr/sdk 0.x only
```

That compatibility mode is deprecated from the start: its responses carry `Deprecation: true` and a `Sunset` date,
and it is removed after 31 March 2027. Move to 1.0 before then.

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
| `presets` | `list` / `listAll` (filter by `category`, `compatible_with`), `create`, `retrieve` (id or slug), `versions`, `getVersion`, `update` (PATCH: `output` merges, a new version), `replace` (PUT: the whole preset), `del` |
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

Each carries `status`, `type`, `code`, `param` (dotted, e.g. `output.renditions.sizes.0.height`), `details`
(per-field messages), `errors` (a refused output spec: every failure, `{ param, message }`, in order), `requestId`
and `headers`.

```ts
import { InvalidRequestError, TranscdrError } from '@transcdr/sdk';

try {
  await transcdr.jobs.create({ input, preset: 'web-av1-1080p', output: { renditions: { sizes: [{ label: 'x', width: 1281, height: 720, fit: 'contain', orientation: 'auto', upscale: false }] } } });
} catch (err) {
  if (err instanceof InvalidRequestError) for (const e of err.errors) console.error(e.param, e.message);
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
spec. A platform is listed only when the codec, the container and the audio all play there; with `audio.handling: 'auto'`, a
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
await transcdr.presets.replace('pre_…', { name: 'Web 1080p', output: spec }); // PUT: the whole preset, a complete spec
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

Use a test key (`tdk_test_…`) while developing. Test jobs are validated like live ones but never transcode: they
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

Every API object is exported as a type: `Job`, `OutputSpec` (`VideoOutput`, `AudioOutput`, `ImageOutput`, and each
section: `Video`, `Audio`, `ImageSpec`, `VideoRenditions`, `Size`, `Privacy`, …), `OutputOverrides`,
`PresetProvenance`, `PresetVersion`, `OutputCapabilities`, `Asset`, `Upload`, `Preset`, `WebhookEndpoint`, `WebhookDelivery`, `ConnectionCheck`, `WebhookCheck`, `Event`, `ApiKey`, `Organization`, `User`, `Membership`, `Usage`, `InputReport`, `Plan`, `Billing`,
`CreditAccount`, `CreditTransaction`, `Statement`, `Announcement`, `ServiceCredit`, `MediaInfo`, `ListResponse<T>` and more, plus constants such as `JOB_STATUSES`, `EVENT_TYPES` and `SCOPES`.

## License

MIT

## Other languages

- Go: [transcdr-sdk-go](https://github.com/transcdr/transcdr-sdk-go)
- Swift (iOS and macOS): [transcdr-sdk-swift](https://github.com/transcdr/transcdr-sdk-swift)

## License

MIT
