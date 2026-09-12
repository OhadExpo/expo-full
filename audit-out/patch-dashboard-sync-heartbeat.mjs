// E7 "make sure it keeps getting updated forever": the card said "synced twice
// a day" whether or not the clock had run. Now it shows WHEN the sheet was last
// read (max imported_at, re-stamped by every sync) and goes red past 30h.
import fs from 'node:fs';
const f = 'src/DashboardView.jsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (from, to, label) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error(label + ' ×' + n); s = s.replace(from, to); console.log('ok', label); };
rep("supabase.from('revenue_month_total').select('month,channel,amount')", "supabase.from('revenue_month_total').select('month,channel,amount,imported_at')", 'select imported_at');
rep("    const latest = [...byMonth.keys()].sort().pop();\n    return { thisMonth: byMonth.get(key(now)) || 0, last3: bars.slice(3).reduce((a, b) => a + b.value, 0), bars, latest, months: byMonth.size };",
    "    const latest = [...byMonth.keys()].sort().pop();\n    // The newest imported_at is the clock's last successful run - the sync\n    // re-stamps every month row, so one stale row cannot hide a dead clock.\n    const syncedAt = sheetMonths.reduce((m, r) => (r.imported_at && (!m || r.imported_at > m) ? r.imported_at : m), null);\n    const syncAgeH = syncedAt ? (now - new Date(syncedAt)) / 3600000 : null;\n    return { thisMonth: byMonth.get(key(now)) || 0, last3: bars.slice(3).reduce((a, b) => a + b.value, 0), bars, latest, months: byMonth.size, syncedAt, syncAgeH };", 'memo syncedAt');
rep("{sheet && <span style={subStyle}>{tt('Synced from the sheet twice a day')}</span>}",
    "{sheet && <span style={{ ...subStyle, color: sheet.syncAgeH != null && sheet.syncAgeH > 30 ? C.rd : subStyle.color }}>{sheet.syncAgeH == null ? tt('Synced from the sheet twice a day') : sheet.syncAgeH > 30 ? `${tt('Sheet sync overdue')} · ${Math.round(sheet.syncAgeH / 24)} ${tt('days')}` : sheet.syncAgeH < 1 ? tt('Synced from the sheet just now') : tt('Synced from the sheet {n}h ago').replace('{n}', Math.round(sheet.syncAgeH))}</span>}", 'sub-line');
fs.writeFileSync(f, s);
