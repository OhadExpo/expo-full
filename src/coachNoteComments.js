// Comments + event-log adapter for coach_notes.
//
// Two tables back this:
//   coach_note_comments — threaded comments per task
//   coach_note_events   — append-only audit log per task
//
// Both ship behind feature-detection: if the migration hasn't been
// applied yet, every function gracefully degrades to a no-op (the
// callers act as if no comments / no events exist) instead of throwing
// a toast at every render. Once Ohad applies the SQL the UI lights up
// without any further code changes.

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';

const COMMENT_ID = () => 'cmt_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

// True when the relevant table doesn't exist yet (migration pending).
const TABLE_MISSING_RE = /relation .* does not exist/i;

// ────────────────────────────────────────────────────────────────────
// Mentions — pull @ohad / @yuval out of a comment body.
// ────────────────────────────────────────────────────────────────────
const MENTION_RE = /@(ohad|yuval)\b/gi;

export function extractMentions(body) {
  if (!body) return [];
  const out = new Set();
  let m;
  while ((m = MENTION_RE.exec(body)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

// ────────────────────────────────────────────────────────────────────
// Comments
// ────────────────────────────────────────────────────────────────────

export function useCoachNoteComments(noteId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true); // false → migration not applied
  const fetchedFor = useRef(null);

  const refetch = useCallback(async () => {
    if (!noteId) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_note_comments')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });
    setLoading(false);
    if (error) {
      if (TABLE_MISSING_RE.test(error.message)) {
        setAvailable(false);
        setRows([]);
        return;
      }
      console.warn('Loading comments failed:', error.message);
      setRows([]);
      return;
    }
    setAvailable(true);
    setRows(data || []);
  }, [noteId]);

  useEffect(() => {
    if (fetchedFor.current === noteId) return;
    fetchedFor.current = noteId;
    refetch();
  }, [noteId, refetch]);

  const add = useCallback(async ({ author, body }) => {
    if (!noteId || !body || !body.trim()) return null;
    const row = {
      id: COMMENT_ID(),
      note_id: noteId,
      author: author || 'ohad',
      body: body.trim(),
      mentions: extractMentions(body),
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('coach_note_comments').insert(row);
    if (error) {
      if (TABLE_MISSING_RE.test(error.message)) {
        setAvailable(false);
        return null;
      }
      console.warn('Saving comment failed:', error.message);
      return null;
    }
    setRows(prev => [...prev, row]);
    return row;
  }, [noteId]);

  const update = useCallback(async (id, body) => {
    const trimmed = (body || '').trim();
    if (!trimmed) return;
    const patch = { body: trimmed, mentions: extractMentions(trimmed) };
    const { error } = await supabase.from('coach_note_comments').update(patch).eq('id', id);
    if (error) {
      if (TABLE_MISSING_RE.test(error.message)) { setAvailable(false); return; }
      console.warn('Editing comment failed:', error.message);
      return;
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const remove = useCallback(async (id) => {
    const { error } = await supabase.from('coach_note_comments').delete().eq('id', id);
    if (error) {
      if (TABLE_MISSING_RE.test(error.message)) { setAvailable(false); return; }
      console.warn('Deleting comment failed:', error.message);
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rows, loading, available, add, update, remove, refetch };
}

// ────────────────────────────────────────────────────────────────────
// Event log — fire-and-forget recorder.
// ────────────────────────────────────────────────────────────────────

// Single-shot recorder. Called from any place a task mutates so the
// timeline reflects the change. Silently no-ops if the audit table
// doesn't exist (migration pending).
export async function recordNoteEvent({ noteId, actor, kind, fromValue, toValue, detail }) {
  if (!noteId || !actor || !kind) return;
  try {
    await supabase.from('coach_note_events').insert({
      note_id: noteId,
      actor,
      kind,
      from_value: fromValue ?? null,
      to_value: toValue ?? null,
      detail: detail ?? null,
    });
  } catch {
    /* table missing or transient — non-blocking */
  }
}

export function useCoachNoteEvents(noteId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const fetchedFor = useRef(null);

  const refetch = useCallback(async () => {
    if (!noteId) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('coach_note_events')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true });
    setLoading(false);
    if (error) {
      if (TABLE_MISSING_RE.test(error.message)) {
        setAvailable(false);
        setRows([]);
        return;
      }
      setRows([]);
      return;
    }
    setAvailable(true);
    setRows(data || []);
  }, [noteId]);

  useEffect(() => {
    if (fetchedFor.current === noteId) return;
    fetchedFor.current = noteId;
    refetch();
  }, [noteId, refetch]);

  return { rows, loading, available, refetch };
}
