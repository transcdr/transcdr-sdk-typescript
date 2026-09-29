import type { RequestOptions } from '../core';
import { InvalidRequestError, WaitTimeoutError } from '../errors';
import { assertOutput } from '../output';
import type { PagePromise } from '../pagination';
import {
  isTerminalStatus,
  type Delivery,
  type Job,
  type JobDestination,
  type JobCreateParams,
  type JobEvent,
  type JobListParams,
  type JobOutput,
  type ListResponse,
  type SignedUrl,
} from '../types';
import { Resource, seg } from './base';

export interface WaitForOptions {
  /** Poll interval. Default 2000 ms. */
  pollMs?: number;
  /** Give up after this long (throws `WaitTimeoutError`). Default: never. */
  timeoutMs?: number;
  /** Called with every polled job. */
  onProgress?: (job: Job) => void;
  signal?: AbortSignal;
}

export class Jobs extends Resource {
  /**
   * Submit a job. An `Idempotency-Key` is generated automatically (unless you pass one)
   * so a retried request never creates a duplicate job.
   *
   * `maxCostCents` (or `max_cost_cents`) caps what the job may cost: it is
   * refused with `cost_limit_exceeded` rather than run over the cap.
   *
   * Name a `preset` (with optional `output` overrides), or give the whole `output`. A whole spec is checked before
   * it is sent: an incomplete one throws an `InvalidRequestError` whose `errors` lists every missing field.
   */
  async create(params: JobCreateParams & { maxCostCents?: number }, options: RequestOptions = {}): Promise<Job> {
    const { maxCostCents, ...rest } = params;
    if (rest.preset == null) {
      if (rest.output == null) {
        throw new InvalidRequestError('Give a preset, or the whole output spec.', {
          type: 'invalid_request_error',
          code: 'validation_failed',
          param: 'output',
          errors: [{ param: 'output', message: 'Give a preset, or the whole output spec.' }],
        });
      }
      assertOutput(rest.output);
    }
    const body = maxCostCents === undefined ? rest : { ...rest, max_cost_cents: maxCostCents };
    return this.core.create('/v1/jobs', body, options);
  }

  /** One page of jobs (await it), or every job (`.autoPaginate()`). Newest first. */
  list(params: JobListParams = {}, options?: RequestOptions): PagePromise<Job> {
    return this.core.list('/v1/jobs', { ...params }, options);
  }

  /** Every matching job, across every page. */
  listAll(params: JobListParams = {}, max?: number): Promise<Job[]> {
    return this.list(params).toArray(max);
  }

  retrieve(id: string, options?: RequestOptions): Promise<Job> {
    return this.core.request('GET', `/v1/jobs/${seg(id)}`, options);
  }

  /** queued / scheduled / running → canceled. */
  cancel(id: string, options?: RequestOptions): Promise<Job> {
    return this.core.request('POST', `/v1/jobs/${seg(id)}/cancel`, options);
  }

  /** failed / canceled → a new attempt under the same id. */
  retry(id: string, options?: RequestOptions): Promise<Job> {
    return this.core.request('POST', `/v1/jobs/${seg(id)}/retry`, options);
  }

  /** Delete a terminal job and its outputs. */
  async del(id: string, options?: RequestOptions): Promise<void> {
    await this.core.request('DELETE', `/v1/jobs/${seg(id)}`, options);
  }

  /** The job's timeline. */
  events(id: string, options?: RequestOptions): Promise<ListResponse<JobEvent>> {
    return this.core.collection(`/v1/jobs/${seg(id)}/events`, options);
  }

  outputs(id: string, options?: RequestOptions): Promise<ListResponse<JobOutput>> {
    return this.core.collection(`/v1/jobs/${seg(id)}/outputs`, options);
  }

  /** A short-lived signed download URL for one output rendition. */
  outputUrl(id: string, label: string, options?: RequestOptions): Promise<SignedUrl> {
    return this.core.request('GET', `/v1/jobs/${seg(id)}/outputs/${seg(label)}`, {
      ...options,
      query: { ...options?.query, redirect: 'false' },
    });
  }

  /** Deliveries of this job's outputs to connections. */
  deliveries(id: string, options?: RequestOptions): Promise<ListResponse<Delivery>> {
    return this.core.collection(`/v1/jobs/${seg(id)}/deliveries`, options);
  }

  /** Deliver a job's outputs (again, or somewhere new). Waits for the job if it has not completed yet. */
  deliver(id: string, destination: JobDestination, options?: RequestOptions): Promise<Delivery> {
    return this.core.request('POST', `/v1/jobs/${seg(id)}/deliveries`, { ...options, body: destination });
  }

  /** A short-lived signed URL for a file in an HLS package, e.g. `master.m3u8`. */
  fileUrl(id: string, path: string, options?: RequestOptions): Promise<SignedUrl> {
    const encoded = path.split('/').map(seg).join('/');
    return this.core.request('GET', `/v1/jobs/${seg(id)}/files/${encoded}`, {
      ...options,
      query: { ...options?.query, redirect: 'false' },
    });
  }

  /**
   * Poll until the job is `completed`, `failed` or `canceled`, and return it.
   * Does not throw for a failed job; check `job.status`.
   */
  async waitFor(id: string, options: WaitForOptions = {}): Promise<Job> {
    const pollMs = options.pollMs ?? 2_000;
    const deadline = options.timeoutMs != null ? Date.now() + options.timeoutMs : Infinity;
    for (;;) {
      const job = await this.retrieve(id, { signal: options.signal });
      options.onProgress?.(job);
      if (isTerminalStatus(job.status)) return job;
      if (Date.now() + pollMs > deadline) {
        throw new WaitTimeoutError(`Job ${id} was still ${job.status} after ${options.timeoutMs} ms.`, {
          type: 'wait_timeout',
        });
      }
      await delay(pollMs, options.signal);
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
