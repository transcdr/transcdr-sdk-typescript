// Wire types for the Transcdr v1 API, with output spec v2. They mirror the API reference field for field.

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
// Output specification (v2)
// ---------------------------------------------------------------------------
//
// A spec is declared in sections, and nothing has a default: a spec states every field its kind, container, codec
// and handling need. A value that follows the source is written out (`"source"`, `"standard"`, `"from_color"`,
// `"by_size"`, `"poster"`, `"segment"`, `"all"`). Required fields are required in these types; a field whose need
// depends on another (an audio bitrate for a lossy codec, `stereo_fallback` in HLS, …) is optional here and checked
// by `validateOutput`, which reports every missing path at once, as the API's 422 `errors` does.

/** What a job produces. */
export type Kind = 'video' | 'audio' | 'image';
/** Every kind. */
export const KINDS = ['video', 'audio', 'image'] as const;

/** `mp4`: one faststart MP4 per size. `hls`: a CMAF/HLS package, cut into segments. */
export type VideoContainer =
  | { format: 'mp4'; segment_seconds?: never }
  | {
      format: 'hls';
      /** Seconds per segment, 1–20. */
      segment_seconds: number;
    };

/** `mp3` holds MP3 only, `flac` FLAC only, `m4a` any codec. */
export type AudioContainerFormat = 'mp3' | 'flac' | 'm4a';
export interface AudioContainer {
  format: AudioContainerFormat;
}

/** H.265 (HEVC) needs a paid plan. */
export type Codec = 'av1' | 'h264' | 'h265';
/** A quality level, or `vmaf=N` (1–100). */
export type QualityLevel = 'visually_lossless' | 'high' | 'standard' | 'low' | `vmaf=${number}`;
/** A bit rate such as `"128k"`, `"5M"` or `"2500000"`. */
export type Bitrate = string;

/** Constant bit rate. */
export interface Cbr {
  /** 100k–200M, or `"standard"`: a rate for each size by codec, short side and frame rate. */
  bitrate: Bitrate | 'standard';
  /** The rate buffer, 100–10000 ms. */
  buffer_ms: number;
}

/** How the video is coded: exactly one of `quality`, `crf` and `cbr`. */
export type VideoRate =
  | { quality: QualityLevel; crf?: never; cbr?: never }
  | { crf: number; quality?: never; cbr?: never }
  | { cbr: Cbr; quality?: never; crf?: never };

/** `from_color`: 8-bit for `sdr`, 10-bit for `hdr10` and `hlg`, the source's depth for `passthrough`. */
export type VideoBitDepth = 'from_color' | '8bit' | '10bit';
/** `hdr10` and `hlg` need a paid plan, and `from_color` or `10bit`. */
export type Color = 'sdr' | 'hdr10' | 'hlg' | 'passthrough';

export interface FrameRate {
  /** A cap in frames per second (1–240), or `"source"`: the source's rate, not capped. */
  max: number | 'source';
}

/**
 * The keyframe interval: `{frames: 1..1200}`, `{seconds: N}`, or (HLS only) `"segment"`: one keyframe at the start
 * of each segment and none inside it.
 */
export type Gop = { frames: number; seconds?: never } | { seconds: number; frames?: never } | 'segment';

/** The video track. */
export type Video = {
  codec: Codec;
  bit_depth: VideoBitDepth;
  color: Color;
  frame_rate: FrameRate;
  gop: Gop;
  /** A filter chain, one filter per entry, such as `["crop=1280:720", "hflip"]`; `[]` for none. */
  filters: string[];
} & VideoRate;

/**
 * `auto`: keep the source's audio where the container can carry it unchanged, otherwise make it `codec`.
 * `encode`: make it `codec` (a source already in `codec`, with nothing else changed, is copied). `drop`: no audio.
 */
