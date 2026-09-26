import type { Core } from '../core';

export abstract class Resource {
  protected readonly core: Core;

  constructor(core: Core) {
    this.core = core;
  }
}

/** URL-encode one path segment. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
