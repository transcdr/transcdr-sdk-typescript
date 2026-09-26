// Webhook signatures: `Transcdr-Signature: t=<unix>,v1=<hex hmac_sha256(secret, "<t>.<raw body>")>`.
// Implemented on Web Crypto so it runs unchanged in browsers, Node 18+,
// Deno, Bun and edge runtimes.

import { TranscdrError } from './errors';
import type { Event } from './types';

export const SIGNATURE_HEADER = 'Transcdr-Signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

async function subtle(): Promise<SubtleCrypto> {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.subtle) return globalCrypto.subtle;
  // Node 18 only exposes Web Crypto on the `crypto` module. The specifier is
  // a variable so browser bundlers leave it alone.
  const specifier = 'node:crypto';
  const mod = (await import(/* @vite-ignore */ specifier)) as { webcrypto: Crypto };
  return mod.webcrypto.subtle;
}

function toBytes(payload: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof payload === 'string') return encoder.encode(payload);
  if (payload instanceof Uint8Array) return payload;
  return new Uint8Array(payload);
}

function toHex(buffer: ArrayBuffer): string {
  let hex = '';
  for (const byte of new Uint8Array(buffer)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Constant-time comparison of two equal-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 of `"<timestamp>.<body>"` under `secret`, as lowercase hex. */
export async function computeSignature(
  payload: string | Uint8Array | ArrayBuffer,
  secret: string,
  timestamp: number,
): Promise<string> {
  const crypto = await subtle();
  const key = await crypto.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const body = toBytes(payload);
  const prefix = encoder.encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);
  return toHex(await crypto.sign('HMAC', key, message));
}

/** Build a `Transcdr-Signature` header value — handy for testing your receiver. */
export async function signPayload(
  payload: string | Uint8Array | ArrayBuffer,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return `t=${timestamp},v1=${await computeSignature(payload, secret, timestamp)}`;
}

/** Parse `t=…,v1=…[,v1=…]`. */
export function parseSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't' && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === 'v1') signatures.push(value.toLowerCase());
  }
  return { timestamp, signatures };
}

export interface VerifyOptions {
  /** Seconds either side of now a timestamp may be. Default 300. */
  toleranceSec?: number;
  /** Override "now" (unix seconds), for tests. */
  now?: number;
}

/**
 * Whether `header` is a valid signature of the raw request body `payload`
 * under `secret`. Pass the body exactly as received — before any JSON parsing.
 */
export async function verifySignature(
  payload: string | Uint8Array | ArrayBuffer,
  header: string | null | undefined,
  secret: string,
  toleranceSec: number | VerifyOptions = DEFAULT_TOLERANCE_SECONDS,
): Promise<boolean> {
  if (!header || !secret) return false;
  const options = typeof toleranceSec === 'number' ? { toleranceSec } : toleranceSec;
  const tolerance = options.toleranceSec ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ?? Math.floor(Date.now() / 1000);

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const expected = await computeSignature(payload, secret, timestamp);
  return signatures.some((signature) => safeEqual(signature, expected));
}

/** Verify, then parse the body into an `Event`. Throws if the signature is bad. */
export async function constructEvent<T = Event>(
  payload: string | Uint8Array | ArrayBuffer,
  header: string | null | undefined,
  secret: string,
  toleranceSec: number | VerifyOptions = DEFAULT_TOLERANCE_SECONDS,
): Promise<T> {
  if (!(await verifySignature(payload, header, secret, toleranceSec))) {
    throw new TranscdrError('Webhook signature verification failed.', {
      type: 'invalid_request_error',
      code: 'invalid_signature',
    });
  }
  const text = typeof payload === 'string' ? payload : new TextDecoder().decode(toBytes(payload));
  return JSON.parse(text) as T;
}
