// THE FILMSTRIP, OFF THE MAIN THREAD (#985): the trim sheet's thumbnails decoded here so a finger on a handle never waits
// for them. Measured on a 4K clip: decoding the strip on the main thread stalled it 11 times for ~115 ms while the sheet
// was open. Mediabunny (WebCodecs) decodes only the keyframe nearest each thumbnail, straight to thumbnail size with the
// rotation applied; each one goes back as a small JPEG as soon as it exists. Any failure says so and the sheet falls
// back to its <video> filmstrip.
//   in:  { file, dur, width, stripH, dpr }     out: { n } once, { i, blob } per thumbnail, { done } | { error }
self.onmessage = async (e) => {
  const { file, dur, width, stripH, dpr } = e.data;
  try {
    if (typeof self.VideoDecoder !== 'function' || typeof self.OffscreenCanvas !== 'function') throw new Error('no WebCodecs');
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('cannot decode');
    const aspect = (track.displayWidth || 9) / (track.displayHeight || 16);
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
    self.postMessage(got >= Math.ceil(n / 2) ? { done: true } : { error: 'too few frames' });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err).slice(0, 120) });
  }
};
