// A BLANK CELL NEVER ERASES (5.10 #554 audit): Smart Import used Object.assign to
// update an existing athlete, so every empty column of the sheet wrote '' over the
// athlete's phone / email / notes. Only a field that HAS a value updates.
export function isBlank(v) {
  return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
}

export function mergeFilled(cur, item) {
  for (const [f, v] of Object.entries(item || {})) {
    if (!isBlank(v)) cur[f] = v;
  }
  return cur;
}