export type AudioHandling = 'auto' | 'encode' | 'drop';
/** `aac` is AAC-LC, which plays everywhere; `mp3` is stereo at most and not for HLS; `flac` and `alac` are lossless. */
export type AudioCodec = 'opus' | 'mp3' | 'aac' | 'flac' | 'alac';
/** Every audio codec. */
export const AUDIO_CODECS = ['opus', 'mp3', 'aac', 'flac', 'alac'] as const;
/** The output layout; `source` keeps the source's. Audio is never upmixed. */
export type AudioChannels = 'source' | 'mono' | 'stereo' | '5.1' | '7.1';
/** Every audio channel layout, in display order. */
export const AUDIO_CHANNELS = ['source', 'mono', 'stereo', '5.1', '7.1'] as const;
/** FLAC and ALAC sample depth. `source`: 16-bit for a 16-bit or lossy source, 24-bit for a deeper one. */
export type AudioBitDepth = 'source' | '16' | '24';
/** FLAC compression effort: the same audio either way, a smaller file for more work. */
export type FlacCompression = 'fast' | 'balanced' | 'best';
/**
 * What an HE-AAC (or HE-AAC v2) source becomes. It decodes only as its AAC-LC core (half the sample rate, less
 * bandwidth, and for v2 one channel). `auto` keeps it where only a codec change is asked and decodes its core where
 * the job needs PCM; `passthrough` never decodes it (a job that would need it fails); `core` decodes its core whenever
 * another codec or a change is asked.
 */
export type HeAac = 'auto' | 'passthrough' | 'core';
/** Every HE-AAC policy, in display order. */
export const HE_AAC = ['auto', 'passthrough', 'core'] as const;

interface AudioTrackBase {
  handling: 'auto' | 'encode';
  channels: AudioChannels;
  he_aac: HeAac;
  /** Required in HLS: a stereo downmix beside surround audio. Needs `channels` `source`, `5.1` or `7.1`. */
  stereo_fallback?: boolean;
}

/** Opus, MP3 or AAC. */
export interface LossyAudio extends AudioTrackBase {
  codec: 'opus' | 'mp3' | 'aac';
  /**
   * A rate (MP3: 32k, 40k, 48k, 56k, 64k, 80k, 96k, 112k, 128k, 160k, 192k, 224k, 256k or 320k; AAC: 8k–288k per
   * main channel), or `"standard"`: AAC 64k mono, 128k stereo, 384k 5.1, 512k 7.1; Opus 96k stereo, 320k 5.1,
   * 416k 7.1; MP3 64k mono, 128k stereo.
   */
  bitrate: Bitrate | 'standard';
  bit_depth?: never;
  flac_compression?: never;
}

export interface FlacAudio extends AudioTrackBase {
  codec: 'flac';
  bit_depth: AudioBitDepth;
  flac_compression: FlacCompression;
  bitrate?: never;
}

export interface AlacAudio extends AudioTrackBase {
  codec: 'alac';
  bit_depth: AudioBitDepth;
  bitrate?: never;
  flac_compression?: never;
}

/** An audio track: `handling` `auto` or `encode`. */
export type AudioTrack = LossyAudio | FlacAudio | AlacAudio;

/** No audio track (video only). */
export interface AudioDrop {
  handling: 'drop';
  codec?: never;
  bitrate?: never;
  channels?: never;
  he_aac?: never;
  stereo_fallback?: never;
  bit_depth?: never;
  flac_compression?: never;
}

/** The audio track of a video: a track, or none. */
export type Audio = AudioTrack | AudioDrop;

/**
 * How the picture meets a size's box: `contain` keeps its shape inside the box, `cover` fills the box and
 * centre-crops, `pad` keeps its shape and adds bars to exactly the box, `stretch` distorts it to exactly the box.
 */
export type Fit = 'contain' | 'cover' | 'pad' | 'stretch';
/** Every fit, in display order. */
export const FITS = ['contain', 'cover', 'pad', 'stretch'] as const;
/** `auto`: the box turns to the picture's orientation (1920×1080 on a portrait video is 1080×1920). `fixed`: as written. */
export type Orientation = 'auto' | 'fixed';
/** Every orientation. */
export const ORIENTATIONS = ['auto', 'fixed'] as const;

/** 1–32 of `A–Z a–z 0–9 - _`, or `"by_size"`: video `<short side>p` of the size it comes out at, image `WxH`. */
export type Label = string;

