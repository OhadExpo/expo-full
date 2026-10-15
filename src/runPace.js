// A logged run time ('mm:ss' or 'h:mm:ss' or minutes) in seconds, 0 when it does not read (#769; shared with #799)
export const runSeconds = (time) => {
  const parts = String(time || '').trim().split(':').map((x) => parseFloat(x));
  if (!parts.length || parts.some((x) => !Number.isFinite(x))) return 0;
  const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60;
  return sec > 0 ? sec : 0;
};
// seconds per km as 'm:ss'
export const fmtPaceSec = (p) => {
  if (!(p > 0)) return '';
  const m = Math.floor(p / 60), r = Math.round(p - m * 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`;
};
// A RUN's pace from a logged distance (km) and time - '5:12' /km, or '' (#769)
export const runPace = (km, time) => {
  const d = parseFloat(String(km || '').replace(',', '.'));
  const sec = runSeconds(time);
  if (!(d > 0) || !sec) return '';
  return fmtPaceSec(sec / d);
};
