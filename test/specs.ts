import type { AudioOutput, ImageOutput, OutputSpec, VideoOutput } from '../src';

/** An ABR HLS package of explicit sizes, H.264 at a constant bit rate. */
export const hlsCbr: VideoOutput = {
  kind: 'video',
  container: { format: 'hls', segment_seconds: 6 },
  video: {
    codec: 'h264',
    cbr: { bitrate: 'standard', buffer_ms: 1000 },
    bit_depth: '8bit',
    color: 'sdr',
    frame_rate: { max: 'source' },
    gop: 'segment',
    filters: [],
  },
  audio: { handling: 'encode', codec: 'aac', bitrate: 'standard', channels: 'source', he_aac: 'auto', stereo_fallback: false },
  renditions: {
    sizes: [
      { label: 'by_size', width: 1920, height: 1080, fit: 'contain', orientation: 'auto', upscale: false, video: { cbr: { bitrate: '5M' } } },
      { label: 'by_size', width: 1280, height: 720, fit: 'contain', orientation: 'auto', upscale: false, video: { cbr: { bitrate: '3M' } } },
    ],
  },
  subtitles: { tracks: 'all' },
  trim: { start: 0, end: 'source' },
  privacy: { preset: 'strip_all' },
};

/** One vertical MP4. */
export const singleMp4: VideoOutput = {
  kind: 'video',
  container: { format: 'mp4' },
  video: {
    codec: 'h264',
    quality: 'high',
    bit_depth: 'from_color',
    color: 'sdr',
    frame_rate: { max: 30 },
    gop: { seconds: 2 },
    filters: [],
  },
  audio: { handling: 'encode', codec: 'aac', bitrate: 'standard', channels: 'source', he_aac: 'auto' },
  renditions: {
    sizes: [{ label: 'by_size', width: 1080, height: 1920, fit: 'cover', orientation: 'fixed', upscale: false }],
  },
  subtitles: { tracks: 'all' },
  trim: { start: 0, end: 'source' },
  privacy: { preset: 'strip_all' },
};

/** A mono MP3. */
export const audioMp3: AudioOutput = {
  kind: 'audio',
  container: { format: 'mp3' },
  audio: { handling: 'encode', codec: 'mp3', bitrate: '64k', channels: 'mono', he_aac: 'auto' },
  privacy: { preset: 'strip_all' },
};

/** Twelve JPEG stills of a video. */
export const stills: ImageOutput = {
  kind: 'image',
  image: { formats: ['jpeg'], quality: { jpeg: 80 }, color_profile: 'srgb', frames: { count: 12 } },
  renditions: {
    sizes: [{ label: 'sheet', width: 320, height: 320, fit: 'contain', orientation: 'auto', upscale: false }],
  },
  privacy: { preset: 'strip_all' },
};

export const examples: Record<string, OutputSpec> = { hlsCbr, singleMp4, audioMp3, stills };