/** One size: `width` × `height` is a box the picture is fitted into, not the output size. */
export interface Size {
  label: Label | 'by_size';
  /** Video: even, 64–7680, within the plan's maximum. Image: 16–8192. */
  width: number;
  /** Video: even, 64–4320. Image: 16–8192. */
  height: number;
  fit: Fit;
  orientation: Orientation;
  /** Let the output be larger than the source. */
  upscale: boolean;
  /** With `video.cbr` only, optional: this size's own constant rate, over `video.cbr.bitrate`. */
  video?: { cbr: { bitrate: Bitrate | 'standard' } };
}

/** An automatic ladder of the standard short sides up to `max_short_side`, never above the source (video only). */
export interface Ladder {
  /** The top rung's short side, 64 up to the plan's maximum. */
  max_short_side: number;
  fit: Fit;
  upscale: boolean;
}

/** One output at the source's own size. */
export interface SourceSize {
  label: Label | 'by_size';
  fit: Fit;
  upscale: boolean;
}

/** The sizes of a video: exactly one of `sizes`, `ladder` and `source_size`. */
export type VideoRenditions =
  | { sizes: Size[]; ladder?: never; source_size?: never }
  | { ladder: Ladder; sizes?: never; source_size?: never }
  | { source_size: SourceSize; sizes?: never; ladder?: never };

/** The sizes of images: exactly one of `sizes` and `source_size`. */
export type ImageRenditions =
  | { sizes: Size[]; ladder?: never; source_size?: never }
  | { source_size: SourceSize; sizes?: never; ladder?: never };

/** The subtitle tracks carried: `{tracks: "all" | "none"}` or `{languages: [...]}` (ISO 639-2 codes). */
export type Subtitles = { tracks: 'all' | 'none'; languages?: never } | { languages: string[]; tracks?: never };

/** The part of the source used, in seconds. */
export interface Trim {
  start: number;
  /** After `start`, or `"source"`: the end of the source. */
  end: number | 'source';
}

/** An image output format; PNG is always lossless. */
export type ImageFormat = 'avif' | 'webp' | 'jpeg' | 'png';
/** Every image output format, in display order. */
export const IMAGE_FORMATS = ['avif', 'webp', 'jpeg', 'png'] as const;
/** The lossy image formats, which take a quality. */
export type LossyImageFormat = 'avif' | 'webp' | 'jpeg';

/**
 * Which stills: `"poster"` (an image input as it is; a video's frame 10% of the way in), or for a video input
 * `{count: 1..100}` evenly spaced, or `{at_seconds: [...]}` (1–100 times).
 */
export type ImageFrames = 'poster' | { count: number; at_seconds?: never } | { at_seconds: number[]; count?: never };

/** Still images: every size is made in every format. */
export interface ImageSpec {
  /** 1–4 distinct formats. */
  formats: ImageFormat[];
  /** Required with `webp`: lossless WebP. */
  lossless?: boolean;
  /** Required when a lossy format is made: one entry, 1–100, for each lossy format made and no others. */
  quality?: Partial<Record<LossyImageFormat, number>>;
  /** `srgb` converts the pixels; `keep` keeps the source's profile (PNG, JPEG, WebP). */
  color_profile: 'srgb' | 'keep';
  frames: ImageFrames;
}

/** A starting point for `privacy`. */
export type PrivacyPreset = 'strip_all' | 'strip_location' | 'keep_all';
export type LocationHandling = 'strip' | 'approximate' | 'keep';
export type CaptureTimeHandling = 'strip' | 'date' | 'keep';
export type DeviceHandling = 'strip' | 'keep' | 'keep_all';
export type DescriptiveHandling = 'strip' | 'keep';

/** Every category written out. Responses always show privacy this way. */
export interface PrivacyFields {
  /** GPS coordinates and place names; `approximate` rounds to about 1 km. */
  location: LocationHandling;
  /** When it was recorded; `date` keeps the day only. */
  capture_time: CaptureTimeHandling;
  /** Make, model, lens, software; `keep_all` adds serial numbers and the owner name. */
  device: DeviceHandling;
  /** Title, artist, copyright, comment and other tags. */
  descriptive: DescriptiveHandling;
  preset?: never;
}

