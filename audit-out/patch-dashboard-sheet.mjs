const rep = (src, from, to, n = 1) => { const c = src.split(from).length - 1; if (c !== n) throw new Error(`expected ${n} match(es), got ${c}: ${from.slice(0, 70)}`); return src.split(from).join(to); };
export default (src0) => {
  const crlf = src0.includes(String.fromCharCode(13,10));
  let s = crlf ? src0.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)) : src0;
  // Ohad 2026-09-12: "the dashboard is supposed to autonomously draw twice a
  // day an update from [the roster sheet]" … then, after the sync ran twice:
  // "nothing was updated". The REVENUE card only ever read payments marked
  // collected in the app; the sheet sync writes revenue_month_total, which
  // the billing page shows and the dashboard ignored. The card now reads the
  // sheet's monthly coaching totals (the only real "collected" amounts, per
  // the data rules) for this month, the last three months and the six-month
  // bars, and says so. MRR, outstanding, LTV and ticket stay app-derived.
  s = rep(s, `  const ms30 = 30 * 86400000;
  const ms90 = 90 * 86400000;`, `  const [sheetMonths, setSheetMonths] = useState(null);
  useEffect(() => {
    if (!isOwner) return undefined;
    let live = true;
    supabase.from('revenue_month_total').select('month,channel,amount')
      .then(({ data, error }) => { if (live && !error) setSheetMonths(data || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [isOwner]);
  const sheet = useMemo(() => {
    if (!sheetMonths || !sheetMonths.length) return null;
    const NOT_COACHING = new Set(['national_insurance']);
    const byMonth = new Map();
    for (const r of sheetMonths) {
      if (NOT_COACHING.has(r.channel)) continue;
      const k = String(r.month).slice(0, 7);
      byMonth.set(k, (byMonth.get(k) || 0) + (Number(r.amount) || 0));
    }
    const key = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}\`;
    const bars = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      bars.push({ label: d.toLocaleString('en-US', { month: 'short' }), value: byMonth.get(key(d)) || 0 });
    }
    const latest = [...byMonth.keys()].sort().pop();
    return { thisMonth: byMonth.get(key(now)) || 0, last3: bars.slice(3).reduce((a, b) => a + b.value, 0), bars, latest, months: byMonth.size };
  // \`now\` is a per-render Date; the sheet rows are the only real dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMonths]);
  const ms30 = 30 * 86400000;
  const ms90 = 90 * 86400000;`);
  s = rep(s, `        monthBars={monthBars}
        maxBar={maxBar}
      />}`, `        monthBars={monthBars}
        maxBar={maxBar}
        sheet={sheet}
      />}`);
  s = rep(s, `function RevenueCard({ paymentsUnknown = false, monthlyRate, thisMonthPaid, delta30, collected30, collected90, avgLtv, avgTicket, outstanding, monthBars, maxBar }) {`,
    `function RevenueCard({ paymentsUnknown = false, monthlyRate, thisMonthPaid, delta30, collected30, collected90, avgLtv, avgTicket, outstanding, monthBars, maxBar, sheet = null }) {
  const bars = sheet ? sheet.bars : monthBars;
  const barMax = sheet ? Math.max(1, ...sheet.bars.map(b => b.value)) : maxBar;`);
  s = rep(s, `            <span style={labelStyle}>{tt('30D COLLECTED')}</span>
            <span style={numStyle}>{paymentsUnknown ? '—' : \`₪\${Math.round(collected30).toLocaleString()}\`}</span>
            {delta30 !== null && (`, `            <span style={labelStyle}>{tt(sheet ? 'THIS MONTH · SHEET' : '30D COLLECTED')}</span>
            <span style={numStyle}>{sheet ? \`₪\${Math.round(sheet.thisMonth).toLocaleString()}\` : paymentsUnknown ? '—' : \`₪\${Math.round(collected30).toLocaleString()}\`}</span>
            {sheet && <span style={subStyle}>{tt('Synced from the sheet twice a day')}</span>}
            {!sheet && delta30 !== null && (`);
  s = rep(s, `            <span style={labelStyle}>{tt('90D COLLECTED')}</span>
            <span style={numStyle}>{paymentsUnknown ? '—' : \`₪\${Math.round(collected90).toLocaleString()}\`}</span>
            <span style={subStyle}>{tt('Trailing 3 months')}</span>`, `            <span style={labelStyle}>{tt(sheet ? 'LAST 3 MONTHS · SHEET' : '90D COLLECTED')}</span>
            <span style={numStyle}>{sheet ? \`₪\${Math.round(sheet.last3).toLocaleString()}\` : paymentsUnknown ? '—' : \`₪\${Math.round(collected90).toLocaleString()}\`}</span>
            <span style={subStyle}>{sheet ? tt('From the sheets') : tt('Trailing 3 months')}</span>`);
  s = rep(s, `          <div style={{ ...labelStyle, marginBottom: 8 }}>{tt("LAST 6 MONTHS · COLLECTED")}</div>`, `          <div style={{ ...labelStyle, marginBottom: 8 }}>{tt(sheet ? 'LAST 6 MONTHS · COLLECTED · SHEET' : 'LAST 6 MONTHS · COLLECTED')}</div>`);
  s = rep(s, `          {monthBars.every((b) => !(b.value > 0)) ? (`, `          {bars.every((b) => !(b.value > 0)) ? (`);
  s = rep(s, `            {monthBars.map((b, i) => (`, `            {bars.map((b, i) => (`);
  s = rep(s, `                    height: \`\${Math.max(2, Math.round((b.value / maxBar) * 100))}%\`,`, `                    height: \`\${Math.max(2, Math.round((b.value / barMax) * 100))}%\`,`);
  return crlf ? s.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : s;
};
