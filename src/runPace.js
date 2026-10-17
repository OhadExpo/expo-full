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
// A logged distance in km: a number over 60 is metres (#866 M2: '400' typed under KM for a 400 m rep read 400 km)
export const runKm = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); if (!(n > 0)) return null; return n > 60 ? n / 1000 : n; };
// A logged time for a known distance: a bare number ('45') is minutes or seconds - whichever gives a pace a runner can
// run (2:30-15:00 /km); minutes when both do (#866 M3: '45' for a 200 m rep read 45 minutes = 225:00 /km)
export const runSecondsFor = (time, km) => {
  const t = String(time || '').trim();
  if (!/^\d+(\.\d+)?$/.test(t) || !(km > 0)) return runSeconds(time);
  const n = parseFloat(t); const ok = (sec) => sec / km >= 150 && sec / km <= 900;
  if (ok(n * 60)) return n * 60;
  if (ok(n)) return n;
  return n * 60;
};
// A RUN's pace from a logged distance (km) and time - '5:12' /km, or '' (#769)
// THE HEART-RATE CAP AS A NUMBER (#866): the coach's cell may say 150, HR 150, 'דופק עד 150', '≤150' - the screens add
// their own words ('HR up to {n}' / 'דופק עד {n}'), so his are taken off ('דופק עד דופק עד 150' before)
// whole words only ('דופק מקסימלי 150' must not lose half a word), as many as lead it ('HR cap: up to 150'), and the
// signs between them; a trailing 'max' too
const HR_WORD = /^(?:hr|heart[\s-]?rate|דופק|cap|max(?:imum)?|up[\s-]*to|עד|מקס(?:ימום|ימלי|ימאלי)?['׳]?)(?=[\s:≤<=.\-–\d]|$)/i;
export const hrCap = (v) => {
  let s = String(v == null ? '' : v).trim(), prev;
  do { prev = s; s = s.replace(HR_WORD, '').replace(/^[\s:≤<=.\-–]+/, ''); } while (s !== prev && s);
  return s.replace(/\s+(?:max|cap|מקס['׳]?)$/i, '').trim();
};
export const runPace = (km, time) => {
  const d = runKm(km);
  const sec = runSecondsFor(time, d);
  if (!(d > 0) || !sec) return '';
  return fmtPaceSec(sec / d);
};
