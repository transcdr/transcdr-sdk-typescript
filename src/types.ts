// Wire types for the Transcdr v1 API. These mirror `docs/api-contract.md`
// and the Rust types in `crates/transcdr-core` field for field.

/** RFC 3339 UTC timestamp, e.g. `2026-09-26T12:00:00Z`. */
export type Timestamp = string;

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

export type Mode = 'single' | 'hls';
export type Codec = 'av1' | 'h264' | 'h265';
export type AudioMode = 'auto' | 'opus' | 'drop';
export type Color = 'sdr' | 'hdr10' | 'hlg' | 'passthrough';
export type BitDepth = 'auto' | '8bit' | '10bit';
/** `visually_lossless` | `high` | `standard` | `low` | `vmaf=N` (1–100). */
export type QualityTarget = 'visually_lossless' | 'high' | 'standard' | 'low' | `vmaf=${number}`;

export interface Rendition {
  /** Even, 64–7680. */
  width: number;
  /** Even, 64–4320. */
  height: number;
  /** Target bitrate such as `"3M"` or `"800k"`; omitted codes to the quality target. */
  bitrate?: string | null;
  /** Display label, 1–32 of `[A-Za-z0-9_-]`; defaults to `"<short side>p"`. */
  label?: string | null;
}

export interface Ladder {
  /** Cap the tallest rung's short side, e.g. `1080`. */
  max_short_side?: number | null;
}

export interface Quality {
  target?: QualityTarget | string | null;
  /** 0–63; wins over `target`. */
  crf?: number | null;
}

export interface Audio {
  mode?: AudioMode;
  /** Opus bitrate such as `"128k"` (6k–512k). */
  bitrate?: string | null;
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

export interface Preset {
  object: 'preset';
  /** `pre_…`, or the slug for system presets. */
  id: string;
  slug: string;
  name: string;
  description: string;
  system: boolean;
  output: OutputSpec;
  metadata: Metadata;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface PresetCreateParams {
  name: string;
  slug?: string;
  description?: string;
  output: OutputSpecInput;
  metadata?: Metadata;
}

export type PresetUpdateParams = Partial<PresetCreateParams>;

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

/** AWS settings sent on update. Omit `secret_access_key` to keep the stored one. */
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

/** `type` cannot change after creation. */
export interface WebhookUpdateParams {
  url?: string;
  topic_arn?: string;
  queue_url?: string;
  aws?: WebhookAwsUpdateParams;
  events?: string[];
  description?: string;
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

export type PlanId = 'free' | 'pay_as_you_go' | 'starter' | 'growth' | 'scale' | 'enterprise';
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
  billing_email?: string;
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

export interface MemberCreateParams {
  name: string;
  email: string;
  role: Role;
  password: string;
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
}

export interface ChangePasswordParams {
  current_password: string;
  new_password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  organization: Organization;
}

export interface Me {
  /** Null when authenticated with an API key. */
  user: User | null;
  organization: Organization;
  /** The key in use, when authenticated with an API key. */
  api_key?: ApiKey | null;
  scopes: Scope[];
  /** False for test-mode keys. */
  livemode?: boolean;
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

/** Write-only credentials. On update, an omitted secret is kept and `""` clears it. */
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
  /** Merged into the stored config. */
  config?: ConnectionConfig;
  secrets?: ConnectionSecrets;
}

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

export type AutomationUpdateParams = Partial<Omit<AutomationCreateParams, 'source'>> & {
  source?: Partial<AutomationCreateParams['source']>;
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
