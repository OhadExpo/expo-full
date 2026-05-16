// PushToggle — drop-in component for the athlete portal (and any
// coach surface that wants notifications). Shows a row with a label,
// current state, and a button to enable/disable.
//
// iOS users on the web (non-PWA) see a hint explaining they must add
// to home screen first. Permission-denied users get a hint that they
// must re-enable notifications in browser settings.

import React, { useEffect, useState, useCallback } from 'react';
import { C, FN, FB } from './theme';
import {
  isPushSupported, isPwaInstalled, isIOS,
  getPushPermission, getCurrentSubscription,
  enablePush, disablePush,
} from './push';

export default function PushToggle({ role = 'athlete', compact = false }) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const installed = isPwaInstalled();
  const onIOS = isIOS();

  const refresh = useCallback(async () => {
    setSupported(isPushSupported());
    setPermission(await getPushPermission());
    const sub = await getCurrentSubscription();
    setSubscribed(!!sub);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!supported) return null; // silent — Safari < 16.4, FF without VAPID env, etc.

  const onEnable = async () => {
    setError(''); setBusy(true);
    try {
      await enablePush(role);
      await refresh();
    } catch (e) {
      setError(e.message || 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };
  const onDisable = async () => {
    setBusy(true);
    try { await disablePush(); await refresh(); }
    finally { setBusy(false); }
  };

  const iosNotInstalled = onIOS && !installed;
  const denied = permission === 'denied';
  const enabled = subscribed && permission === 'granted';

  const wrap = {
    background: 'var(--c-sf)', border: `1px solid var(--c-cardBd)`,
    padding: compact ? '10px 12px' : '14px 16px', marginBottom: compact ? 8 : 12,
  };

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: FN, fontSize: 10, color: 'var(--c-tm)',
            letterSpacing: '0.18em', fontWeight: 700, marginBottom: 4,
          }}>🔔 NOTIFICATIONS</div>
          <div style={{ fontSize: 12, color: 'var(--c-tx)', fontFamily: FB, lineHeight: 1.4 }}>
            {enabled
              ? 'On. You\'ll get a push when your coach messages you.'
              : iosNotInstalled
                ? <>Add EXPO to your home screen first, then enable from the installed app. <span style={{ color: 'var(--c-tm)' }}>(Apple requires this for push.)</span></>
                : denied
                  ? 'Blocked in browser settings. Re-allow notifications for this site, then refresh.'
                  : 'Off. Tap Enable to get a push when your coach messages you.'}
          </div>
          {error && (
            <div style={{
              fontSize: 11, color: C.rd, marginTop: 6, lineHeight: 1.4,
            }}>{error}</div>
          )}
        </div>
        {!iosNotInstalled && !denied && (
          enabled ? (
            <button onClick={onDisable} disabled={busy}
              style={btnGhost(busy)}>{busy ? '…' : 'TURN OFF'}</button>
          ) : (
            <button onClick={onEnable} disabled={busy}
              style={btnAccent(busy)}>{busy ? '…' : 'ENABLE'}</button>
          )
        )}
      </div>
    </div>
  );
}

const btnAccent = (busy) => ({
  background: 'transparent', border: `1px solid ${C.ac}`, color: C.ac,
  padding: '6px 14px', fontFamily: FN, fontSize: 10, fontWeight: 700,
  letterSpacing: '0.12em', cursor: busy ? 'default' : 'pointer',
  opacity: busy ? 0.5 : 1, borderRadius: 0, flexShrink: 0,
});
const btnGhost = (busy) => ({
  background: 'transparent', border: `1px solid ${C.cardBd}`, color: 'var(--c-tm)',
  padding: '6px 14px', fontFamily: FN, fontSize: 10, fontWeight: 700,
  letterSpacing: '0.12em', cursor: busy ? 'default' : 'pointer',
  opacity: busy ? 0.5 : 1, borderRadius: 0, flexShrink: 0,
});
