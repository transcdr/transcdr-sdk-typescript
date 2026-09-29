// Wire types for the Transcdr v1 API. These mirror `docs/api-contract.md`
// and the Rust types in `crates/transcdr-core` field for field.

/** RFC 3339 UTC timestamp, e.g. `2026-09-26T12:00:00Z`. */
export type Timestamp = string;

/**
 * A write-only secret that is set. The fingerprint changes when the secret changes and says nothing else
 * (it is keyed by the server and bound to the object and field): compare it with an earlier read to
 * notice a change made elsewhere.
 */
export interface SecretFingerprint {
  set: true;
  /** `hmac-sha256:<12 hex>`. */
  fingerprint: string;
}

/** String-to-string metadata: up to 20 keys (≤ 40 chars), values ≤ 500 chars. */
export type Metadata = Record<string, string>;

/** A cursor-paginated list. */
export interface ListResponse<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface ListParams {
  /** 1–100, default 20. */
  limit?: number;
  /** The `next_cursor` of the previous page. */
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Output specification
// ---------------------------------------------------------------------------

/**
 * `single` (one MP4), `hls` (an adaptive ladder) or `audio` (the audio alone as one file: an `.mp3`, `.flac` or
 * `.m4a`, see `Audio.container`).
 */
export type Mode = 'single' | 'hls' | 'audio';
export type Codec = 'av1' | 'h264' | 'h265';
/**
 * `auto` passes compatible audio through and transcodes the rest (to Opus, or to MP3 in an audio-only `.mp3`).
 * `aac` is AAC-LC, the choice that plays on the most devices (an AAC source passes through). `mp3` is constant bit
 * rate, stereo at most, in a single MP4 or audio-only output (not HLS). `flac` and `alac` are lossless (a source
 * already in that codec is copied) and take no bitrate.
 */
export type AudioMode = 'auto' | 'opus' | 'mp3' | 'aac' | 'flac' | 'alac' | 'drop';
/** FLAC and ALAC sample depth. `source` (the default) is 16-bit for a 16-bit or lossy source, 24-bit for a deeper one. */
export type AudioBitDepth = 'source' | '16' | '24';
/** FLAC compression effort: the same audio either way, a smaller file for more work. Default `default`. */
export type FlacCompression = 'fast' | 'default' | 'best';
/**
 * What an HE-AAC (or HE-AAC v2) source becomes. HE-AAC is decoded only as its AAC-LC core: spectral band replication
 * and parametric stereo are not decoded, so the core has half the stream's sample rate, less bandwidth and, for v2, one
 * channel. `auto` (the default) passes it through when only a codec change is asked and decodes its core when the job
 * needs PCM (a downmix, an `.mp3` or `.flac` file); `passthrough` never decodes it, and a job that would need it
 * decoded fails; `core` decodes its core whenever another codec is asked. AAC-LC sources are decoded in full whatever
 * it says.
 */
export type HeAac = 'auto' | 'passthrough' | 'core';
/** Every HE-AAC policy, in display order. */
export const HE_AAC = ['auto', 'passthrough', 'core'] as const;
/**
 * The file audio-only output is. `auto` (the default) follows the codec: `.flac` for FLAC, `.m4a` for ALAC, `.mp3`
 * otherwise (`auto` audio is then MP3). `m4a` holds any codec (`auto` audio in an `.m4a` is Opus); `.flac` holds FLAC
 * only and `.mp3` holds MP3 only.
 */
export type AudioContainer = 'auto' | 'mp3' | 'flac' | 'm4a';
/**
 * Audio channel layout. `source` keeps the source's; the rest downmix and never upmix (asking for more
 * channels than the source has fails the job). MP3 carries `source`, `mono` or `stereo` only.
 */
export type AudioChannels = 'source' | 'mono' | 'stereo' | '5.1' | '7.1';
/** Every audio channel layout, in display order. */
export const AUDIO_CHANNELS = ['source', 'mono', 'stereo', '5.1', '7.1'] as const;
/**
 * How a video meets a rendition's box: `contain` (default) keeps its shape inside the box, `cover` fills the box and
 * centre-crops, `pad` keeps its shape and adds black bars to exactly the box, `stretch` distorts it to exactly the box.
 */
export type Fit = 'contain' | 'cover' | 'pad' | 'stretch';
/** Every fit, in display order. */
export const FITS = ['contain', 'cover', 'pad', 'stretch'] as const;
/**
 * `auto` (default): a rendition's box turns to the video's orientation, so 1920×1080 on a portrait video is 1080×1920.
 * `fixed`: the box is used as written.
 */
export type Orientation = 'auto' | 'fixed';
/** Every orientation. */
export const ORIENTATIONS = ['auto', 'fixed'] as const;
export type Color = 'sdr' | 'hdr10' | 'hlg' | 'passthrough';
export type BitDepth = 'auto' | '8bit' | '10bit';
/**
 * `visually_lossless` | `high` | `standard` | `low` | `vmaf=N` (1–100), or `cbr`
 * to code every rendition at a constant bit rate instead of to a quality level.
 */
export type QualityTarget = 'visually_lossless' | 'high' | 'standard' | 'low' | `vmaf=${number}` | 'cbr';

/**
 * One output. `width` × `height` is the largest it may be: the video keeps its shape inside that box (see
 * `OutputSpec.fit`) and is not enlarged past its own size unless `upscale` is on. Each output reports the size it
 * came out at.
 */
export interface Rendition {
  /** Maximum width; even, 64–7680. */
  width: number;
  /** Maximum height; even, 64–4320. */
  height: number;
  /**
   * This rendition's constant bitrate, such as `"3M"` or `"800k"` (100k–200M), when
   * `quality.target` is `"cbr"`; refused otherwise. Omitted, it takes `quality.bitrate`
   * or a default for its resolution and codec.
   */
  bitrate?: string | null;
  /** Display label, 1–32 of `[A-Za-z0-9_-]`; defaults to `"<short side>p"` of the size it comes out at. */
  label?: string | null;
  /** This rendition's own fit, over `OutputSpec.fit`. */
  fit?: Fit | null;
  /** `fixed` keeps this rendition's box as written, e.g. a 9:16 `cover` rendition that crops a landscape video. */
  orientation?: Orientation | null;
  /** This rendition's own `upscale`, over `OutputSpec.upscale`. */
  upscale?: boolean | null;
}

export interface Ladder {
  /** Cap the tallest rung's short side, e.g. `1080`. */
  max_short_side?: number | null;
}

export interface Quality {
  target?: QualityTarget | string | null;
  /** 0–63; wins over `target`. Not with `"cbr"`. */
  crf?: number | null;
  /** `"cbr"` only: the rate for renditions without their own, such as `"5M"` (100k–200M). */
  bitrate?: string | null;
  /** `"cbr"` only: the rate buffer in milliseconds, 100–10000 (default 1000). */
  buffer_ms?: number | null;
}

export interface Audio {
  mode?: AudioMode;
  /**
   * Bitrate such as `"128k"` (6k–512k). MP3 takes 32k, 40k, 48k, 56k, 64k, 80k, 96k, 112k, 128k, 160k,
   * 192k, 224k, 256k or 320k (default 128k stereo, 64k mono). AAC takes 8k to 288k per main channel (the LFE
   * does not count; default 64k mono, 128k stereo, 384k 5.1, 512k 7.1). Not with `flac` or `alac`.
   */
  bitrate?: string | null;
  /** Channel layout; left out, the source's (`source`). */
  channels?: AudioChannels;
  /** HLS with surround audio: also add a stereo rendition to the same audio group. Default false. */
  stereo_fallback?: boolean;
  /** `flac` and `alac` only: the output's sample depth. */
  bit_depth?: AudioBitDepth;
  /** `flac` only: the compression effort. */
  flac_compression?: FlacCompression;
  /** Mode `audio` only: the file the output is. Left out, `auto`. */
  container?: AudioContainer;
  /** What an HE-AAC source becomes. Left out, `auto`. Not with `drop`. */
  he_aac?: HeAac;
}

export interface Trim {
  start?: number;
  end?: number | null;
}

/** The output specification. Every field has a default; see the docs. */
export interface OutputSpec {
  mode: Mode;
  codec: Codec;
  renditions: Rendition[];
  /** How the video meets each rendition's box; `contain` unless set. */
  fit: Fit;
  /** Let a rendition be larger than the source; `false` unless set. */
  upscale: boolean;
  ladder: Ladder | null;
  quality: Quality;
  gop: number | null;
  segment_seconds: number | null;
  audio: Audio;
  subtitles: string | null;
  color: Color;
  bit_depth: BitDepth;
  max_fps: number | null;
  filters: string | null;
  trim: Trim | null;
}

/** A partial spec, as sent on job creation (merged over the preset). */
export interface OutputSpecInput {
  mode?: Mode;
  codec?: Codec;
  renditions?: Rendition[];
  /** `contain` (default), `cover`, `pad` or `stretch`. */
  fit?: Fit;
  /** Let a rendition be larger than the source (default `false`). */
  upscale?: boolean;
  ladder?: Ladder | null;
  quality?: Quality;
  gop?: number | null;
  segment_seconds?: number | null;
  audio?: Audio;
  subtitles?: string | null;
  color?: Color;
  bit_depth?: BitDepth;
  max_fps?: number | null;
  filters?: string | null;
  trim?: Trim | null;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export interface AudioStream {
  codec: string;
  channels: number;
  sample_rate: number;
  language: string | null;
}

export interface SubtitleStream {
  format: string;
  language: string | null;
}

export interface MediaInfo {
  container: string;
  video_codec: string;
  width: number;
  height: number;
  frame_rate: number;
  /** Seconds. */
  duration: number;
  pixel_format: string;
  bit_depth: number;
  hdr: boolean;
  rotation: number;
  audio: AudioStream[];
  subtitles: SubtitleStream[];
  size_bytes: number;
  /** Non-square pixels only: the width the picture is shown at (720×576 at 64:45 is shown 1024×576). */
  display_width?: number;
  /** Non-square pixels only: the height the picture is shown at. */
  display_height?: number;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export type JobStatus = 'queued' | 'scheduled' | 'running' | 'uploading' | 'completed' | 'failed' | 'canceled';
export type JobKind = 'transcode' | 'probe';
export type Stage = 'waiting' | 'fetching' | 'probing' | 'encoding' | 'uploading' | 'done';
export type RenditionStatus = 'pending' | 'running' | 'finalizing' | 'completed' | 'failed';
export type Priority = 'normal' | 'high';
export type Tier = 'sd' | 'hd' | 'uhd';

export const JOB_STATUSES: readonly JobStatus[] = [
  'queued',
  'scheduled',
  'running',
  'uploading',
  'completed',
  'failed',
  'canceled',
];

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ['completed', 'failed', 'canceled'];

/** Whether no further transitions happen to a job in this status on their own. */
export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export type JobInput =
  | { type: 'url'; url: string }
  | { type: 'asset'; asset_id: string }
  /** A file in one of your connections (Starter plan and above). */
  | { type: 'connection'; connection_id: string; path: string };

/** Where to deliver a job's outputs when it completes. */
export interface JobDestination {
  connection_id: string;
  /** A prefix template: `{job_id}`, `{name}`, `{stem}`, `{ext}`, `{dir}`, `{date}`, `{automation}`, `{org}`. */
  prefix?: string;
}

export interface RenditionProgress {
  index: number;
  label: string;
  width: number;
  height: number;
  status: RenditionStatus;
  percent: number;
  frames_done: number;
  frames_total: number | null;
  segments_written: number;
  bytes_out: number;
  message?: string;
}

export interface Progress {
  percent: number;
  stage: Stage;
  renditions: RenditionProgress[];
}

export interface JobOutput {
  label: string;
  width: number;
  height: number;
  frames: number;
  bytes: number;
  content_type: string;
  /** Relative to the job's output root, e.g. `1080p.mp4`. */
  path: string;
  url: string;
}

export interface JobError {
  /** Stable code, e.g. `decode_failed`, `input_unreachable`. */
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobBilling {
  billable_minutes: number;
  /** Rounded up to the cent. */
  amount_cents: number;
  /** Exact, in dollars (sub-cent). */
  amount_usd?: number;
  /** Null until the job has produced output. */
  tier: Tier | null;
  /** Seconds of output, once known. */
  output_duration?: number | null;
}

export interface Job {
  object: 'job';
  id: string;
  kind?: JobKind;
  status: JobStatus;
  input: JobInput;
  input_info: MediaInfo | null;
  preset_id: string | null;
  output: OutputSpec;
  priority: Priority;
  progress: Progress;
  outputs: JobOutput[];
  /** HLS: the bearer-authenticated master playlist (`…/v1/jobs/{id}/files/master.m3u8`). */
  playlist_url: string | null;
  /**
   * Completed jobs only: a signed, expiring (6 h) URL under `/play/<token>/…`
   * that a `<video>` element or hls.js can load without an Authorization
   * header; relative HLS paths resolve under the same grant.
   */
  playback_url?: string | null;
  error: JobError | null;
  metadata: Metadata;
  webhook_url: string | null;
  attempts: number;
  max_attempts: number;
  billing: JobBilling | null;
  livemode?: boolean;
  created_at: Timestamp;
  scheduled_at: Timestamp | null;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  updated_at: Timestamp;
}

export interface JobCreateParams {
  input: JobInput;
  /** Overrides merged over the preset's spec (objects merge, arrays replace, `null` clears). */
  output?: OutputSpecInput;
  /** A system preset slug (e.g. `hls-av1-abr`) or a `pre_…` id. */
  preset?: string;
  priority?: Priority;
  metadata?: Metadata;
  webhook_url?: string;
  /** Deliver every output file to a connection when the job completes. */
  destination?: JobDestination;
  /**
   * Refuse the job (`cost_limit_exceeded`) if it is estimated, or found at
   * probe, to cost more than this.
   */
  max_cost_cents?: number;
}

export interface JobListParams extends ListParams {
  status?: JobStatus;
  preset?: string;
  created_after?: Timestamp;
  created_before?: Timestamp;
  /** Filter on metadata: sent as `metadata[key]=value`. */
  metadata?: Metadata;
}

export interface JobEvent {
  object: 'job_event';
  type: string;
  message: string;
  data: Record<string, unknown> | null;
  created_at: Timestamp;
}

export interface SignedUrl {
  url: string;
  expires_at: Timestamp;
}

export interface ProbeParams {
  input: JobInput;
}

// ---------------------------------------------------------------------------
// Assets and uploads
// ---------------------------------------------------------------------------

export type AssetStatus = 'pending_upload' | 'ready' | 'failed' | 'deleted';

export interface Asset {
  object: 'asset';
  id: string;
  status: AssetStatus;
  filename: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  input_info: MediaInfo | null;
  metadata: Metadata;
  download_url: string;
  /** Set for assets linked by URL (`POST /v1/assets`); jobs read the URL directly. */
  source_url?: string | null;
  created_at: Timestamp;
}

export interface AssetImportParams {
  url: string;
  filename?: string;
  metadata?: Metadata;
}

export interface Upload {
  object: 'upload';
  id: string;
  asset_id: string;
  status: 'pending' | 'completed' | 'expired' | string;
  upload_url: string;
  upload_method: 'PUT' | string;
  upload_headers: Record<string, string>;
  expires_at: Timestamp;
}

export interface UploadCreateParams {
  filename: string;
  content_type: string;
  size_bytes: number;
  metadata?: Metadata;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * The group a preset is shown in: `web` (a single MP4 for browsers), `mobile` (native iOS and Android),
 * `streaming` (adaptive HLS), `tv` (smart TVs, set-top boxes, constant bit rate), `social` (portrait),
 * `audio` (audio-only) and `archive` (visually lossless, HDR). More may be added.
 */
export type PresetCategory = 'web' | 'mobile' | 'streaming' | 'tv' | 'social' | 'audio' | 'archive' | (string & {});

/** Every category, in display order. */
export const PRESET_CATEGORIES = ['web', 'mobile', 'streaming', 'tv', 'social', 'audio', 'archive'] as const;

/**
 * Where an output plays: `web` (current Chrome, Edge, Firefox, Safari), `ios`, `android`, `smart_tv`,
 * `legacy` (old browsers and devices, set-top boxes) and `editing` (editing applications). More may be added.
 */
export type Platform = 'web' | 'ios' | 'android' | 'smart_tv' | 'legacy' | 'editing' | (string & {});

/** Every platform, in display order. */
export const PLATFORMS = ['web', 'ios', 'android', 'smart_tv', 'legacy', 'editing'] as const;

export interface Preset {
  object: 'preset';
  /** `pre_…`, or the slug for system presets. */
  id: string;
  slug: string;
  name: string;
  description: string;
  system: boolean;
  /** Its own, else derived from `output`. */
  category: PresetCategory;
  /** The platforms the output plays on: its own, else derived from `output`. */
  compatibility: Platform[];
  /** Minimum versions and conditions, by platform in `compatibility`. */
  compatibility_notes: Partial<Record<Platform, string>>;
  output: OutputSpec;
  metadata: Metadata;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface PresetListParams extends ListParams {
  /** Any of these categories. */
  category?: PresetCategory | PresetCategory[];
  /** Every one of these platforms. */
  compatible_with?: Platform | Platform[];
  /** `false` leaves out the system presets. */
  system?: boolean;
}

export interface PresetCreateParams {
  name: string;
  slug?: string;
  description?: string;
  output: OutputSpecInput;
  metadata?: Metadata;
  /** Left out: derived from `output`. */
  category?: PresetCategory;
  /** The platforms to claim. Left out: derived from `output`. */
  compatibility?: Platform[];
  /** Notes over the derived ones, only for platforms claimed; 1–500 characters each. */
  compatibility_notes?: Partial<Record<Platform, string>>;
}

/**
 * `PATCH`: fields left out are unchanged; `output` merges into the stored spec; `null` clears
 * (`category`, `compatibility` and `compatibility_notes` are then derived from `output` again).
 */
export interface PresetUpdateParams {
  name?: string;
  slug?: string;
  description?: string | null;
  output?: OutputSpecInput;
  metadata?: Metadata | null;
  category?: PresetCategory | null;
  compatibility?: Platform[] | null;
  compatibility_notes?: Partial<Record<Platform, string>> | null;
}

/**
 * `PUT`: the whole preset. `output` is the full spec (fields left out take their defaults);
 * `description` and `metadata` left out are emptied; `category`, `compatibility` and
 * `compatibility_notes` left out are derived again; `slug` left out is kept.
 */
export interface PresetReplaceParams {
  name: string;
  output: OutputSpecInput;
  slug?: string;
  description?: string;
  metadata?: Metadata;
  category?: PresetCategory;
  compatibility?: Platform[];
  compatibility_notes?: Partial<Record<Platform, string>>;
}

// ---------------------------------------------------------------------------
// Webhooks and events
// ---------------------------------------------------------------------------

export type EventType =
  | 'job.created'
  | 'job.scheduled'
  | 'job.started'
  | 'job.completed'
  | 'job.failed'
  | 'job.canceled'
  | 'asset.ready'
  | 'asset.deleted'
  | 'job.delivered'
  | 'job.delivery_failed'
  | 'automation.triggered'
  | 'connection.disabled'
  | 'webhook.test';

export const EVENT_TYPES: readonly EventType[] = [
  'job.created',
  'job.scheduled',
  'job.started',
  'job.completed',
  'job.failed',
  'job.canceled',
  'asset.ready',
  'asset.deleted',
  'job.delivered',
  'job.delivery_failed',
  'automation.triggered',
  'connection.disabled',
  'webhook.test',
];

/** Where an event destination sends events. */
export type WebhookEndpointType = 'https' | 'sns' | 'sqs';

export const WEBHOOK_ENDPOINT_TYPES: readonly WebhookEndpointType[] = ['https', 'sns', 'sqs'];

/** AWS settings of an `sns` or `sqs` destination, as returned by the API. The secret access key is never returned. */
export interface WebhookAwsConfig {
  region: string;
  access_key_id: string;
  /** An SNS/SQS-compatible service endpoint, when not AWS itself. */
  endpoint: string | null;
  /** FIFO topics and queues only. */
  message_group_id: string | null;
  /** Always true: a secret access key is stored (it is write-only). */
  secret_access_key_set: boolean;
}

/** AWS settings sent on create. */
export interface WebhookAwsParams {
  access_key_id: string;
  secret_access_key: string;
  /** Derived from the topic ARN or queue URL when omitted. */
  region?: string;
  /** An SNS/SQS-compatible service endpoint. */
  endpoint?: string;
  /** FIFO topics and queues only. Default `"transcdr"`. */
  message_group_id?: string;
}

/**
 * AWS settings sent on update. Omit `secret_access_key` to keep the stored one. `null` clears
 * `endpoint` and `message_group_id` (`""` leaves them unchanged).
 */
export interface WebhookAwsUpdateParams {
  access_key_id?: string;
  secret_access_key?: string;
  region?: string;
  endpoint?: string | null;
  message_group_id?: string | null;
}

/** An event destination: an HTTPS webhook, an Amazon SNS topic or an Amazon SQS queue. */
export interface WebhookEndpoint {
  object: 'webhook_endpoint';
  id: string;
  /** `https` for endpoints created before destinations had a type. */
  type: WebhookEndpointType;
  /** The HTTPS URL; for `sns`/`sqs` the topic ARN or queue URL. */
  url: string;
  /** `sns` only. */
  topic_arn: string | null;
  /** `sqs` only. */
  queue_url: string | null;
  /** `sns`/`sqs` only. */
  aws: WebhookAwsConfig | null;
  description: string;
  /** Event types, or `["*"]`. */
  events: string[];
  enabled: boolean;
  /** Only present on create and rotate. Signs the `Transcdr-Signature` header or the `transcdr-signature` attribute. */
  secret?: string;
  /** The write-only secrets that are set, with their fingerprints (`secret_access_key`: sns/sqs). */
  secrets?: WebhookSecrets;
  created_at: Timestamp;
  updated_at?: Timestamp;
  last_delivery_at: Timestamp | null;
  failure_count: number;
  /**
   * The messaging connection (`sqs`, `sns` or `webhook`) events go through, or `null` when the
   * endpoint carries its own target. The connection's health and `enabled` flag then apply.
   */
  connection_id: string | null;
}

export interface WebhookSecrets {
  secret?: SecretFingerprint;
  secret_access_key?: SecretFingerprint;
}

export interface WebhookHttpsCreateParams {
  type?: 'https';
  url: string;
  events?: string[];
  description?: string;
}

export interface WebhookSnsCreateParams {
  type: 'sns';
  /** e.g. `arn:aws:sns:us-east-1:123456789012:transcdr-events` (`.fifo` for FIFO topics). */
  topic_arn: string;
  aws: WebhookAwsParams;
  events?: string[];
  description?: string;
}

export interface WebhookSqsCreateParams {
  type: 'sqs';
  /** e.g. `https://sqs.us-east-1.amazonaws.com/123456789012/transcdr-events`. */
  queue_url: string;
  aws: WebhookAwsParams;
  events?: string[];
  description?: string;
}

/** Deliver through a messaging connection, which holds the target and its credentials. */
export interface WebhookConnectionCreateParams {
  /** A `con_…` id of an `sqs`, `sns` or `webhook` connection. */
  connection_id: string;
  events?: string[];
  description?: string;
}

export type WebhookCreateParams =
  | WebhookHttpsCreateParams
  | WebhookSnsCreateParams
  | WebhookSqsCreateParams
  | WebhookConnectionCreateParams;

/** The payload of a `connection.disabled` event (`data.object`). */
export interface ConnectionDisabledEvent {
  object: 'connection';
  id: string;
  name: string;
  kind: ConnectionKind;
  enabled: false;
  disabled_at: Timestamp;
  /** `"<activity>: <error>"`. */
  disabled_reason: string;
  /** What Transcdr was doing when it failed, e.g. reading a queue or delivering outputs. */
  activity: string;
  /** The provider's error. */
  error: string;
  /** What it most likely means and how to fix it. */
  explanation: string;
  /** Ids of the automations that use the connection; they pause until it is back on. */
  automations: string[];
}

/** `type` cannot change after creation. Fields left out are unchanged; `null` clears `description`. */
export interface WebhookUpdateParams {
  url?: string;
  topic_arn?: string;
  queue_url?: string;
  aws?: WebhookAwsUpdateParams;
  events?: string[];
  description?: string | null;
  enabled?: boolean;
}

export type DeliveryStatus = 'pending' | 'succeeded' | 'failed';

export interface WebhookDelivery {
  object: 'webhook_delivery';
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  status: DeliveryStatus;
  attempts: number;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  next_retry_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Event<T = Job | Asset | Record<string, unknown>> {
  object: 'event';
  id: string;
  type: EventType | string;
  created_at: Timestamp;
  data: { object: T };
}

export interface EventListParams extends ListParams {
  type?: string;
}

// ---------------------------------------------------------------------------
// Keys, organization, users
// ---------------------------------------------------------------------------

export type Scope =
  | 'jobs:read'
  | 'jobs:write'
  | 'assets:read'
  | 'assets:write'
  | 'presets:read'
  | 'presets:write'
  | 'webhooks:read'
  | 'webhooks:write'
  | 'usage:read'
  | 'billing:read'
  | 'billing:write'
  | 'keys:read'
  | 'keys:write'
  | 'org:read'
  | 'org:write'
  | 'connections:read'
  | 'connections:write'
  | 'automations:read'
  | 'automations:write'
  | 'support:read'
  | 'support:write'
  | '*';

export const SCOPES: readonly Exclude<Scope, '*'>[] = [
  'jobs:read',
  'jobs:write',
  'assets:read',
  'assets:write',
  'presets:read',
  'presets:write',
  'webhooks:read',
  'webhooks:write',
  'usage:read',
  'billing:read',
  'billing:write',
  'keys:read',
  'keys:write',
  'org:read',
  'org:write',
  'connections:read',
  'connections:write',
  'automations:read',
  'automations:write',
  'support:read',
  'support:write',
];

export type KeyMode = 'live' | 'test';

export interface ApiKey {
  object: 'api_key';
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  mode: KeyMode;
  last_used_at: Timestamp | null;
  expires_at: Timestamp | null;
  /** Always null on keys the API returns: `retrieve` is 404 once a key is revoked. */
  revoked_at?: Timestamp | null;
  created_at: Timestamp;
  /** Only present on create. */
  secret?: string;
}

export interface ApiKeyCreateParams {
  name: string;
  scopes?: Scope[];
  mode?: KeyMode;
  expires_at?: Timestamp | null;
}

/**
 * `unlimited` is never listed by `plans.list()` and cannot be bought: the
 * Transcdr team assigns it. Jobs on it are never refused for credit and cost $0.
 */
export type PlanId = 'free' | 'pay_as_you_go' | 'starter' | 'growth' | 'scale' | 'enterprise' | 'unlimited';
/** Plans bought as a monthly subscription through checkout. */
export type SubscriptionPlanId = 'starter' | 'growth' | 'scale';
export type Role = 'owner' | 'admin' | 'member';

export interface Organization {
  object: 'organization';
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  billing_email: string | null;
  /**
   * Signs deliveries to per-job `webhook_url`s. Returned only to owners and
   * admins holding `org:write`.
   */
  job_webhook_secret?: string | null;
  /** The full plan object for `plan`. */
  plan_details?: Plan;
  /** Suspended organizations cannot create jobs (set by platform operators). */
  suspended?: boolean;
  created_at: Timestamp;
}

export interface OrganizationUpdateParams {
  name?: string;
  /** `null` (or `""`) clears it. */
  billing_email?: string | null;
}

export interface User {
  object: 'user';
  id: string;
  name: string;
  email: string;
  role: Role;
  organization_id: string;
  created_at: Timestamp;
}

/**
 * Add a member. The email of an existing Transcdr user gives that user access
 * (`name` and `password` are refused); an unknown email creates the user, and
 * then `name` and `password` are required.
 */
export interface MemberCreateParams {
  email: string;
  role: Role;
  name?: string;
  password?: string;
}

/** An organization the user belongs to, with the user's role there. */
export interface Membership {
  object: 'membership';
  organization: { id: string; name: string; slug: string; plan: PlanId };
  role: Role;
  created_at: Timestamp;
}

export interface OrganizationCreateParams {
  name: string;
}

export interface RegisterParams {
  name: string;
  email: string;
  password: string;
  organization_name: string;
}

export interface LoginParams {
  email: string;
  password: string;
  /** The organization to sign in to; by default the one used last. */
  organization_id?: string;
}

export interface ChangePasswordParams {
  current_password: string;
  new_password: string;
}

export interface AuthResponse {
  token: string;
  /** `role` and `organization_id` are the user's in `organization`. */
  user: User;
  /** The organization the token belongs to. */
  organization: Organization;
  /** Every organization the user belongs to. */
  organizations: Membership[];
}

export interface Me {
  object?: 'me';
  /**
   * The signed-in user, or for an API key the user who created the key. A non-null `user` does not
   * mean a session: use `isSession(me)`.
   */
  user: User | null;
  organization: Organization;
  /** Every organization the user belongs to (sessions); always empty for API keys. */
  organizations: Membership[];
  /** The token presented: a session's `prefix` starts `tds_`, an API key's `tdk_live_` or `tdk_test_`. */
  api_key?: ApiKey | null;
  scopes: Scope[];
  /** False for test-mode keys. */
  livemode?: boolean;
}

/** Whether `me` describes a session token (a signed-in user) rather than an API key. */
export function isSession(me: Pick<Me, 'api_key' | 'organizations'>): boolean {
  if (me.api_key?.prefix) return me.api_key.prefix.startsWith('tds_');
  // Older servers: a session lists its memberships (never empty); an API key lists none.
  return me.organizations.length > 0;
}

// ---------------------------------------------------------------------------
// Usage, plans, billing
// ---------------------------------------------------------------------------

export type Granularity = 'day' | 'week' | 'month';

export interface UsageParams {
  /** `YYYY-MM-DD` or RFC 3339. */
  from?: string;
  to?: string;
  granularity?: Granularity;
}

export interface UsagePoint {
  date: string;
  jobs: number;
  billable_minutes: number;
  /** Rounded up to the cent. */
  amount_cents: number;
  /** Exact, in dollars (sub-cent). */
  amount_usd: number;
}

export interface Usage {
  object: 'usage';
  from: string;
  to: string;
  granularity: Granularity;
  totals: {
    jobs: number;
    billable_minutes: number;
    input_minutes: number;
    output_bytes: number;
    amount_cents: number;
    amount_usd: number;
  };
  by_tier: Record<Tier, number>;
  by_codec: Record<Codec, number>;
  series: UsagePoint[];
}

export interface InputReportParams {
  /** `YYYY-MM-DD`; default 29 days before `to`. */
  from?: string;
  /** `YYYY-MM-DD`; default today. */
  to?: string;
}

/** Totals for a set of inputs. */
export interface InputTotals {
  files: number;
  size_bytes: number;
  input_minutes: number;
  billable_minutes: number;
}

/** One kind of input, `container/codec`: `mp4/h264`, `mkv/hevc`, `m4a/audio`. */
export interface InputKind extends InputTotals {
  /** `container/codec`, or `other` for the kinds past the seven most common. */
  kind: string;
  container: string | null;
  video_codec: string | null;
}

/** The inputs of one kind in one duration × size bucket (log scale, 4 per decade). */
export interface InputPoint extends InputTotals {
  kind: string;
  /** Where to plot the point. */
  mean_duration_seconds: number;
  mean_size_bytes: number;
  /** The bucket's bounds: `[low, high)`. */
  duration_range: [number, number];
  size_range: [number, number];
}

export interface InputReport {
  object: 'input_report';
  from: string;
  to: string;
  /** Inputs not probed yet, or with no duration or size: counted, not plotted. */
  unmeasured: number;
  /** Most files first; `other` last. */
  kinds: InputKind[];
  points: InputPoint[];
}

/** Price per output minute, in dollars. The same for every plan and codec. */
export interface RateCard {
  unit: 'output_minute';
  currency: 'usd';
  sd: number;
  hd: number;
  uhd: number;
  /** What each tier covers, e.g. `"577p to 1440p"`. */
  tiers: Record<Tier, string>;
}

export interface Plan {
  object: 'plan';
  id: PlanId;
  name: string;
  tagline?: string;
  /** Bought as a monthly subscription through checkout. */
  subscription: boolean;
  /** Monthly price. `null` means "contact us". */
  price_cents: number | null;
  currency?: 'usd';
  /** Credit each subscription period brings. Renews each period; does not roll over. */
  monthly_credit_cents: number;
  /** `monthly_credit_cents / price_cents`, e.g. `2.07`; `null` for plans without a monthly credit. */
  credit_value_ratio: number | null;
  /** One-time credit on sign-up, and how many days it lasts. */
  trial_credit_cents: number;
  trial_days: number;
  rates: RateCard;
  max_concurrent_jobs: number;
  max_resolution: number;
  max_input_bytes?: number;
  priority: boolean;
  retention_days: number;
  requests_per_minute?: number;
  features: string[];
}

export type BillingMode = 'prepaid' | 'invoiced';

export interface AutoRecharge {
  enabled: boolean;
  /** Recharge when available credit drops below this. */
  threshold_cents: number;
  /** How much each recharge adds. */
  amount_cents: number;
  /** At most this much is auto-recharged per calendar month; `null` for no cap. */
  monthly_cap_cents: number | null;
  /** A recharge is being charged right now. */
  pending: boolean;
  /** Why the last recharge failed. */
  last_error: string | null;
}

export interface CreditAccount {
  mode: BillingMode;
  /** What new jobs can spend: the balance minus credit reserved for running jobs. */
  available_usd: number;
  balance_usd: number;
  reserved_usd: number;
  credit: {
    /** This period's subscription credit. Does not roll over. */
    plan_usd: number;
    plan_expires_at: Timestamp | null;
    /** Bought credit. Never expires. */
    purchased_usd: number;
    /** Trial and promotional credit. */
    promo_usd: number;
    promo_expires_at: Timestamp | null;
  };
  this_month: {
    /** `YYYY-MM`. */
    period: string;
    spent_usd: number;
    auto_recharged_usd: number;
  };
  /** Spending stops at this much per calendar month; `null` for no limit. */
  monthly_limit_cents: number | null;
  auto_recharge: AutoRecharge;
  subscription: {
    status: string | null;
    current_period_end: Timestamp | null;
    cancel_at_period_end: boolean;
  } | null;
  /** A label for the saved card, e.g. `"Visa •••• 4242"`. */
  payment_method: string | null;
}

export interface Billing {
  object: 'billing';
  plan: Plan;
  rates: RateCard;
  account: CreditAccount;
  /** `YYYY-MM`. */
  period: string;
  period_start: Timestamp;
  period_end: Timestamp;
  usage_minutes: number;
  usage_usd: number;
  currency: 'usd';
  /** False when this installation takes no payments: credit is granted by the operator. */
  payments_enabled: boolean;
}

/** `{ plan }` subscribes (or moves an existing subscription); `{ credit_cents }` buys credit. */
export type CheckoutParams = { plan: SubscriptionPlanId } | { credit_cents: number };

export interface Checkout {
  object: 'checkout';
  /** Send the customer here to pay; `null` when nothing needs paying. */
  url: string | null;
  /** An existing subscription moved to another plan in place. */
  changed: boolean;
  plan?: PlanId;
}

export interface Portal {
  object: 'portal';
  url: string;
}

export interface AutoRechargeParams {
  enabled?: boolean;
  threshold_cents?: number;
  /** $10 to $10,000 (1000 to 1000000). */
  amount_cents?: number;
  /** `null` removes the cap. */
  monthly_cap_cents?: number | null;
}

export interface BillingSettingsParams {
  /** `null` clears the limit. */
  monthly_limit_cents?: number | null;
  auto_recharge?: AutoRechargeParams;
}

export type CreditTransactionKind = 'trial' | 'subscription' | 'purchase' | 'auto_recharge' | 'usage' | 'adjustment' | 'expiry';

export interface CreditTransaction {
  object: 'credit_transaction';
  id: string;
  kind: CreditTransactionKind;
  /** `promo`, `plan` or `purchased`; `mixed` for usage spanning buckets. */
  bucket: string;
  /** Positive adds credit, negative spends it. */
  amount_usd: number;
  description: string;
  job_id: string | null;
  created_at: Timestamp;
}

export interface CreditTransactionListParams {
  /** 1 to 200; default 50. */
  limit?: number;
}

export interface StatementLine {
  description: string;
  kind: CreditTransactionKind;
  /** Positive adds credit, negative spends it. */
  credit_usd: number;
  date?: Timestamp;
  quantity?: number;
  unit?: 'output_minute';
}

/** A monthly statement: credit added and the usage drawn from it. */
export interface Statement {
  object: 'statement';
  id: string;
  /** `YYYY-MM`. */
  period: string;
  period_start: Timestamp;
  period_end: Timestamp;
  status: 'open' | 'closed';
  lines: StatementLine[];
  usage_minutes: number;
  usage_cents: number;
  currency: 'usd';
}

/** @deprecated Monthly statements replaced invoices; use `Statement`. */
export type Invoice = Statement;
/** @deprecated Use `StatementLine`. */
export type InvoiceLine = StatementLine;

// ---------------------------------------------------------------------------
// Public service info
// ---------------------------------------------------------------------------

export interface Capabilities {
  codecs?: string[];
  modes?: string[];
  color?: string[];
  limits?: Record<string, unknown>;
  filters?: string[];
  system_presets?: Preset[];
  [key: string]: unknown;
}

export interface Status {
  object?: 'status';
  status: 'operational' | 'degraded' | string;
  /** Jobs waiting to start. */
  queue_depth: number;
  /** Jobs being processed right now. */
  running_jobs: number;
  version?: string;
}

/** Public, cached platform-wide counters (`GET /v1/stats`). */
export interface Stats {
  object: 'stats';
  /** When counting began. */
  since: Timestamp;
  updated_at: Timestamp;
  totals: {
    jobs_completed: number;
    output_minutes: number;
    source_minutes: number;
    bytes_delivered: number;
    renditions_delivered: number;
    customers: number;
  };
  last_24h: { jobs_completed: number; output_minutes: number };
  /** The last 30 days, oldest first, zero-filled. */
  daily: { date: string; jobs_completed: number; output_minutes: number }[];
}

// ---------------------------------------------------------------------------
// Platform operator console (`/v1/admin`, session tokens of operators only)
// ---------------------------------------------------------------------------

export interface AdminPoolStatus {
  driver: string;
  pool: string;
  nodes_total: number;
  nodes_ready: number;
  gpus_allocatable: number;
  pending_pods: number;
}

export interface AdminOverview {
  object: 'admin_overview';
  organizations: number;
  /** Live jobs only. */
  jobs_by_status: Record<JobStatus, number>;
  gpu_pool: AdminPoolStatus | null;
}

/** Infrastructure details the operator console sees for a job. Never exposed to customers. */
export interface AdminJobInternals {
  node: string | null;
  pod: string | null;
  gpus: string[];
  encoder: string | null;
  dispatch_ref: string | null;
  heartbeat_at: Timestamp | null;
  /** The unredacted error, before it is mapped to a customer-safe message. */
  raw_error: JobError | null;
}

/** A job as the operator console sees it: with its organization and internals. */
export interface AdminJob extends Job {
  organization: string | number;
  internals: AdminJobInternals | null;
}

export interface AdminOrganizationUpdateParams {
  plan?: PlanId;
  suspended?: boolean;
}

export interface AdminAnnouncementCreateParams {
  title: string;
  /** Markdown. */
  body: string;
  link?: AnnouncementLink | null;
  tags?: string[];
  /** Defaults to now; `null` saves a draft; a future time schedules it. */
  published_at?: Timestamp | null;
}

export type AdminAnnouncementUpdateParams = Partial<AdminAnnouncementCreateParams>;

// ---------------------------------------------------------------------------
// Announcements: the changelog and service-credit notices
// ---------------------------------------------------------------------------

export type AnnouncementKind = 'changelog' | 'service_credit';

export const ANNOUNCEMENT_KINDS: readonly AnnouncementKind[] = ['changelog', 'service_credit'];

/** A call to action. A `url` that is a path (`/app/…`) is on the dashboard. */
export interface AnnouncementLink {
  label: string;
  url: string;
}

/** What an incident's credit gave back to your organization. */
export interface ServiceCredit {
  incident_id: string;
  amount_usd: number;
  /** How many times the affected charges were credited. */
  multiplier: number;
  /** The affected jobs. */
  jobs: string[];
  applied_at: Timestamp;
}

export interface Announcement {
  object: 'announcement';
  id: string;
  kind: AnnouncementKind;
  title: string;
  /** Markdown. */
  body: string;
  /** `null` for a draft (operator console only). */
  published_at: Timestamp | null;
  link: AnnouncementLink | null;
  /** Changelog entries only; may be empty. */
  tags: string[];
  /** Service credits only. */
  credit: ServiceCredit | null;
  /** Always false for API keys, which have no user to remember it for. */
  seen: boolean;
  seen_at: Timestamp | null;
}

export interface AnnouncementListParams {
  /** Only what the signed-in user has not seen: service credits first, then the last 90 days of changelog. */
  unseen?: boolean;
  kind?: AnnouncementKind;
  /** 1–100, default 20. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Integrations: connections, automations, deliveries (Starter plan and above)
// ---------------------------------------------------------------------------

/** Where inputs come from and outputs go. */
export type StorageConnectionKind = 's3' | 'gcs' | 'azure_blob' | 'ftp' | 'ftps' | 'sftp' | 'http' | 'webdav';
/** Receives events; an `sqs` connection can also trigger automations. */
export type MessagingConnectionKind = 'sqs' | 'sns' | 'webhook';
export type ConnectionKind = StorageConnectionKind | MessagingConnectionKind;
export type ConnectionClass = 'storage' | 'messaging';
export type ConnectionStatus = 'untested' | 'ok' | 'error';

export const MESSAGING_CONNECTION_KINDS: readonly MessagingConnectionKind[] = ['sqs', 'sns', 'webhook'];

/** Whether a kind is a messaging one: never a job input, a destination or an automation source. */
export function isMessagingKind(kind: string): kind is MessagingConnectionKind {
  return (MESSAGING_CONNECTION_KINDS as readonly string[]).includes(kind);
}

/** Non-secret settings. Which fields apply depends on `kind`. */
export interface ConnectionConfig {
  /** s3: custom endpoint (R2, B2, MinIO…); http/webdav: base URL. */
  endpoint?: string | null;
  /** s3/gcs: bucket. azure_blob: container. */
  bucket?: string | null;
  region?: string | null;
  /** s3: address the bucket by path rather than subdomain. */
  path_style?: boolean;
  /** azure_blob: storage account name. */
  account?: string | null;
  /** ftp/ftps/sftp host. */
  host?: string | null;
  port?: number | null;
  username?: string | null;
  /** Every path is relative to this root inside the connection. */
  root?: string | null;
  /** ftp/ftps: passive mode (default true). */
  passive?: boolean | null;
  /** sftp: expected host key, `SHA256:…`. */
  host_key_fingerprint?: string | null;
  /** sqs: the queue URL, e.g. `https://sqs.us-east-1.amazonaws.com/123456789012/transcdr`. */
  queue_url?: string | null;
  /** sns: the topic ARN. */
  topic_arn?: string | null;
  /** webhook: the https URL events are POSTed to. */
  url?: string | null;
  /** sqs/sns: for FIFO queues and topics receiving events. */
  message_group_id?: string | null;
}

/** Write-only credentials. On update, an omitted secret is kept and `""` (or `null`, storage) clears it. */
export interface ConnectionSecrets {
  access_key_id?: string;
  secret_access_key?: string;
  session_token?: string;
  password?: string;
  private_key?: string;
  private_key_passphrase?: string;
  service_account_json?: string;
  account_key?: string;
  sas_token?: string;
  bearer_token?: string;
}

export interface Connection {
  object: 'connection';
  id: string;
  name: string;
  kind: ConnectionKind;
  config: ConnectionConfig;
  /** Names of the secrets that are stored (their values are never returned). */
  secrets_set: (keyof ConnectionSecrets)[];
  /** The secrets that are set, with their fingerprints. */
  secrets?: Partial<Record<keyof ConnectionSecrets, SecretFingerprint>>;
  /** Messaging connections are `false` on all three. */
  capabilities: { source: boolean; destination: boolean; watch: boolean };
  status: ConnectionStatus;
  /** `storage` (s3, gcs, …) or `messaging` (sqs, sns, webhook). */
  class: ConnectionClass;
  /**
   * Turned off automatically after a permanent failure, or 5 transient failures in a row.
   * While off, anything naming it is refused with 409 `connection_disabled`.
   */
  enabled: boolean;
  /** Transient failures in a row; any success resets it. */
  failure_count: number;
  /** Why it was turned off: `"<activity>: <error>"`, or `"Disabled by hand."`. */
  disabled_reason: string | null;
  disabled_at: Timestamp | null;
  last_error: string | null;
  last_checked_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ConnectionCreateParams {
  name: string;
  kind: ConnectionKind;
  config: ConnectionConfig;
  secrets?: ConnectionSecrets;
}

export interface ConnectionUpdateParams {
  name?: string;
  /** `true` turns it back on (the failure count resets and it is tested again); `false` turns it off. */
  enabled?: boolean;
  /** Merged into the stored config: a field left out is kept, `null` clears it. */
  config?: ConnectionConfig;
  /** A secret left out is kept; `""` or `null` (storage) clears it. */
  secrets?: ConnectionSecretsUpdate;
}

export type ConnectionSecretsUpdate = { [K in keyof ConnectionSecrets]?: string | null };

export interface ConnectionTestResult {
  object: 'connection_test';
  ok: boolean;
  error: string | null;
  connection: Connection;
}

// ---------------------------------------------------------------------------
// Integration checks: live verification of a connection or event destination
// ---------------------------------------------------------------------------

export type CheckStepStatus = 'passed' | 'failed' | 'skipped';

/**
 * Step ids. Connections: `settings`, `connect`, `identity`, `list`, `write`, `read`, `delete`.
 * Destinations: `identity`, then `deliver` (https), `publish` (sns) or `send` (sqs).
 */
export type CheckStepId =
  | 'settings'
  | 'connect'
  | 'identity'
  | 'list'
  | 'write'
  | 'read'
  | 'delete'
  | 'deliver'
  | 'publish'
  | 'send';

export interface CheckStep {
  id: CheckStepId | (string & {});
  label: string;
  status: CheckStepStatus;
  /** What happened, e.g. `Connected to s3://media/uploads.` or the provider error. */
  detail?: string | null;
  /** On failure: what to change, e.g. which permission to grant. */
  hint?: string | null;
  duration_ms?: number | null;
}

/** Who the credentials sign in as. */
export type CheckIdentity =
  | { provider: 'aws'; arn: string; account: string }
  | { provider: 'gcp'; service_account: string; project: string }
  | { provider: 'azure'; account: string; auth: string }
  | { provider: 's3_compatible'; access_key_id: string }
  | { provider: 'sftp'; user: string; server: string };

/** Which roles a storage connection can serve, given the permissions that passed. */
export interface ConnectionCheckRoles {
  source: boolean;
  watch_folder: boolean;
  destination: boolean;
}

/** Roles in the check of a messaging connection. */
export interface MessagingCheckRoles {
  /** sqs: the queue can be read, so it can trigger automations. */
  trigger?: boolean;
  /** sns, webhook: the test event got through. */
  notifications?: boolean;
}

/** Provider-specific setup instructions, scoped to the bucket, topic or queue. */
export interface CheckSetup {
  summary?: string;
  /** s3 (AWS), sns, sqs: a least-privilege IAM policy document. */
  iam_policy?: Record<string, unknown>;
  /** s3 */
  source_only?: string;
  destination_only?: string;
  kms?: string;
  /** gcs: IAM role; azure: RBAC role. */
  role?: string;
  source_only_role?: string;
  /** gcs: a gcloud command granting the role. */
  command?: string;
  /** sqs connection: the queue access policy that lets S3 send bucket notifications to the queue. */
  queue_policy_for_s3?: Record<string, unknown>;
  /** sqs connection: the queue access policy that lets an SNS topic fan out to the queue. */
  queue_policy_for_sns?: Record<string, unknown>;
  /** sqs connection: the bucket's notification configuration (`QueueConfigurations`). */
  s3_notification?: Record<string, unknown>;
  /** Extra guidance, one line each. */
  notes?: string[];
  /** azure: SAS permission letters. */
  sas_permissions?: string;
  source_only_sas_permissions?: string;
  [key: string]: unknown;
}

interface CheckReportBase {
  /** True when every step passed (skipped steps do not count against it). */
  ok: boolean;
  steps: CheckStep[];
  identity: CheckIdentity | null;
  setup: CheckSetup | null;
}

export interface ConnectionCheck extends CheckReportBase {
  object: 'connection_check';
  /** Storage: `source`, `watch_folder`, `destination`. Messaging: `trigger` (sqs) or `notifications` (sns, webhook). */
  roles: Partial<ConnectionCheckRoles> & MessagingCheckRoles;
  /** Saved connections only: the connection with its updated `status` and `last_error`. */
  connection?: Connection;
}

export interface WebhookCheck extends CheckReportBase {
  object: 'webhook_check';
  roles: { notifications: boolean };
  /** Saved endpoints only. */
  endpoint?: WebhookEndpoint;
}

/** Same body as `connections.create`; the name is optional. */
export type ConnectionCheckParams = Omit<ConnectionCreateParams, 'name'> & { name?: string };

/** A file (or, when `path` ends in `/`, a folder) in a connection. */
export interface RemoteObject {
  object: 'remote_object';
  path: string;
  size: number | null;
  last_modified: Timestamp | null;
}

export interface BrowseParams {
  prefix?: string;
  recursive?: boolean;
}

/** `watch` polls the source, `hook` takes pushes at `hook_url`, `queue` consumes an SQS connection. */
export type AutomationTrigger = 'watch' | 'hook' | 'queue';

export interface Automation {
  object: 'automation';
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  /** `queue`: the `sqs` connection it consumes. */
  trigger_connection_id: string | null;
  /** A storage connection: where the files are. */
  source: { connection_id: string; prefix: string; pattern: string };
  poll_interval_seconds: number;
  settle_seconds: number;
  /** A system preset slug or `pre_…` id. */
  preset: string | null;
  /** OutputSpec overrides merged over the preset. */
  output: OutputSpecInput;
  destination: JobDestination | null;
  after_success: 'keep' | 'delete';
  priority: Priority;
  metadata: Metadata;
  webhook_url: string | null;
  /** Push endpoint for trigger `hook`; shown to `automations:write` holders. */
  hook_url?: string;
  jobs_created: number;
  last_polled_at: Timestamp | null;
  last_triggered_at: Timestamp | null;
  last_error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AutomationCreateParams {
  name: string;
  enabled?: boolean;
  trigger?: AutomationTrigger;
  /** Required for `queue`: an enabled `sqs` connection. `""` clears it. */
  trigger_connection_id?: string | null;
  /** A storage connection: where the files are. */
  source: { connection_id: string; prefix?: string; pattern?: string };
  /** 60–86400. */
  poll_interval_seconds?: number;
  /** 0–86400. */
  settle_seconds?: number;
  preset?: string | null;
  output?: OutputSpecInput | null;
  destination?: JobDestination | null;
  after_success?: 'keep' | 'delete';
  priority?: Priority;
  metadata?: Metadata;
  /** `""` clears it. */
  webhook_url?: string;
}

/**
 * Fields left out are kept. `null` clears `destination`, `preset`, `output`, `metadata`, `webhook_url` and
 * `trigger_connection_id`.
 */
export type AutomationUpdateParams = Partial<Omit<AutomationCreateParams, 'source' | 'metadata' | 'webhook_url'>> & {
  source?: Partial<AutomationCreateParams['source']>;
  metadata?: Metadata | null;
  webhook_url?: string | null;
};

export interface AutomationRun {
  object: 'automation_run';
  jobs_created: number;
  job_ids?: string[];
  /** Queue automations: messages read in this batch. */
  messages_received?: number;
  /** Queue automations: messages handled and removed from the queue. */
  messages_deleted?: number;
}

export interface AutomationItem {
  object: 'automation_item';
  path: string;
  size_bytes: number | null;
  status: string;
  job_id: string | null;
  error: string | null;
  created_at: Timestamp;
}

export type DeliveryStatusValue = 'waiting' | 'pending' | 'running' | 'succeeded' | 'failed';

export interface Delivery {
  object: 'delivery';
  id: string;
  connection_id: string;
  prefix: string;
  status: DeliveryStatusValue;
  files: number;
  bytes: number;
  attempts: number;
  error: string | null;
  next_retry_at: Timestamp | null;
  created_at: Timestamp;
  completed_at: Timestamp | null;
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export type SupportCategory = 'job_problem' | 'billing' | 'account' | 'bug' | 'feature_request' | 'other';

/** `critical`: production is down or many jobs are failing. `high`: important work is blocked. `normal`. `low`: a question or something cosmetic. */
export type SupportSeverity = 'critical' | 'high' | 'normal' | 'low';

export type SupportTicketStatus = 'open' | 'waiting_on_us' | 'waiting_on_customer' | 'resolved' | 'closed';

export const SUPPORT_CATEGORIES: readonly SupportCategory[] = ['job_problem', 'billing', 'account', 'bug', 'feature_request', 'other'];
export const SUPPORT_SEVERITIES: readonly SupportSeverity[] = ['critical', 'high', 'normal', 'low'];
export const SUPPORT_TICKET_STATUSES: readonly SupportTicketStatus[] = ['open', 'waiting_on_us', 'waiting_on_customer', 'resolved', 'closed'];

/** Credit added to your account because of a ticket. */
export interface SupportCredit {
  object: 'support_credit';
  id: string;
  /** Formatted, e.g. `$5.00`. */
  amount: string;
  amount_micros: number;
  reason: string;
  /** `null`: never expires. */
  expires_at: Timestamp | null;
  created_at: Timestamp;
}

/** What a system message records; `null` on an ordinary message. */
export type SupportMessageEvent =
  | { type: 'status'; from: SupportTicketStatus; to: SupportTicketStatus }
  | { type: 'severity'; from: SupportSeverity; to: SupportSeverity }
  | { type: 'assignee'; from: string | null; to: string | null }
  | { type: 'credit'; amount: string };

/** One message on a ticket. Messages are append-only: never edited or deleted. */
export interface SupportMessage {
  object: 'support_message';
  id: string;
  /** Support staff appear as `Transcdr support`. */
  author: { kind: 'customer' | 'staff' | 'system'; name: string };
  body: string;
  /** Always `false` for you: staff-only notes are never returned. */
  internal: boolean;
  event: SupportMessageEvent | null;
  source: 'dashboard' | 'api' | 'email' | 'system';
  created_at: Timestamp;
}

export interface SupportTicket {
  object: 'support_ticket';
  id: string;
  /** `TCK-1001`, the reference emails use. Accepted wherever a ticket id is. */
  reference: string;
  number: number;
  subject: string;
  category: SupportCategory;
  /** The current severity; support may adjust the one you filed. */
  severity: SupportSeverity;
  filed_severity: SupportSeverity;
  status: SupportTicketStatus;
  job_ids: string[];
  asset_ids: string[];
  requester: { id: string; name: string; email: string };
  created_at: Timestamp;
  updated_at: Timestamp;
  last_message_at: Timestamp | null;
  /** Since when the ticket has been waiting on support; `null` unless open or waiting on us. */
  waiting_since: Timestamp | null;
  resolved_at: Timestamp | null;
  closed_at: Timestamp | null;
  credits: SupportCredit[];
  credit_total_micros: number;
  /** Present on a single ticket, oldest first. */
  messages?: SupportMessage[];
}

export interface SupportTicketCreateParams {
  /** At most 200 characters. */
  subject: string;
  category: SupportCategory;
  severity: SupportSeverity;
  /** At most 20,000 characters. */
  description: string;
  /** Up to 20 of your organization's jobs. */
  job_ids?: string[];
  /** Up to 20 of your organization's assets. */
  asset_ids?: string[];
}

export interface SupportTicketListParams {
  /** One status or several (an array, sent comma-separated). */
  status?: SupportTicketStatus | SupportTicketStatus[];
  /** 1–100. */
  limit?: number;
}

export interface SupportPreferences {
  object: 'support_preferences';
  /** Email me about tickets I opened. */
  ticket_emails: boolean;
  /** Owners and admins: also email me about every ticket in the organization. */
  org_ticket_emails: boolean;
  can_receive_org_emails: boolean;
}

export interface SupportPreferencesUpdateParams {
  ticket_emails?: boolean;
  org_ticket_emails?: boolean;
}