/** A preset, with any of the categories refining it. */
export interface PrivacyFromPreset {
  preset: PrivacyPreset;
  location?: LocationHandling;
  capture_time?: CaptureTimeHandling;
  device?: DeviceHandling;
  descriptive?: DescriptiveHandling;
}

/**
 * Which identifying metadata survives: a `preset` (`strip_all` keeps nothing, `strip_location` keeps all but
 * location, `keep_all` keeps everything) with any categories given refining it, or all four categories without a
 * preset. HLS keeps nothing.
 */
export type Privacy = PrivacyFromPreset | PrivacyFields;

/** Video: an MP4 per size, or an HLS package. */
export interface VideoOutput {
  kind: 'video';
  container: VideoContainer;
  video: Video;
  audio: Audio;
  renditions: VideoRenditions;
  subtitles: Subtitles;
  trim: Trim;
  privacy: Privacy;
  image?: never;
}

/** The audio alone, as one file. */
export interface AudioOutput {
  kind: 'audio';
  container: AudioContainer;
  audio: AudioTrack;
  privacy: Privacy;
  video?: never;
  image?: never;
  renditions?: never;
  subtitles?: never;
  trim?: never;
}

/** Still images of an image, or stills taken from a video. */
export interface ImageOutput {
  kind: 'image';
  image: ImageSpec;
  renditions: ImageRenditions;
  privacy: Privacy;
  container?: never;
  video?: never;
  audio?: never;
  subtitles?: never;
  trim?: never;
}

/** A complete output specification (v2). Jobs, presets and automations return it fully resolved. */
export type OutputSpec = VideoOutput | AudioOutput | ImageOutput;

/**
 * `T` with every field optional, and `null` to remove one: a partial merged over a preset. Objects merge key by
 * key; scalars and arrays replace; one choice of an exclusive group (`crf` over `quality`, `ladder` over `sizes`,
 * `languages` over `tracks`, …) replaces the others.
 */
export type Override<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: Override<T[K]> | null }
    : T;

/**
 * Fields to change in a preset's spec (sent with `preset`). `kind` cannot change; the merged result must be complete,
 * so a field that no longer applies (say `segment_seconds` after switching to `mp4`) must be set to `null`.
 */
export type OutputOverrides = Override<OutputSpec>;

/** Where a job's spec came from: the preset version and the request's overrides over it. */
export interface PresetProvenance {
  /** The preset's id. */
  id: string;
  slug: string;
  /** The version the job was resolved from. */
  version: number;
  /** The request's `output` over the preset, in v2; `null` for none. */
  overrides: OutputOverrides | null;
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
/** An output image's price tier, by the pixels it came out at. */
export type ImageTier = 'up_to_1mp' | 'up_to_4mp' | 'over_4mp';
/** Every image tier, smallest first. */
export const IMAGE_TIERS = ['up_to_1mp', 'up_to_4mp', 'over_4mp'] as const;

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
  /** Image output: the file's format. */
  format?: ImageFormat;
  /** Image output: the rendition it was made for (its label, or the size it came out at). */
  rendition?: string;
  /** Image output of a video with several stills: which still, from 1. */
  frame?: number;
  /** Image output of a video: the still's time, in seconds. */
  at_seconds?: number;
}

