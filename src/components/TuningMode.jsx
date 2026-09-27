/**
 * Admin tuning mode: a toggle, an override panel, and the side-by-side two-column answer view.
 *
 * Scope discipline:
 *  - ADMIN-ONLY. The toggle is not rendered at all unless /api/admin/whoami resolves, so a non-admin
 *    never sees the affordance. The backend independently 403s the compare endpoints, so hiding the
 *    UI is convenience, not the security boundary.
 *  - WHEN OFF, NOTHING CHANGES. No header, no different endpoint, no second column - the normal chat
 *    path runs untouched. Tuning mode is additive, not a mode switch over the whole app.
 *  - The panel edits the OVERRIDE SET only. It never writes global config. Promotion to global stays
 *    a deliberate, separate action via the existing admin PUT (see "Copy candidate config").
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminWhoAmI, getAuthHeaders } from '@/services/backendApi';
import { fetchTunableConfig } from '@/services/tuningConfig';
import { streamCompare, createColumnState, COLUMN_LABELS, buildOverridesHeader } from '@/services/streamCompare';
import { getDeviceId } from '@/lib/deviceId';

const PANEL_KEY = 'geneie.tuning.overrides.v1';

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/** `Baseline | Your config` — the only new render path; the single-column chat is untouched. */
function TwoColumnView({ acc, running, error }) {
  return (
    <div className="tune-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {['baseline', 'candidate'].map((col) => {
        const c = acc.state[col];
        return (
          <div key={col} className="tune-col" style={{ border: '1px solid #d5d8dd', borderRadius: 8, padding: 12, minHeight: 120 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6472', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>{COLUMN_LABELS[col]}</span>
              {c.done ? <span style={{ color: '#2e7d32' }}>done</span> : running ? <span>streaming…</span> : null}
            </div>
            {c.error ? (
              <div style={{ color: '#b3261e', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {typeof c.error === 'string' ? c.error : JSON.stringify(c.error)}
              </div>
            ) : (
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{c.text || (running ? '' : '(no output)')}</div>
            )}
          </div>
        );
      })}
      {error ? <div style={{ gridColumn: '1 / -1', color: '#b3261e', fontSize: 13 }}>{error}</div> : null}
    </div>
  );
}

export default function TuningMode({ question, onClose }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState(false);
  const [overrides, setOverrides] = useState(loadSaved);
  const [baseline, setBaseline] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [acc, setAcc] = useState(() => createColumnState());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  // Admin gate. A 403 here is the expected non-admin path, not an error to surface.
  useEffect(() => {
    let alive = true;
    adminWhoAmI()
      .then((d) => { if (alive && d?.isAdmin) setIsAdmin(true); })
      .catch(() => { if (alive) setIsAdmin(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin || !active) return;
    fetchTunableConfig().then(setBaseline).catch((e) => setError(`Could not load config: ${e.message}`));
  }, [isAdmin, active]);

  useEffect(() => {
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(overrides)); } catch { /* non-fatal */ }
  }, [overrides]);

  const keys = baseline?.keys || [];
  const setOverride = useCallback((k, v) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (v === '' || v === null || v === undefined) delete next[k];
      else next[k] = v;
      return next;
    });
  }, []);

  const dirtyKeys = useMemo(
    () => Object.entries(overrides).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    [overrides],
  );

  const run = useCallback(async () => {
    if (!question?.trim()) return;
    setRunning(true);
    setError(null);
    const next = createColumnState();
    setAcc(next);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const authHeaders = await getAuthHeaders();
      await streamCompare({
        path: '/api/chat/stream/compare',
        body: { message: question, conversationId: null },
        overrides,
        authHeaders,
        deviceId: getDeviceId(),
        signal: controller.signal,
        onEvent: (evt) => {
          next.apply(evt);
          // Re-render with a shallow-copied state so React sees the change.
          setAcc({ state: { ...next.state, baseline: { ...next.state.baseline }, candidate: { ...next.state.candidate } } });
        },
      });
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [question, overrides]);

  // Cancel an in-flight comparison if the panel is closed or unmounted.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { if (!active) abortRef.current?.abort(); }, [active]);

  if (!isAdmin) return null; // non-admins never see this at all

  // This component is a DIRECT child of .chat-app-shell, which is a 3-column CSS grid
  // (--shell-left-col / minmax(0,1fr) / --shell-right-col). An unpositioned grid child is
  // auto-placed into an implicit cell, which is how this ended up squeezed into the ~64px icon
  // rail with its label wrapping one word per line. position:fixed takes it out of the grid
  // entirely, so it can never reflow the chat shell - same escape hatch ExploratoryModeToggle uses.
  // Anchored bottom-right, sitting ABOVE that toggle (which owns bottom:14) so the two never overlap.
  const expanded = active && (panelOpen || running || acc.baseline || acc.candidate);

  return (
    <div
      className="tune-root"
      style={{
        position: 'fixed',
        right: 14,
        bottom: 58,
        zIndex: 9998,
        width: expanded ? 'min(920px, calc(100vw - 28px))' : 'auto',
        maxWidth: 'calc(100vw - 28px)',
        maxHeight: 'min(72vh, 720px)',
        overflowY: 'auto',
        background: 'var(--bg-app, #fff)',
        border: '1px solid #c9ced6',
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Tuning mode (side-by-side)
        </label>
        {active ? (
          <>
            <button type="button" onClick={() => setPanelOpen((v) => !v)} style={{ fontSize: 12 }}>
              {panelOpen ? 'Hide' : 'Show'} config ({dirtyKeys.length} override{dirtyKeys.length === 1 ? '' : 's'})
            </button>
            <button type="button" onClick={run} disabled={running || !question?.trim()} style={{ fontSize: 12 }}>
              {running ? 'Comparing…' : 'Run comparison'}
            </button>
            <button
              type="button"
              disabled={!dirtyKeys.length}
              onClick={() => {
                const h = buildOverridesHeader(overrides);
                navigator.clipboard?.writeText(h || '');
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{ fontSize: 12 }}
              title="Copy the override JSON. Promoting it to global is a separate, deliberate admin PUT."
            >
              {copied ? 'Copied' : 'Copy candidate config'}
            </button>
            <button type="button" onClick={() => { setOverrides({}); setAcc(createColumnState()); }} style={{ fontSize: 12 }}>
              Reset all
            </button>
          </>
        ) : null}
        {onClose ? <button type="button" onClick={onClose} style={{ fontSize: 12, marginLeft: 'auto' }}>Close</button> : null}
      </div>

      {!active ? (
        <div style={{ fontSize: 12, color: '#5b6472', marginTop: 6 }}>
          Off — chat behaves exactly as it does normally (no header, no second column).
        </div>
      ) : null}

      {active && panelOpen ? (
        <div style={{ marginTop: 10, maxHeight: 260, overflow: 'auto', borderTop: '1px solid #e6e9ee', paddingTop: 8 }}>
          {baseline ? null : <div style={{ fontSize: 12, color: '#5b6472' }}>Loading current config…</div>}
          {keys.map((k) => {
            const b = baseline.byKey[k];
            const cur = overrides[k] ?? '';
            return (
              <label key={k} style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace' }}>{k}</span>
                  <span style={{ color: '#5b6472' }}>
                    baseline: {typeof b.value === 'object' ? JSON.stringify(b.value) : String(b.value)}
                    {cur !== '' ? ' · overridden' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <input
                    style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }}
                    value={cur}
                    placeholder={typeof b.value === 'object' ? JSON.stringify(b.value) : String(b.value ?? '')}
                    onChange={(e) => setOverride(k, e.target.value)}
                  />
                  <button type="button" onClick={() => setOverride(k, '')} disabled={cur === ''} style={{ fontSize: 11 }}>
                    reset
                  </button>
                </div>
                {b.description ? <div style={{ color: '#7a828f', fontSize: 11 }}>{b.description}</div> : null}
              </label>
            );
          })}
          {keys.length ? null : (
            <div style={{ fontSize: 12, color: '#5b6472' }}>
              No tunable backend keys loaded. Sidecar persona/pack/agent keys are not prefillable yet (they live in
              the S3 manifest, not this collection) — you can still set them by hand and they will travel in the header.
            </div>
          )}
        </div>
      ) : null}

      {active ? <div style={{ marginTop: 12 }}><TwoColumnView acc={acc} running={running} error={error} /></div> : null}
    </div>
  );
}
