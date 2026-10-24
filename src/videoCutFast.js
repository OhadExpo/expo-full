// THE FAST CUT (#970 v2, Ohad 24.10: "Build the smartest possible trimmer you can ... Research more online"). The first
// trimmer re-encodes through canvas + MediaRecorder at playback speed: a 60 s cut takes 60 s and the sound is dropped.
// WebCodecs (here through Mediabunny, MPL-2.0, loaded only when a clip is cut) decodes and encodes on the phone's
// hardware, faster than real time, and keeps the sound wherever the browser can encode it (research, 24.10:
// queue/plans/trim-970-research.md). Any failure throws, and the caller falls back to the real-time encoder - an
// athlete never loses a clip to the fast path.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const fastCutAvailable = () => typeof window !== 'undefined' && typeof window.VideoEncoder === 'function' && typeof window.VideoDecoder === 'function';

// file -> { blob, ext, originalSize, compressedSize, fast: true }. start / end in seconds (end null = the end).
export async function fastCut(file, { start = 0, end = null, maxWidth = 1280, targetMb = 40 } = {}, onProgress = null, signal = null) {
  if (!fastCutAvailable()) throw new Error('fast cut: no WebCodecs');
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw new Error('fast cut: no video track');
  const dur = await input.computeDuration();
  const t0 = clamp(Number(start) || 0, 0, dur);
  const t1 = end != null && Number(end) > t0 ? Math.min(dur, Number(end)) : dur;
  const span = Math.max(0.5, t1 - t0);
  // the same budget as the real-time encoder: under the 50 MB storage cap, 0.4 - 3 Mbps for the picture
  const videoBitrate = clamp(Math.floor((targetMb * 8 * 1024 * 1024) / span) - 96000, 400000, 3000000);
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  const conv = await mb.Conversion.init({
    input, output,
    trim: { start: t0, end: t1 },
    video: { codec: 'avc', bitrate: videoBitrate, forceTranscode: true, ...(video.displayWidth > maxWidth ? { width: maxWidth } : {}) },
    audio: { codec: 'aac', bitrate: 96000 },        // a browser that cannot encode AAC drops the sound - the picture still goes
    showWarnings: false,
  });
  if (!conv.isValid || conv.discardedTracks.some((d) => d.track.isVideoTrack())) throw new Error(`fast cut: cannot convert (${conv.discardedTracks.map((d) => d.reason).join(', ')})`);
  if (onProgress) conv.onProgress = (p) => onProgress(Math.min(99, Math.round(p * 100)));
  let aborted = false;
  if (signal) { if (signal.aborted) throw new Error('aborted'); signal.addEventListener('abort', () => { aborted = true; conv.cancel().catch(() => {}); }, { once: true }); }
  await conv.execute();
  if (aborted) throw new Error('aborted');
  const blob = new Blob([output.target.buffer], { type: 'video/mp4' });
  if (blob.size < 1024) throw new Error('fast cut: empty output');
  if (onProgress) onProgress(100);
  // the clip has sound only if the source had an audio track AND it was not dropped (#985: a silent-source clip read true)
  const hadAudio = !!(await input.getPrimaryAudioTrack().catch(() => null));
  return { blob, ext: '.mp4', originalSize: file.size, compressedSize: blob.size, fast: true, audio: hadAudio && !conv.discardedTracks.some((d) => d.track.isAudioTrack && d.track.isAudioTrack()) };
}