export interface JobError {
  /** Stable code, e.g. `decode_failed`, `input_unreachable`. */
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobBilling {
  billable_minutes: number;
  /** Image output: the images billed (an image job bills no minutes). */
  billable_images?: number;
  /** Rounded up to the cent. */
  amount_cents: number;
  /** Exact, in dollars (sub-cent). */
  amount_usd?: number;
  /** Null until the job has produced output. An image job's is an `ImageTier`. */
  tier: Tier | ImageTier | null;
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
  /** The preset version and overrides the spec was resolved from; `null` for a job given its whole spec. */
  preset: PresetProvenance | null;
  /** The resolved, complete spec: what runs. Rerunning or duplicating a job uses it. */
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

interface JobCreateBase {
  input: JobInput;
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

/**
 * A job names a preset (a system slug such as `hls-h264-abr`, your preset's slug or `pre_…` id, the latest version,
 * or `slug@N` for version N) with optional overrides, or gives its whole spec.
 */
export type JobCreateParams = JobCreateBase &
  (
    | {
        preset: string;
        /** Fields over the preset's version: objects merge, arrays replace, `null` removes. */
        output?: OutputOverrides;
      }
    | {
        preset?: undefined;
        /** The whole spec, complete. Checked before it is sent (see `validateOutput`). */
        output: OutputSpec;
      }
  );

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
 * `audio` (audio-only), `archive` (visually lossless, HDR) and `image` (still images). More may be added.
 */
export type PresetCategory =
  | 'web'
  | 'mobile'
  | 'streaming'
  | 'tv'
  | 'social'
  | 'audio'
  | 'archive'
  | 'image'
  | (string & {});

/** Every category, in display order. */
export const PRESET_CATEGORIES = ['web', 'mobile', 'streaming', 'tv', 'social', 'audio', 'archive', 'image'] as const;

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
  /** Its latest version. Versions never change: editing the output adds one. */
  version: number;
  /** The latest version's spec, complete. */
  output: OutputSpec;
  metadata: Metadata;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

/** One version of a preset: a complete spec that never changes. */
export interface PresetVersion {
  object: 'preset_version';
  version: number;
  output: OutputSpec;
  /** `null` for system presets. */
  created_at: Timestamp | null;
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
  /** The whole spec, complete. Checked before it is sent (see `validateOutput`). */
  output: OutputSpec;
  metadata?: Metadata;
  /** Left out: derived from `output`. */
  category?: PresetCategory;
  /** The platforms to claim. Left out: derived from `output`. */
  compatibility?: Platform[];
  /** Notes over the derived ones, only for platforms claimed; 1–500 characters each. */
  compatibility_notes?: Partial<Record<Platform, string>>;
}

/**
 * `PATCH`: fields left out are unchanged; `output` merges over the latest version, and a changed spec is a new
 * version; `null` clears (`category`, `compatibility` and `compatibility_notes` are then derived from `output` again).
 */
export interface PresetUpdateParams {
  name?: string;
  slug?: string;
  description?: string | null;
  output?: OutputOverrides;
  metadata?: Metadata | null;
  category?: PresetCategory | null;
  compatibility?: Platform[] | null;
  compatibility_notes?: Partial<Record<Platform, string>> | null;
}

/**
 * `PUT`: the whole preset. `output` is the whole spec, complete (a changed spec is a new version);
 * `description` and `metadata` left out are emptied; `category`, `compatibility` and
 * `compatibility_notes` left out are derived again; `slug` left out is kept.
 */
export interface PresetReplaceParams {
  name: string;
  /** The whole spec, complete. Checked before it is sent (see `validateOutput`). */
  output: OutputSpec;
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
  billable_images?: number;
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
    /** Output images billed. */
    billable_images?: number;
    input_minutes: number;
    output_bytes: number;
    amount_cents: number;
    amount_usd: number;
  };
  by_tier: Record<Tier, number>;
  /** Output images billed, by tier. */
  by_image_tier?: Record<ImageTier, number>;
  /** Minutes by codec (image jobs are not counted here). */
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

/** Price per output image, in dollars, by the pixels it came out at. */
export interface ImageRateCard {
  unit: 'output_image';
  currency: 'usd';
  up_to_1mp: number;
  up_to_4mp: number;
  over_4mp: number;
  /** What each tier covers, e.g. `"up to 1 megapixel"`. */
  tiers: Record<ImageTier, string>;
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
  /** Image output prices. */
  image_rates?: ImageRateCard;
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
  /** Image output prices. */
  image_rates?: ImageRateCard;
  account: CreditAccount;
  /** `YYYY-MM`. */
  period: string;
  period_start: Timestamp;
  period_end: Timestamp;
  usage_minutes: number;
  /** Output images billed this period. */
  usage_images?: number;
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
  unit?: 'output_minute' | 'output_image';
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
  /** Output images billed this period. */
  usage_images?: number;
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

/** An image output format, as `GET /v1/capabilities` lists it. */
export interface ImageFormatInfo {
  id: ImageFormat | (string & {});
  name: string;
  default: boolean;
  /** Takes `image.quality`. */
  lossy: boolean;
  /** Can be lossless (PNG always, WebP with `image.lossless`). */
  lossless: boolean;
  /** Keeps transparency. */
  alpha: boolean;
  /** The quality used when `image.quality` is left out; lossy formats only. */
  default_quality?: number;
}

/** Image output limits. */
export interface ImageLimits {
  /** Smallest rendition side. */
  min_dimension: number;
  /** Largest rendition side. */
  max_dimension: number;
  /** Most files one job may make: stills × renditions × formats. */
  max_outputs: number;
  /** Most stills one video may give. */
  max_frames: number;
  /** Largest image input. */
  max_input_megapixels: number;
}

/** A condition: any one of these objects; one holds when every path in it has one of the listed values (`"*"`: present, `"!"`: absent). */
export type OutputCondition = Record<string, string[]>[];

/** One field of the output spec, as data. */
export interface OutputFieldInfo {
  /** Relative to `output`; `[]` stands for each entry of a list (`renditions.sizes[].fit`). */
  path: string;
  /** Needed whenever `when` holds; when `false`, allowed whenever it holds. Outside `when`, refused. */
  required: boolean;
  when: OutputCondition;
  /** The value's shape: `{type: "enum", values}`, `{type: "number", min, max, words}`, `{type: "bitrate", words}`, … */
  shape: { type: string; [key: string]: unknown };
  /** Its exclusive group, if it is one of several choices. */
  group: string | null;
  description: string;
}

/** Choices of which exactly one is given whenever `when` holds. */
export interface OutputGroupInfo {
  name: string;
  members: string[];
  when: OutputCondition;
  exactly_one: boolean;
}

/** `capabilities.output`: the v2 output spec described as data, for checking a spec before sending it. */
export interface OutputCapabilities {
  version: number;
  kinds: Kind[];
  fields: OutputFieldInfo[];
  groups: OutputGroupInfo[];
  /** How to read `when`, in words. */
  conditions: string;
  /** Each container, its kind and the audio codecs it holds. */
  containers: { id: string; kind: Kind; audio_codecs: AudioCodec[] }[];
  audio_codecs: { id: AudioCodec; name: string; lossless: boolean; max_channels: number; bitrates: string[] | null }[];
  /** The values that follow the source (`"video.frame_rate.max: source"`) and what each resolves to. */
  follow_values: Record<string, string>;
  compatibility: {
    v1_requests: string;
    v1_responses: { header: string; value: string; query: string; sunset: string };
  };
}

export interface Capabilities {
  /** The v2 output spec: every field, when it is required, and what it takes. */
  output?: OutputCapabilities;
  codecs?: string[];
  modes?: string[];
  color?: string[];
  limits?: Record<string, unknown> & { image?: ImageLimits };
  /** Image output formats; empty when image output is unavailable. */
  image_formats?: ImageFormatInfo[];
  /** Image inputs read: `jpeg`, `png`, `webp`, `avif`, `gif` (first frame), `tiff`, `bmp`, `heic`. */
  input_image_formats?: string[];
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
  /** `null` for a draft. */
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
  /** A system preset slug, your preset's slug or `pre_…` id, or `slug@N` to pin version N. */
  preset: string | null;
  /** Fields over the preset, merged when a job is made (v2). */
  output: OutputOverrides;
  /** The complete spec `preset` and `output` resolve to now. */
  resolved_output: OutputSpec | null;
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
  /** A preset slug or id, or `slug@N`; resolved each time a job is made. */
  preset?: string | null;
  /** Fields over the preset; without a preset, the whole spec. */
  output?: OutputOverrides | null;
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
