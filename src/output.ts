// Client-side checking of a complete output spec (v2), mirroring the API's own table of which fields a spec needs:
// every missing field, every field that does not apply, and every exclusive group without exactly one choice, all
// at once and in the API's order and words, as its 422 `errors` would list them. Values against each other (HDR
// needs 10-bit, an `.mp3` holds MP3) and each value's range are left to the API.

import { InvalidRequestError, type FieldError } from './errors';
import type { OutputSpec } from './types';

/** A condition: any one clause holds; a clause holds when each `[path, values]` term does. */
type Condition = [string, string[]][][];

interface Field {
  /** Relative to `output`; `[]` stands for each entry of a list. */
  path: string;
  required: boolean;
  when: Condition;
  /** An object whose own fields are checked: not reported missing itself. */
  object?: boolean;
  group?: string;
}

interface Group {
  name: string;
  parent: string;
  members: string[];
  when: Condition;
}

/** A term's value: the field is present (and not `null`). */
const PRESENT = '*';
/** A term's value: the field is absent (or `null`). */
const ABSENT = '!';

/** Every field, in document order: the table `GET /v1/capabilities` lists as `output.fields`. */
const FIELDS: Field[] = [
  { path: 'kind', required: true, when: [[]] },
  { path: 'container', required: true, when: [[['kind', ['video', 'audio']]]], object: true },
  { path: 'container.format', required: true, when: [[['kind', ['video', 'audio']]]] },
  { path: 'container.segment_seconds', required: true, when: [[['kind', ['video']], ['container.format', ['hls']]]] },
  { path: 'video', required: true, when: [[['kind', ['video']]]], object: true },
  { path: 'video.codec', required: true, when: [[['kind', ['video']]]] },
  { path: 'video.quality', required: false, when: [[['kind', ['video']]]], group: 'video.rate' },
  { path: 'video.crf', required: false, when: [[['kind', ['video']]]], group: 'video.rate' },
  { path: 'video.cbr', required: false, when: [[['kind', ['video']]]], object: true, group: 'video.rate' },
  { path: 'video.cbr.bitrate', required: true, when: [[['kind', ['video']], ['video.cbr', ['*']]]] },
  { path: 'video.cbr.buffer_ms', required: true, when: [[['kind', ['video']], ['video.cbr', ['*']]]] },
  { path: 'video.bit_depth', required: true, when: [[['kind', ['video']]]] },
  { path: 'video.color', required: true, when: [[['kind', ['video']]]] },
  { path: 'video.frame_rate', required: true, when: [[['kind', ['video']]]], object: true },
  { path: 'video.frame_rate.max', required: true, when: [[['kind', ['video']]]] },
  { path: 'video.gop', required: true, when: [[['kind', ['video']]]] },
  { path: 'video.filters', required: true, when: [[['kind', ['video']]]] },
  { path: 'audio', required: true, when: [[['kind', ['video', 'audio']]]], object: true },
  { path: 'audio.handling', required: true, when: [[['kind', ['video', 'audio']]]] },
  { path: 'audio.codec', required: true, when: [[['kind', ['video', 'audio']], ['audio.handling', ['auto', 'encode']]]] },
  { path: 'audio.bitrate', required: true, when: [[['kind', ['video', 'audio']], ['audio.handling', ['auto', 'encode']], ['audio.codec', ['opus', 'mp3', 'aac']]]] },
  { path: 'audio.channels', required: true, when: [[['kind', ['video', 'audio']], ['audio.handling', ['auto', 'encode']]]] },
  { path: 'audio.he_aac', required: true, when: [[['kind', ['video', 'audio']], ['audio.handling', ['auto', 'encode']]]] },
  { path: 'audio.stereo_fallback', required: true, when: [[['kind', ['video']], ['container.format', ['hls']], ['audio.handling', ['auto', 'encode']]]] },
  { path: 'audio.bit_depth', required: true, when: [[['kind', ['video', 'audio']], ['audio.handling', ['auto', 'encode']], ['audio.codec', ['flac', 'alac']]]] },
  { path: 'audio.flac_compression', required: true, when: [[['kind', ['video', 'audio']], ['audio.handling', ['auto', 'encode']], ['audio.codec', ['flac']]]] },
  { path: 'image', required: true, when: [[['kind', ['image']]]], object: true },
  { path: 'image.formats', required: true, when: [[['kind', ['image']]]] },
  { path: 'image.lossless', required: true, when: [[['kind', ['image']], ['image.formats', ['webp']]]] },
  { path: 'image.quality', required: true, when: [[['kind', ['image']], ['image.formats', ['avif', 'jpeg']]], [['kind', ['image']], ['image.formats', ['webp']], ['image.lossless', ['false']]]] },
  { path: 'image.color_profile', required: true, when: [[['kind', ['image']]]] },
  { path: 'image.frames', required: true, when: [[['kind', ['image']]]] },
  { path: 'renditions', required: true, when: [[['kind', ['video', 'image']]]], object: true },
  { path: 'renditions.sizes', required: false, when: [[['kind', ['video', 'image']]]], group: 'renditions' },
  { path: 'renditions.ladder', required: false, when: [[['kind', ['video']]]], object: true, group: 'renditions' },
  { path: 'renditions.source_size', required: false, when: [[['kind', ['video', 'image']]]], object: true, group: 'renditions' },
  { path: 'renditions.sizes[].label', required: true, when: [[['kind', ['video', 'image']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.sizes[].width', required: true, when: [[['kind', ['video', 'image']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.sizes[].height', required: true, when: [[['kind', ['video', 'image']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.sizes[].fit', required: true, when: [[['kind', ['video', 'image']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.sizes[].orientation', required: true, when: [[['kind', ['video', 'image']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.sizes[].upscale', required: true, when: [[['kind', ['video', 'image']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.sizes[].video', required: false, when: [[['kind', ['video']], ['video.cbr', ['*']], ['renditions.sizes', ['*']]]] },
  { path: 'renditions.ladder.max_short_side', required: true, when: [[['kind', ['video']], ['renditions.ladder', ['*']]]] },
  { path: 'renditions.ladder.fit', required: true, when: [[['kind', ['video']], ['renditions.ladder', ['*']]]] },
  { path: 'renditions.ladder.upscale', required: true, when: [[['kind', ['video']], ['renditions.ladder', ['*']]]] },
  { path: 'renditions.source_size.label', required: true, when: [[['kind', ['video', 'image']], ['renditions.source_size', ['*']]]] },
  { path: 'renditions.source_size.fit', required: true, when: [[['kind', ['video', 'image']], ['renditions.source_size', ['*']]]] },
  { path: 'renditions.source_size.upscale', required: true, when: [[['kind', ['video', 'image']], ['renditions.source_size', ['*']]]] },
  { path: 'subtitles', required: true, when: [[['kind', ['video']]]], object: true },
  { path: 'subtitles.tracks', required: false, when: [[['kind', ['video']]]], group: 'subtitles' },
  { path: 'subtitles.languages', required: false, when: [[['kind', ['video']]]], group: 'subtitles' },
  { path: 'trim', required: true, when: [[['kind', ['video']]]], object: true },
  { path: 'trim.start', required: true, when: [[['kind', ['video']]]] },
  { path: 'trim.end', required: true, when: [[['kind', ['video']]]] },
  { path: 'privacy', required: true, when: [[]], object: true },
  { path: 'privacy.preset', required: false, when: [[]] },
  { path: 'privacy.location', required: true, when: [[['privacy.preset', ['!']]]] },
  { path: 'privacy.capture_time', required: true, when: [[['privacy.preset', ['!']]]] },
  { path: 'privacy.device', required: true, when: [[['privacy.preset', ['!']]]] },
  { path: 'privacy.descriptive', required: true, when: [[['privacy.preset', ['!']]]] },
];

/** The exclusive groups. */
const GROUPS: Group[] = [
  { name: 'video.rate', parent: 'video', members: ['video.quality', 'video.crf', 'video.cbr'], when: [[['kind', ['video']]]] },
  { name: 'renditions', parent: 'renditions', members: ['renditions.sizes', 'renditions.ladder', 'renditions.source_size'], when: [[['kind', ['video', 'image']]]] },
  { name: 'subtitles', parent: 'subtitles', members: ['subtitles.tracks', 'subtitles.languages'], when: [[['kind', ['video']]]] },
];

function lookup(document: unknown, path: string): unknown {
  let at: unknown = document;
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object' || Array.isArray(at) || !(key in at)) return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at === null ? undefined : at;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return undefined;
}

function termHolds(document: unknown, path: string, values: string[]): boolean {
  const found = lookup(document, path);
  if (values.length === 1 && values[0] === PRESENT) return found !== undefined;
  if (values.length === 1 && values[0] === ABSENT) return found === undefined;
  if (Array.isArray(found)) {
    return found.some((item) => {
      const t = text(item);
      return t !== undefined && values.includes(t);
    });
  }
  const t = text(found);
  return t !== undefined && values.includes(t);
}

function holds(document: unknown, condition: Condition): boolean {
  return condition.some((clause) => clause.every(([path, values]) => termHolds(document, path, values)));
}

function orList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** A condition in words: `kind is video and container.format is hls`. */
function describe(condition: Condition): string {
  return condition
    .map((clause) =>
      clause
        .map(([path, values]) => {
          if (values.length === 1 && values[0] === PRESENT) return `${path} is given`;
          if (values.length === 1 && values[0] === ABSENT) return `${path} is not given`;
          return `${path} is ${orList(values)}`;
        })
        .join(' and '),
    )
    .join(', or ');
}

/** A field's instances: one for a plain path, one per list entry below a `[]`. */
function instances(document: unknown, path: string): [string, unknown][] {
  const at = path.indexOf('[].');
  if (at < 0) return [[path, lookup(document, path)]];
  const list = path.slice(0, at);
  const rest = path.slice(at + 3);
  const items = lookup(document, list);
  if (!Array.isArray(items)) return [];
  return items.map((item, i): [string, unknown] => [`${list}.${i}.${rest}`, lookup(item, rest)]);
}

function failure(path: string, message: string): FieldError {
  return { param: path ? `output.${path}` : 'output', message };
}

/**
 * Check a complete output spec against the fields its kind, container, codec and handling need. Returns every
 * failure (empty when there are none), each with the `param` and `message` the API's 422 `errors` would give:
 * missing fields, fields that do not apply, and exclusive groups without exactly one choice.
 *
 * For a whole spec only: a preset's overrides are checked by the API once merged over the preset.
 */
export function validateOutput(spec: OutputSpec | unknown): FieldError[] {
  const document: unknown = spec;
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return [failure('', 'output must be an object.')];
  }
  const kind = (document as Record<string, unknown>).kind;
  if (kind === undefined || kind === null) {
    return [failure('kind', 'output.kind is required: video, audio or image.')];
  }
  if (kind !== 'video' && kind !== 'audio' && kind !== 'image') {
    return [failure('kind', 'output.kind must be video, audio or image.')];
  }

  const errors: FieldError[] = [];
  // Privacy absent altogether is one failure, not five.
  const privacyMissing = lookup(document, 'privacy') === undefined;
  if (privacyMissing) {
    errors.push(
      failure(
        'privacy',
        'output.privacy is required: give privacy.preset (strip_all, strip_location or keep_all), or all of location, capture_time, device and descriptive.',
      ),
    );
  }

  // A field that does not apply is reported once, not with each of its own.
  const refused: string[] = [];
  for (const field of FIELDS) {
    if (privacyMissing && field.path.startsWith('privacy')) continue;
    const applies = holds(document, field.when);
    for (const [path, value] of instances(document, field.path)) {
      if (refused.some((r) => path.startsWith(`${r}.`))) continue;
      if (value === undefined) {
        if (applies && field.required && !field.object) {
          errors.push(failure(path, `output.${path} is required when ${describe(field.when)}.`));
        }
      } else if (!applies) {
        refused.push(path);
        errors.push(
          failure(
            path,
            `output.${path} does not apply here: it applies when ${describe(field.when)}. Remove it (or set it to null).`,
          ),
        );
      }
    }
  }

  for (const group of GROUPS) {
    if (!holds(document, group.when)) continue;
    const given = group.members.filter((m) => lookup(document, m) !== undefined);
    const names = group.members.map((m) => m.slice(m.lastIndexOf('.') + 1));
    if (given.length === 0) {
      errors.push(failure(group.parent, `output.${group.parent} needs one of ${orList(names)}.`));
    } else if (given.length > 1) {
      errors.push(
        failure(given[1], `output.${group.parent} takes one of ${orList(names)}, not ${given.join(' and ')}.`),
      );
    }
  }
  return errors;
}

/**
 * Throw an `InvalidRequestError` (code `validation_failed`, `errors` listing every failure) when a whole spec is
 * incomplete, as the API's 422 would, without sending it.
 */
export function assertOutput(spec: OutputSpec | unknown): void {
  const errors = validateOutput(spec);
  if (errors.length === 0) return;
  throw new InvalidRequestError(errors[0].message, {
    type: 'invalid_request_error',
    code: 'validation_failed',
    param: errors[0].param,
    errors,
  });
}
