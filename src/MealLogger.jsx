// F-14 — Meal photo → macros logger.
//
// Athlete-facing UI. Three steps:
//   1. Tap "📸 LOG MEAL" → file picker (or camera on mobile via accept).
//   2. Photo previews + uploads to Supabase storage `meal-photos` bucket.
//   3. We POST the public URL to /api/meal-macros, AI returns macros JSON.
//   4. Athlete can tweak any number then SAVE — inserts into `athlete_meals`.
//
// Past meals list below the composer (today by default, with a "← prev day"
// arrow). Per-meal delete + edit are out of scope for the first cut; we
// can add later if Ohad sees clients wanting it.

import React, { useEffect, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import { supabase } from './supabase';

const BUCKET = 'meal-photos';

function todayISO() {
  // LOCAL date, not toISOString() (UTC) — a meal logged 00:00–03:00 Israel
  // time was landing on yesterday's date.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayLabel(iso) {
  if (iso === todayISO()) return 'Today';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MealLogger({ clientId, page = false }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [macros, setMacros] = useState(null);
  const [hint, setHint] = useState('');
  const [error, setError] = useState(null);
  const [meals, setMeals] = useState([]);
  const [day, setDay] = useState(todayISO());

  const loadDay = useCallback(async (iso) => {
    try {
      const { data, error } = await supabase
        .from('athlete_meals')
        .select('*')
        .eq('client_id', clientId)
        .eq('meal_date', iso)
        .order('logged_at', { ascending: true });
      if (!error) setMeals(data || []);
    } catch {}
  }, [clientId]);

  useEffect(() => { if (clientId) loadDay(day); }, [clientId, day, loadDay]);

  const onPickPhoto = async (e) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Photo is too large (max 8 MB).');
      return;
    }
    setUploading(true);
    setMacros(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = urlData?.publicUrl;
      if (!url) throw new Error('Could not get public URL for the photo.');
      setPhotoUrl(url);
    } catch (e) {
      setError(e.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const analyze = async () => {
    if (!photoUrl) return;
    setAnalyzing(true);
    setError(null);
    try {
      // The endpoint requires a Supabase session (paid AI call).
      const { data: { session } = {} } = await supabase.auth.getSession();
      const r = await fetch('/api/meal-macros', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ photoUrl, hint }),
      });
      // The endpoint *should* always return JSON, but a Vercel runtime
      // crash (timeout, OOM, cold-start failure) returns plaintext like
      // "A server error has occurred". Read as text first so we don't
      // explode the SyntaxError onto the user, then attempt parse.
      const raw = await r.text();
      let j;
      try { j = JSON.parse(raw); }
      catch {
        const snippet = raw.replace(/\s+/g, ' ').slice(0, 140);
        throw new Error(`Server error (${r.status})${snippet ? ` — ${snippet}` : ''}`);
      }
      if (!r.ok || !j.ok) throw new Error(j.error || `AI call failed (${r.status}).`);
      setMacros(j.macros);
    } catch (e) {
      setError(e.message || 'Could not analyze the photo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!macros || !photoUrl) return;
    setError(null);
    try {
      const row = {
        client_id: clientId,
        meal_date: day,
        logged_at: new Date().toISOString(),
        photo_url: photoUrl,
        items: macros.items || [],
        kcal: macros.kcal,
        protein_g: macros.protein_g,
        carb_g: macros.carb_g,
        fat_g: macros.fat_g,
        confidence: macros.confidence,
        notes: macros.notes || hint || null,
      };
      const { error } = await supabase.from('athlete_meals').insert(row);
      if (error) throw error;
      setPhotoUrl(null);
      setMacros(null);
      setHint('');
      await loadDay(day);
    } catch (e) {
      setError(e.message || 'Save failed.');
    }
  };

  const totals = meals.reduce((acc, m) => ({
    kcal: acc.kcal + (Number(m.kcal) || 0),
    p: acc.p + (Number(m.protein_g) || 0),
    c: acc.c + (Number(m.carb_g) || 0),
    f: acc.f + (Number(m.fat_g) || 0),
  }), { kcal: 0, p: 0, c: 0, f: 0 });

  const isToday = day === todayISO();
  // Page mode: full-bleed layout, hero totals, bigger thumbnails.
  // Inline (legacy widget) mode: tinted card with compact composer.
  // The widget mode is retained for any host that still mounts this
  // outside the dedicated /meal-log page route.
  if (page) {
    return (
      <div>
        {/* Day navigator — strip with prev/next + label */}
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 40px',
          alignItems: 'center', marginBottom: 14, gap: 8,
        }}>
          <button onClick={() => { const d = new Date(day); d.setDate(d.getDate() - 1); setDay(d.toISOString().slice(0, 10)); }}
            aria-label="Previous day"
            style={{
              background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm,
              padding: '8px 0', fontFamily: FN, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', borderRadius: 0,
            }}>←</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>
              MEAL LOG
            </div>
            <div style={{ fontFamily: FN, fontSize: 15, color: C.tx, fontWeight: 700, letterSpacing: '0.02em', marginTop: 3 }}>
              {dayLabel(day)}
            </div>
          </div>
          {!isToday ? (
            <button onClick={() => { const d = new Date(day); d.setDate(d.getDate() + 1); setDay(d.toISOString().slice(0, 10)); }}
              aria-label="Next day"
              style={{
                background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm,
                padding: '8px 0', fontFamily: FN, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', borderRadius: 0,
              }}>→</button>
          ) : <span aria-hidden="true" />}
        </div>

        {/* Hero totals — calories headline, macros underneath */}
        <div style={{
          border: `1px solid ${C.cardBd}`, padding: '16px 14px',
          marginBottom: 16, background: 'var(--c-sf)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: FN, fontSize: 9, color: C.tm,
              letterSpacing: '0.24em', fontWeight: 700,
            }}>{isToday ? 'TODAY · TOTAL' : 'DAY TOTAL'}</div>
            <div style={{
              fontFamily: FN, fontSize: 36, color: meals.length ? C.ac : C.td,
              fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4,
              fontVariantNumeric: 'tabular-nums',
            }}>{totals.kcal}<span style={{ fontSize: 13, color: C.tm, fontWeight: 600, marginLeft: 6, letterSpacing: '0.12em' }}>KCAL</span></div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.cardBd}`,
          }}>
            {[
              { l: 'PROTEIN', v: totals.p, c: C.gn },
              { l: 'CARB',    v: totals.c, c: C.or },
              { l: 'FAT',     v: totals.f, c: C.ac },
            ].map(t => (
              <div key={t.l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{t.l}</div>
                <div style={{ fontFamily: FN, fontSize: 18, color: t.c, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {t.v}<span style={{ fontSize: 10, color: C.tm, marginLeft: 2, fontWeight: 600 }}>g</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Composer — only on today */}
        {isToday && (
          <div style={{ marginBottom: 18 }}>
            {!photoUrl && !uploading && (
              <label style={{ display: 'block' }}>
                <input type="file" accept="image/*" capture="environment" onChange={onPickPhoto} style={{ display: 'none' }} />
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  cursor: 'pointer', padding: '16px 18px',
                  border: `2px dashed ${C.ac}`, color: C.ac, background: 'transparent',
                  fontFamily: FN, fontSize: 13, fontWeight: 700, letterSpacing: '0.18em',
                  textAlign: 'center', boxSizing: 'border-box',
                }}>
                  <span style={{ fontSize: 20 }}>📸</span>
                  <span>SNAP A MEAL</span>
                </span>
              </label>
            )}
            {uploading && (
              <div style={{
                textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 10,
                letterSpacing: '0.18em', fontWeight: 700, padding: 28,
                border: `1px solid ${C.cardBd}`,
              }}>UPLOADING…</div>
            )}
            {photoUrl && !macros && !analyzing && (
              <div>
                <img src={photoUrl} alt="meal" style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block', marginBottom: 10 }} />
                <input type="text" value={hint} onChange={e => setHint(e.target.value)} dir="auto"
                  placeholder='Optional hint (e.g. "1 tbsp olive oil")'
                  style={{
                    width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
                    padding: '10px 12px', color: C.tx, fontFamily: FB, fontSize: 13,
                    outline: 'none', boxSizing: 'border-box', marginBottom: 10,
                  }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setPhotoUrl(null); setHint(''); }} style={btnGhost}>CANCEL</button>
                  <button onClick={analyze} style={btnAc}>ANALYZE →</button>
                </div>
              </div>
            )}
            {analyzing && (
              <div style={{
                textAlign: 'center', color: C.ac, fontFamily: FN, fontSize: 11,
                letterSpacing: '0.18em', fontWeight: 700, padding: 32,
                border: `1px solid ${C.ac}`,
              }}>ANALYZING…</div>
            )}
            {macros && photoUrl && (
              <MacrosReview macros={macros} setMacros={setMacros} photoUrl={photoUrl} onCancel={() => { setMacros(null); setPhotoUrl(null); setHint(''); }} onSave={save} />
            )}
            {error && (
              <div style={{
                marginTop: 10, padding: '10px 12px', border: `1px solid ${C.rd}`,
                color: C.rd, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              }}>{error}</div>
            )}
          </div>
        )}

        {/* Past meals — bigger thumbs, full-row tap-target */}
        <div>
          <div style={{
            fontFamily: FN, fontSize: 9, color: C.tm,
            letterSpacing: '0.24em', fontWeight: 700, marginBottom: 10,
          }}>{isToday ? 'TODAY' : 'MEALS'} · {meals.length}</div>
          {meals.length === 0 ? (
            <div style={{
              textAlign: 'center', color: C.td, fontSize: 13, padding: '32px 14px',
              border: `1px solid ${C.cardBd}`,
            }}>
              {isToday
                ? 'No meals yet. Snap a photo above and the AI will estimate macros.'
                : 'No meals on this day.'}
            </div>
          ) : meals.map(m => <MealRow key={m.id} meal={m} page />)}
        </div>
      </div>
    );
  }

  // ---- legacy inline widget (kept for any host that still uses it) ----
  return (
    <div style={{
      background: 'var(--c-sf)', border: `1px solid ${C.cardBd}`,
      padding: 14, marginBottom: 14,
    }}>
      <div style={{ fontFamily: FN, fontSize: 11, color: C.ac, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 10 }}>
        📸 MEAL LOG
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => { const d = new Date(day); d.setDate(d.getDate() - 1); setDay(d.toISOString().slice(0, 10)); }}
          style={navBtn}>← PREV</button>
        <span style={{ fontFamily: FN, fontSize: 12, color: C.tx, fontWeight: 700, letterSpacing: '0.04em' }}>
          {dayLabel(day)}
        </span>
        {!isToday ? (
          <button onClick={() => { const d = new Date(day); d.setDate(d.getDate() + 1); setDay(d.toISOString().slice(0, 10)); }}
            style={navBtn}>NEXT →</button>
        ) : <span style={{ width: 60 }} />}
      </div>

      {meals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 12 }}>
          {[
            { l: 'KCAL', v: totals.kcal },
            { l: 'P', v: `${totals.p}g` },
            { l: 'C', v: `${totals.c}g` },
            { l: 'F', v: `${totals.f}g` },
          ].map(t => (
            <div key={t.l} style={{ border: `1px solid ${C.cardBd}`, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700 }}>{t.l}</div>
              <div style={{ fontFamily: FN, fontSize: 14, color: C.tx, fontWeight: 700, marginTop: 2 }}>{t.v}</div>
            </div>
          ))}
        </div>
      )}

      {isToday && (
        <>
          {!photoUrl && !uploading && (
            <label style={{ display: 'block' }}>
              <input type="file" accept="image/*" capture="environment" onChange={onPickPhoto} style={{ display: 'none' }} />
              <span style={{
                display: 'inline-block', cursor: 'pointer',
                padding: '10px 18px', border: `1px solid ${C.ac}`, color: C.ac,
                fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
                width: '100%', textAlign: 'center', boxSizing: 'border-box',
              }}>+ PHOTO</span>
            </label>
          )}
          {uploading && (
            <div style={{ textAlign: 'center', color: C.tm, fontFamily: FN, fontSize: 10, letterSpacing: '0.18em', fontWeight: 700, padding: 14 }}>
              UPLOADING…
            </div>
          )}
          {photoUrl && !macros && !analyzing && (
            <div>
              <img src={photoUrl} alt="meal" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block', marginBottom: 8 }} />
              <input type="text" value={hint} onChange={e => setHint(e.target.value)} dir="auto"
                placeholder='Optional hint (e.g. "1 tbsp olive oil")'
                style={{
                  width: '100%', background: 'var(--c-bg)', border: `1px solid ${C.cardBd}`,
                  padding: '8px 10px', color: C.tx, fontFamily: FB, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', marginBottom: 8,
                }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setPhotoUrl(null); setHint(''); }} style={btnGhost}>CANCEL</button>
                <button onClick={analyze} style={btnAc}>ANALYZE →</button>
              </div>
            </div>
          )}
          {analyzing && (
            <div style={{ textAlign: 'center', color: C.ac, fontFamily: FN, fontSize: 10, letterSpacing: '0.18em', fontWeight: 700, padding: 20 }}>
              ANALYZING…
            </div>
          )}
          {macros && photoUrl && (
            <MacrosReview macros={macros} setMacros={setMacros} photoUrl={photoUrl} onCancel={() => { setMacros(null); setPhotoUrl(null); setHint(''); }} onSave={save} />
          )}
          {error && (
            <div style={{
              marginTop: 10, padding: '8px 10px', border: `1px solid ${C.rd}`,
              color: C.rd, fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            }}>{error}</div>
          )}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        {meals.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.td, fontSize: 12, padding: 14 }}>
            {isToday ? 'No meals logged yet today.' : 'No meals on this day.'}
          </div>
        ) : meals.map(m => (
          <MealRow key={m.id} meal={m} />
        ))}
      </div>
    </div>
  );
}

function MacrosReview({ macros, setMacros, photoUrl, onCancel, onSave }) {
  const setField = (k, v) => setMacros({ ...macros, [k]: v });
  return (
    <div>
      <img src={photoUrl} alt="meal" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block', marginBottom: 10 }} />
      <div style={{ fontFamily: FN, fontSize: 10, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 8 }}>
        AI ESTIMATE · CONFIDENCE: <span style={{ color: macros.confidence === 'high' ? C.gn : macros.confidence === 'medium' ? C.or : C.rd }}>{macros.confidence?.toUpperCase()}</span>
      </div>
      {macros.items?.length > 0 && (
        <div style={{ marginBottom: 10, fontSize: 11, color: C.tm }}>
          {macros.items.map((it, i) => (
            <div key={i} style={{ padding: '2px 0' }}>
              • {it.name} {it.portion ? `(${it.portion})` : ''} {it.kcal ? `· ${it.kcal} kcal` : ''}
            </div>
          ))}
        </div>
      )}
      {macros.notes && (
        <div style={{ fontFamily: FB, fontSize: 11, color: C.td, fontStyle: 'italic', marginBottom: 10 }}>
          ℹ {macros.notes}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
        <MacroInput label="KCAL" value={macros.kcal} onChange={v => setField('kcal', v)} />
        <MacroInput label="P g" value={macros.protein_g} onChange={v => setField('protein_g', v)} />
        <MacroInput label="C g" value={macros.carb_g} onChange={v => setField('carb_g', v)} />
        <MacroInput label="F g" value={macros.fat_g} onChange={v => setField('fat_g', v)} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={btnGhost}>CANCEL</button>
        <button onClick={onSave} style={btnAc}>SAVE MEAL</button>
      </div>
    </div>
  );
}

function MacroInput({ label, value, onChange }) {
  return (
    <div style={{ border: `1px solid ${C.cardBd}`, padding: '6px 8px' }}>
      <div style={{ fontFamily: FN, fontSize: 8, color: C.tm, letterSpacing: '0.18em', fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <input type="number" value={value || 0} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{
          width: '100%', background: 'transparent', border: 'none', outline: 'none',
          color: C.tx, fontFamily: FN, fontSize: 14, fontWeight: 700, padding: 0,
        }} />
    </div>
  );
}

function MealRow({ meal, page = false }) {
  if (page) {
    return (
      <div style={{
        display: 'flex', gap: 12, padding: 10, marginBottom: 8,
        border: `1px solid ${C.cardBd}`, background: 'var(--c-sf)',
      }}>
        <img src={meal.photo_url} alt="" style={{
          width: 80, height: 80, objectFit: 'cover', flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
            }}>
              <span style={{
                fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.18em', fontWeight: 700,
              }}>{new Date(meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{
                fontFamily: FN, fontSize: 14, color: C.ac, fontWeight: 700, letterSpacing: '0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}>{meal.kcal} <span style={{ fontSize: 9, color: C.tm, fontWeight: 600, letterSpacing: '0.12em' }}>KCAL</span></span>
            </div>
            {Array.isArray(meal.items) && meal.items.length > 0 && (
              <div style={{
                fontSize: 12, color: C.tx, marginTop: 4, lineHeight: 1.35,
                display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
              }}>
                {meal.items.map(i => i.name).filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', gap: 10, marginTop: 6,
            fontFamily: FN, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={{ color: C.gn }}>{meal.protein_g}<span style={{ color: C.tm, marginLeft: 2 }}>P</span></span>
            <span style={{ color: C.or }}>{meal.carb_g}<span style={{ color: C.tm, marginLeft: 2 }}>C</span></span>
            <span style={{ color: C.ac }}>{meal.fat_g}<span style={{ color: C.tm, marginLeft: 2 }}>F</span></span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.cardBd}`,
    }}>
      <img src={meal.photo_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FN, fontSize: 9, color: C.tm, letterSpacing: '0.04em', fontWeight: 700 }}>
          {new Date(meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {meal.kcal} kcal
        </div>
        <div style={{ fontFamily: FN, fontSize: 12, color: C.tx, marginTop: 2 }}>
          {meal.protein_g}P / {meal.carb_g}C / {meal.fat_g}F
        </div>
        {Array.isArray(meal.items) && meal.items.length > 0 && (
          <div style={{ fontSize: 11, color: C.td, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meal.items.map(i => i.name).filter(Boolean).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn = {
  background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm,
  padding: '4px 8px', fontFamily: FN, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
  cursor: 'pointer', borderRadius: 0,
};
const btnGhost = {
  flex: 1, background: 'transparent', border: `1px solid ${C.cardBd}`, color: C.tm,
  padding: '8px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
  cursor: 'pointer', borderRadius: 0,
};
const btnAc = {
  flex: 2, background: C.ac, border: `1px solid ${C.ac}`, color: '#FFFFFF',
  padding: '8px', fontFamily: FN, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
  cursor: 'pointer', borderRadius: 0,
};
