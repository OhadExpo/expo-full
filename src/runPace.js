// A RUN's pace from a logged distance (km) and time ('mm:ss' or 'h:mm:ss' or minutes) - '5:12' /km, or '' (#769)
export const runPace = (km, time) => {
  const d = parseFloat(String(km || '').replace(',', '.'));
  const parts = String(time || '').trim().split(':').map((x) => parseFloat(x));
  if (!(d > 0) || !parts.length || parts.some((x) => !Number.isFinite(x))) return '';
  const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60;
  if (!(sec > 0)) return '';
  const p = sec / d, m = Math.floor(p / 60), r = Math.round(p - m * 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`;
};
