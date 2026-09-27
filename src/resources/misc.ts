import type { RequestOptions } from '../core';
import type { PagePromise } from '../pagination';
import type {
  Billing,
  BillingSettingsParams,
  Capabilities,
  Checkout,
  CheckoutParams,
  CreditTransaction,
  CreditTransactionListParams,
  Event,
  EventListParams,
  InputReport,
  InputReportParams,
  Job,
  ListParams,
  ListResponse,
  Plan,
  PlanId,
  Portal,
  Preset,
  PresetCreateParams,
  PresetUpdateParams,
  ProbeParams,
  Statement,
  Stats,
  Status,
  Usage,
  UsageParams,
} from '../types';
import { Resource, seg } from './base';

export class Probe extends Resource {
  /** Probe an input without transcoding. `wait: true` blocks up to 60 s for the result. */
  create(params: ProbeParams & { wait?: boolean }, options?: RequestOptions): Promise<Job> {
    const { wait, ...body } = params;
    return this.core.request('POST', '/v1/probe', {
      ...options,
      body,
      query: { ...options?.query, wait: wait ? 'true' : undefined },
      timeoutMs: options?.timeoutMs ?? (wait ? 90_000 : undefined),
    });
  }
}

export class Presets extends Resource {
  /** System presets and your organization's presets. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Preset> {
    return this.core.list('/v1/presets', { ...params }, options);
  }

  listAll(params: ListParams = {}, max?: number): Promise<Preset[]> {
    return this.list(params).toArray(max);
  }

  create(params: PresetCreateParams, options?: RequestOptions): Promise<Preset> {
    return this.core.request('POST', '/v1/presets', { ...options, body: params });
  }

  /** By `pre_…` id or by slug (system or custom). */
  retrieve(idOrSlug: string, options?: RequestOptions): Promise<Preset> {
    return this.core.request('GET', `/v1/presets/${seg(idOrSlug)}`, options);
  }

  update(id: string, params: PresetUpdateParams, options?: RequestOptions): Promise<Preset> {
    return this.core.request('PATCH', `/v1/presets/${seg(id)}`, { ...options, body: params });
  }

  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/presets/${seg(id)}`, options);
  }
}

export class Events extends Resource {
  list(params: EventListParams = {}, options?: RequestOptions): PagePromise<Event> {
    return this.core.list('/v1/events', { ...params }, options);
  }

  retrieve(id: string, options?: RequestOptions): Promise<Event> {
    return this.core.request('GET', `/v1/events/${seg(id)}`, options);
  }
}

export class UsageResource extends Resource {
  retrieve(params: UsageParams = {}, options?: RequestOptions): Promise<Usage> {
    return this.core.request('GET', '/v1/usage', { ...options, query: { ...params } });
  }

  /**
   * The inputs the range's jobs read, bucketed by duration, size and kind
   * (`container/codec`), for a duration × size chart.
   */
  inputs(params: InputReportParams = {}, options?: RequestOptions): Promise<InputReport> {
    return this.core.request('GET', '/v1/usage/inputs', { ...options, query: { ...params } });
  }
}

/** Monthly statements: credit added and the usage drawn from it. */
export class Invoices extends Resource {
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Statement> {
    return this.core.list('/v1/billing/invoices', { ...params }, options);
  }
}

export class BillingResource extends Resource {
  readonly invoices = new Invoices(this.core);

  /** The plan, credit balance, spending controls and this month's usage. */
  retrieve(options?: RequestOptions): Promise<Billing> {
    return this.core.request('GET', '/v1/billing', options);
  }

  /**
   * Subscribe to a plan (`{ plan }`) or buy credit (`{ creditCents }`, $10 to
   * $10,000). Redirect the customer to the returned `url` when it is not
   * null; an existing subscription changes plan in place (`changed: true`).
   * Owner only.
   */
  checkout(
    params: CheckoutParams | { creditCents: number },
    options?: RequestOptions,
  ): Promise<Checkout> {
    const body = 'creditCents' in params ? { credit_cents: params.creditCents } : params;
    return this.core.request('POST', '/v1/billing/checkout', { ...options, body });
  }

  /** A link to the payment portal: cards, receipts, cancelling. Owner only. */
  portal(options?: RequestOptions): Promise<Portal> {
    return this.core.request('POST', '/v1/billing/portal', { ...options, body: {} });
  }

  /**
   * Spending controls: a monthly limit and auto-recharge. Every field is
   * optional; `null` clears a limit. Owner only. Returns the billing summary.
   */
  updateSettings(params: BillingSettingsParams, options?: RequestOptions): Promise<Billing> {
    return this.core.request('PUT', '/v1/billing/settings', { ...options, body: params });
  }

  /** The credit ledger, newest first. */
  transactions(params: CreditTransactionListParams = {}, options?: RequestOptions): Promise<ListResponse<CreditTransaction>> {
    return this.core.request('GET', '/v1/billing/transactions', { ...options, query: { ...options?.query, ...params } });
  }

  /**
   * Move an existing subscription to another subscription plan (owner only).
   * A first subscription goes through `checkout`. Returns the billing summary.
   */
  changePlan(plan: PlanId, options?: RequestOptions): Promise<Billing> {
    return this.core.request('PUT', '/v1/billing/plan', { ...options, body: { plan } });
  }
}

export class Plans extends Resource {
  /** Public: every plan, in display order. */
  list(options?: RequestOptions): Promise<ListResponse<Plan>> {
    return this.core.collection('/v1/plans', options);
  }
}

export class CapabilitiesResource extends Resource {
  retrieve(options?: RequestOptions): Promise<Capabilities> {
    return this.core.request('GET', '/v1/capabilities', options);
  }
}

export class StatusResource extends Resource {
  retrieve(options?: RequestOptions): Promise<Status> {
    return this.core.request('GET', '/v1/status', options);
  }
}

export class StatsResource extends Resource {
  /** Public platform-wide counters; cached for about 30 s by the API. */
  get(options?: RequestOptions): Promise<Stats> {
    return this.core.request('GET', '/v1/stats', options);
  }
}
