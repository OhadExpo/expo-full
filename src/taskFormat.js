// Shared parsers for the body-encoded task wire format + tag classification.
// The v8 task body encodes owner + priority + due INLINE in the string:
//   `Owner: [URGENT] actual title · due 2026-06-01 14:30`
// and the Google-Calendar sync + dual-approval bookkeeping live as MACHINE
// tags (gevent:/glink:/getag:/approved:) that must never render as user chips.
//
// TasksV8View has its own (identical) copies for its row processing; this
// module is the canonical version the lighter surfaces (NotesWidget dashboard
// card, NotesInline) read through so they display the SAME clean title and
// hide the same machine tags. Keep the two in sync if the wire format changes.

const OWNER_RE = /^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad|ohad|yuval)\s*:\s*/i;
const PRIORITY_RE = /\[(URGENT|HIGH|LOW)\]\s+/i;
const DUE_RE = /\s*·\s*due\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*$/i;

export function ownerFromBody(body) {
  const b = (body || '').trim();
  if (/^(ohad\s*\+\s*yuval|yuval\s*\+\s*ohad)\s*:/i.test(b)) return 'shared';
  if (/^ohad\s*:/i.test(b)) return 'ohad';
  if (/^yuval\s*:/i.test(b)) return 'yuval';
  return 'ohad';
}

export function priorityFromBody(body) {
  const m = (body || '').replace(OWNER_RE, '').match(PRIORITY_RE);
  return m ? m[1].toLowerCase() : 'normal';
}

// Strip owner + priority + due → just the human title the coach typed.
export function displayBodyOf(body) {
  return (body || '').replace(OWNER_RE, '').replace(PRIORITY_RE, '').replace(DUE_RE, '').trim();
}

// Calendar-sync ids + dual-approval bookkeeping. These are internal plumbing,
// never a user-facing hashtag (they were leaking onto the dashboard task cards
// as #GEVENT:…/#GLINK:https://…/#GETAG:"…" tag soup).
export function isInternalTag(t) {
  return /^(gevent|glink|getag|gcal|gcalid|gseq|approved)(:|$)/i.test(String(t || ''));
}

// User-facing tags only (e.g. `center`, `center:property`).
export function visibleTags(tags) {
  return (Array.isArray(tags) ? tags : []).filter(t => !isInternalTag(t));
}

export const PRIORITY_TONE = {
  urgent: 'var(--c-rd)',
  high: 'var(--c-or)',
  low: 'var(--c-tm)',
};
