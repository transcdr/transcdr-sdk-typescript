# Changelog

## 1.0.0

Output spec v2. This is a breaking release: the output spec is declared in sections, and nothing has a default.

### Added

- `OutputSpec` is `VideoOutput | AudioOutput | ImageOutput`, discriminated on `kind`, with a type for each section
  (`VideoContainer`, `Video`, `Audio`, `ImageSpec`, `VideoRenditions`, `ImageRenditions`, `Subtitles`, `Trim`,
  `Privacy`). Every field a kind always needs is required; each exclusive choice (`quality` / `crf` / `cbr`,
  `sizes` / `ladder` / `source_size`, `tracks` / `languages`, a privacy preset or its four categories, the forms of
  `gop` and `image.frames`) is a union.
- `validateOutput(spec)`: the API's table of required fields, run locally. It returns every missing field, every
  field given where it does not apply, and every group without exactly one choice, with the API's `param` and
  `message`. `jobs.create`, `presets.create` and `presets.replace` run it on a whole spec and throw an
  `InvalidRequestError` (code `validation_failed`) before sending anything. `assertOutput(spec)` throws the same.
- `OutputOverrides`: the partial sent with a preset (any field optional, `null` removes one).
- `TranscdrError.errors`: every failure of a 422, `{ param, message }`, in order (empty for other errors).
- `Job.preset`: `{ id, version, overrides }`, the preset version and overrides a job's spec was resolved from.
- `Preset.version`, `presets.versions(id)` and `presets.getVersion(id, n)`. `preset` accepts `slug@N`.
- `Automation.resolved_output`: the spec an automation's preset and overrides resolve to now.
- `Capabilities.output` (`OutputCapabilities`): the spec's fields, when each is required, and what each takes.
- `KINDS`, `AUDIO_CODECS`.

### Changed

- `jobs.create` takes a `preset` (with optional `output` overrides) or a whole `output`; neither is refused.
- `presets.create` and `presets.replace` take a complete `OutputSpec`; `presets.update` takes `OutputOverrides`.
- Error params name v2 paths (`output.video.codec`, `output.renditions.sizes.0.width`).
- `FlacCompression` `'default'` is `'balanced'`.
- `AudioContainer` is `{ format }`; `Ladder` needs `fit` and `upscale`; `ImageSpec.quality` is one entry per lossy
  format; `ImageFrames` is `'poster'`, `{ count }` or `{ at_seconds }`; `Audio` is a track or `{ handling: 'drop' }`.

### Removed

- `OutputSpecInput`, `Rendition` (now `Size`), `Quality`, `QualityTarget`, `Mode`, `AudioMode`, `BitDepth` (now
  `VideoBitDepth`) and `ImageSpec.keep_color_profile` (now `color_profile`).

### Migrating from v1

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
