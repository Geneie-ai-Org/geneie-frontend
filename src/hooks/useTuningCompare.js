/**
 * Admin tuning compare — shared state for the side-by-side baseline-vs-candidate run.
 *
 * Why a hook: the CONTROLS (toggle, override editor, Run button) live in a small floating panel
 * (TuningMode), but the ANSWER must render INLINE IN THE CHAT THREAD as two real markdown columns —
 * so the compare feels like the chat itself ran twice, not like a separate tool. Both consumers
 * (ChatPage for the columns, TuningMode for the controls) read ONE instance of this hook, lifted to
 * ChatPage, so there is a single source of truth and no prop-drilling of the run logic.
 *
 * Scope discipline is unchanged from the original TuningMode component:
 *  - ADMIN-ONLY. `isAdmin` gates whether the affordance renders at all; the backend independently
 *    403s the compare endpoint, so this is convenience, not the security boundary.
 *  - WHEN OFF (`active` false), NOTHING renders and no compare request is ever issued.
 *  - Overrides are a SESSION override set only; promotion to global config is a separate admin PUT.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminWhoAmI, getAuthHeaders } from '@/services/backendApi';
import { fetchTunableConfig } from '@/services/tuningConfig';
import { streamCompare, createColumnState } from '@/services/streamCompare';
import { getDeviceId } from '@/lib/deviceId';

const PANEL_KEY = 'geneie.tuning.overrides.v1';

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function useTuningCompare({ question } = {}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState(false);
  const [overrides, setOverrides] = useState(loadSaved);
  const [baseline, setBaseline] = useState(null);
  const [acc, setAcc] = useState(() => createColumnState());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [lastQuestion, setLastQuestion] = useState('');
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

  const setOverride = useCallback((k, v) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (v === '' || v === null || v === undefined) delete next[k];
      else next[k] = v;
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    setAcc(createColumnState());
    setLastQuestion('');
  }, []);

  const dirtyKeys = useMemo(
    () => Object.entries(overrides).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    [overrides],
  );

  const run = useCallback(async () => {
    if (!question?.trim()) return;
    setRunning(true);
    setError(null);
    setLastQuestion(question.trim());
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

  const abort = useCallback(() => abortRef.current?.abort(), []);

  // Cancel an in-flight comparison if the consumer unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);
  // Turning tuning mode off cancels any in-flight compare.
  useEffect(() => { if (!active) abortRef.current?.abort(); }, [active]);

  // Whether the thread should render the inline two-column answer right now.
  const hasColumns = Boolean(
    acc.state.baseline.text || acc.state.candidate.text ||
    acc.state.baseline.error || acc.state.candidate.error || running,
  );

  return {
    isAdmin,
    active,
    setActive,
    overrides,
    setOverride,
    resetAll,
    baseline,
    dirtyKeys,
    acc,
    running,
    error,
    lastQuestion,
    run,
    abort,
    hasColumns,
    canRun: !running && Boolean(question?.trim()),
  };
}
