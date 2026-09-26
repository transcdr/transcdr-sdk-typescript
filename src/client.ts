import { Core, type ClientOptions, type RequestOptions } from './core';
import { Admin } from './resources/admin';
import { ApiKeys } from './resources/apiKeys';
import { Assets } from './resources/assets';
import { Auth } from './resources/auth';
import { Automations, Connections, Deliveries } from './resources/integrations';
import { Jobs } from './resources/jobs';
import {
  BillingResource,
  CapabilitiesResource,
  Events,
  Plans,
  Presets,
  Probe,
  StatsResource,
  StatusResource,
  UsageResource,
} from './resources/misc';
import { OrganizationResource } from './resources/organization';
import { Uploads } from './resources/uploads';
import { Webhooks } from './resources/webhooks';

/**
 * The Transcdr API client.
 *
 * ```ts
 * const transcdr = new Transcdr({ apiKey: process.env.TRANSCDR_API_KEY });
 * const job = await transcdr.jobs.create({ input: { type: 'url', url }, preset: 'hls-av1-abr' });
 * ```
 */
export class Transcdr {
  private readonly core: Core;

  readonly auth: Auth;
  readonly organization: OrganizationResource;
  readonly apiKeys: ApiKeys;
  readonly uploads: Uploads;
  readonly assets: Assets;
  readonly jobs: Jobs;
  readonly probe: Probe;
  readonly presets: Presets;
  readonly webhooks: Webhooks;
  readonly events: Events;
  readonly usage: UsageResource;
  readonly billing: BillingResource;
  readonly plans: Plans;
  readonly capabilities: CapabilitiesResource;
  readonly status: StatusResource;
  readonly stats: StatsResource;
  readonly connections: Connections;
  readonly automations: Automations;
  readonly deliveries: Deliveries;
  /** Platform operators only. */
  readonly admin: Admin;

  constructor(options: ClientOptions = {}) {
    this.core = new Core(options);
    this.auth = new Auth(this.core);
    this.organization = new OrganizationResource(this.core);
    this.apiKeys = new ApiKeys(this.core);
    this.uploads = new Uploads(this.core);
    this.assets = new Assets(this.core);
    this.jobs = new Jobs(this.core);
    this.probe = new Probe(this.core);
    this.presets = new Presets(this.core);
    this.webhooks = new Webhooks(this.core);
    this.events = new Events(this.core);
    this.usage = new UsageResource(this.core);
    this.billing = new BillingResource(this.core);
    this.plans = new Plans(this.core);
    this.capabilities = new CapabilitiesResource(this.core);
    this.status = new StatusResource(this.core);
    this.stats = new StatsResource(this.core);
    this.connections = new Connections(this.core);
    this.automations = new Automations(this.core);
    this.deliveries = new Deliveries(this.core);
    this.admin = new Admin(this.core);
  }

  /** The API base URL in use. */
  get baseUrl(): string {
    return this.core.baseUrl;
  }

  /** The bearer token in use, if any. */
  get apiKey(): string | null {
    return this.core.apiKey;
  }

  /** Replace the bearer token, e.g. after `auth.login`. Pass `null` to clear it. */
  setApiKey(apiKey: string | null): void {
    this.core.apiKey = apiKey;
  }

  /** Call any endpoint directly (an escape hatch for routes newer than the SDK). */
  request<T = unknown>(method: string, path: string, options?: RequestOptions): Promise<T> {
    return this.core.request<T>(method, path, options);
  }
}
