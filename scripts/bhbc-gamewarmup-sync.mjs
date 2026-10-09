// THE GAME WARM-UP, FROM HIS SHEET (10.10 #647, Ohad: "add a tab under games: game warm-up and
// fill it in from <the sheet> ... make sure it stays constantly synced ... so i can read it on the
// games instead of using the google sheets").
//
// Reads the sheet's 'Warm-Up' tab (gid 1434128464) through the signed-in debug Chrome: the
// profile downloads the CSV over CDP (an in-page fetch is refused by docs.google.com, and Node
// cannot borrow the profile's cookies - the route scripts/sync-revenue-sheet.mjs proved). Parses
// it into sections and drills, and writes store key 'expo-bhbc-gamewarmup' ONLY when the
// content changed (compare-and-swap on updated_at, read back). The daemon runs it every 20 min.
//
//   node scripts/bhbc-gamewarmup-sync.mjs           # dry run: what it read, what would change
//   node scripts/bhbc-gamewarmup-sync.mjs --write   # write if changed, read back
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { ownerClient } from './lib/store-client.mjs';

const ID = '1x9EkbQGc-BZIZ1GBVoCOwqM93RMFhKYKlcHm_eygZok';
const GID = '1434128464';
const KEY = 'expo-bhbc-gamewarmup';
const WRITE = process.argv.includes('--write');
const OUT = path.join(os.homedir(), 'expo-private-backups', 'sheets-647');

// ONLY OUR OWN DOWNLOAD (1010c review): the download folder is browser-wide and the owed sync
// downloads through the same Chrome - 'the first new file' could be HIS roster xlsx, read as CSV
// into the coaches' warm-up. Chrome names the file by the download's guid: wait for OUR guid to
// report 'completed' and read exactly that file.
async function fetchCsv() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.connect({ browserURL: process.env.CDP || 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 120000 });
  const page = await browser.newPage();
  try {
    const client = await page.target().createCDPSession();
    await client.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: OUT, eventsEnabled: true });
    const url = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=${GID}`;
    let guid = null, done = false;
    client.on('Browser.downloadWillBegin', (e) => { if (!guid && String(e.url || '').includes(`gid=${GID}`) && String(e.url || '').includes(ID)) guid = e.guid; });
    client.on('Browser.downloadProgress', (e) => { if (guid && e.guid === guid && e.state === 'completed') done = true; });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 60 && !done; i++) await new Promise((r) => setTimeout(r, 500));
    if (!guid || !done) throw new Error('our export never completed - is the debug Chrome signed into his Google account?');
    const p = path.join(OUT, guid);
    const buf = fs.readFileSync(p);
    fs.renameSync(p, path.join(OUT, `gamewarmup-${GID}.csv`));
    // a CSV, not a zip (xlsx starts 'PK') or binary
    if (buf.length < 20 || (buf[0] === 0x50 && buf[1] === 0x4b) || buf.includes(0)) throw new Error('the download is not the sheet CSV - refusing');
    return buf.toString('utf8');
  } finally {
    await page.close().catch(() => {});
    browser.disconnect();
  }
}

const splitCsv = (text) => {
  // RFC-4180: quoted fields may hold commas, quotes ("") and newlines
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
};
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// the store is jsonb: it hands keys back in ITS order, so compare with sorted keys, never raw strings
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));

// The tab: a title in A1, then sections (a name alone in column A) and drills (a number in A, the
// drill in B, a cue in D, the volume in E). Column C is empty on his sheet; kept if he fills it.
export function parse(csv) {
  const rows = splitCsv(csv).map((r) => r.map(clean));
  let title = '';
  const sections = [];
  let cur = null;
  for (const r of rows) {
    if (!r.some(Boolean)) continue;
    const [a, b, c, d, e] = r;
    if (!title && a && !b && !d && !e) { title = a; continue; }
    if (/^\d+$/.test(a) && b) {
      if (!cur) { cur = { name: '', drills: [] }; sections.push(cur); }
      cur.drills.push({ n: Number(a), name: b, ...(c ? { note: c } : {}), cue: d || '', dose: e || '' });
      continue;
    }
    if (a && !b && !d && !e) { cur = { name: a, drills: [] }; sections.push(cur); continue; }
    // anything else is kept, never dropped silently
    if (!cur) { cur = { name: '', drills: [] }; sections.push(cur); }
    cur.drills.push({ n: null, name: [a, b].filter(Boolean).join(' · '), cue: d || c || '', dose: e || '' });
  }
  return { title: title || 'Warm-Up', sections: sections.filter((s) => s.drills.length) };
}

const csv = await fetchCsv();
const parsed = parse(csv);
const drills = parsed.sections.reduce((n, s) => n + s.drills.length, 0);
console.log(`read: "${parsed.title}", ${parsed.sections.length} section(s), ${drills} drill(s)`);
for (const s of parsed.sections) console.log(`  ${s.name || '(no section)'}: ${s.drills.map((x) => x.n ?? '-').join(' ')}`);
// it must look like HIS warm-up tab: the 'Warm-Up' title and numbered drills, or nothing is written
const numbered = parsed.sections.reduce((n, x) => n + x.drills.filter((d) => d.n != null).length, 0);
if (!drills || !/warm/i.test(parsed.title) || numbered < drills * 0.8) { console.log('not the warm-up tab (title or numbering) - refusing to write'); process.exit(1); }

const s = await ownerClient();
try {
  const { data: cur, error } = await s.from('store').select('value, updated_at').eq('key', KEY).maybeSingle();
  if (error) throw error;
  const prevBody = cur && cur.value ? canon({ title: cur.value.title, sections: cur.value.sections }) : null;
  const nextBody = canon(parsed);
  if (prevBody === nextBody) { console.log('unchanged - nothing to write'); process.exit(0); }
  console.log(cur ? 'changed since the last sync' : 'first sync');
  if (!WRITE) { console.log('DRY RUN - add --write'); process.exit(0); }
  const value = { ...parsed, source: { sheet: ID, gid: GID }, syncedAt: new Date().toISOString() };
  const now = new Date().toISOString();
  const res = cur
    ? await s.from('store').update({ value, updated_at: now }).eq('key', KEY).eq('updated_at', cur.updated_at).select('updated_at')
    : await s.from('store').insert({ key: KEY, value, updated_at: now }).select('updated_at');
  if (res.error) throw res.error;
  if (!res.data || res.data.length !== 1) throw new Error('compare-and-swap lost - re-run');
  const back = (await s.from('store').select('value').eq('key', KEY).single()).data.value;
  console.log(`written + read back: ${back.sections.reduce((n, x) => n + x.drills.length, 0)} drills, synced ${back.syncedAt}`);
  // every open club zone refetches at once (the zone's broadcast channel)
  try { const ch = s.channel('bhbc-live', { config: { private: true } }); await new Promise((r) => { ch.subscribe((st) => { if (st === 'SUBSCRIBED') r(); }); setTimeout(r, 4000); }); await ch.send({ type: 'broadcast', event: 'change', payload: {} }); await s.removeChannel(ch); } catch { /* the zone's 30s poll picks it up */ }
} finally { await s.auth.signOut({ scope: 'local' }); }
