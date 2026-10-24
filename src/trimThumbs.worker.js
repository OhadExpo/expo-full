// THE FILMSTRIP, OFF THE MAIN THREAD (#985): the trim sheet's thumbnails decoded here so a finger on a handle never waits
// for them. Measured on a 4K clip: decoding the strip on the main thread stalled it 11 times for ~115 ms while the sheet
// was open. Mediabunny (WebCodecs) decodes only the keyframe nearest each thumbnail, straight to thumbnail size with the
// rotation applied; each one goes back as a small JPEG as soon as it exists. Any failure says so and the sheet falls
// back to its <video> filmstrip.
// THEN THE SCRUB FRAMES (#1025, Ohad: "Scrolling through the video should be way smoother"): a seek per finger move
// cost 50-110 ms on a phone clip (one picture every ~5 moves on 4K), so the picture lagged the finger. After the strip,
// the whole clip is decoded once at small size (up to 30 a second, at most 360) - Google Photos' trick: the finger is
// shown these at once, and the full frame only where it lets go.
//   in:  { file, dur, width, stripH, dpr, long }
//   out: { n } once, { i, blob } per thumbnail, { done } | { error }; then { pn } once, { pi, blob } per frame, { pdone }
self.onmessage = async (e) => {
  const { file, dur, width, stripH, dpr, long } = e.data;
  let track = null, mb = null, aspect = 9 / 16;
  try {
    if (typeof self.VideoDecoder !== 'function' || typeof self.OffscreenCanvas !== 'function') throw new Error('no WebCodecs');
    mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('cannot decode');
    aspect = (track.displayWidth || 9) / (track.displayHeight || 16);
    const tw = Math.max(24, Math.round(stripH * aspect));
    const n = Math.max(4, Math.ceil(width / tw));
    self.postMessage({ n });
    const want = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * dur);
    const pk = new mb.EncodedPacketSink(track);
    const keys = [];
    for (const t of want) { const kp = await pk.getKeyPacket(t, { metadataOnly: true }); keys.push(kp ? kp.timestamp : t); }
    const times = new Set(keys).size >= Math.ceil(n * 0.6) ? keys : want;   // too few keyframes: the exact times, one forward pass
    const sink = new mb.CanvasSink(track, { width: Math.round(tw * dpr), height: Math.round(stripH * dpr), fit: 'cover', poolSize: 2 });
    let i = 0, got = 0;
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (wc) { const blob = await wc.canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 }); self.postMessage({ i, blob }); got++; }
      i++;
    }
    if (got < Math.ceil(n / 2)) { self.postMessage({ error: 'too few frames' }); return; }
    self.postMessage({ done: true });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err).slice(0, 120) });
    return;
  }
  if (!(long > 0)) return;
  try {
    const L = Math.round(long);
    const pw = aspect >= 1 ? L : Math.round(L * aspect), ph = aspect >= 1 ? Math.round(L / aspect) : L;
    const pn = Math.max(2, Math.min(360, Math.ceil(dur * 30)));
    self.postMessage({ pn });
    const pt = Array.from({ length: pn }, (_, i) => (i / pn) * dur);   // frame i stands for [i, i + 1) / pn of the clip
    const ps = new mb.CanvasSink(track, { width: pw, height: ph, fit: 'cover', poolSize: 2 });
    let j = 0;
    for await (const wc of ps.canvasesAtTimestamps(pt)) {
      if (wc) self.postMessage({ pi: j, blob: await wc.canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }) });
      j++;
    }
    self.postMessage({ pdone: true });
  } catch (err) {
    self.postMessage({ perror: String((err && err.message) || err).slice(0, 120) });   // the sheet keeps seeking the video
  }
};
