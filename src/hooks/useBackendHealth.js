import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/config/api';

const PROBE_TIMEOUT_MS = 3000;
const SECOND_LOOK_MS = 800; // one quick second look before the screen goes up, so a single blip never shows it
const FIRST_ANSWER_GRACE_MS = 3500; // a slow but alive backend must not blank the app for longer than this
const RETRY_STEPS_MS = [15000, 30000, 60000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when GET /health answers 2xx within the timeout. Network errors, timeouts and 5xx all count as down. */
async function probe() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl('/health'), { signal: ctrl.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** `?backend=down` forces the screen, for design review and QA. Nothing else reads it. */
function isForcedDown() {
  try {
    return new URLSearchParams(window.location.search).get('backend') === 'down';
  } catch {
    return false;
  }
}

/**
 * Is the backend reachable? Starts optimistic (the app renders straight away) and probes in the background.
 * The host should keep the app covered until `ready`. Down means two failed probes in a row. While down it retries on its own, 15s then 30s then every 60s, and
 * again the moment the tab becomes visible or the network comes back. `epoch` changes on recovery so the host can
 * remount the app and refetch everything.
 */
export function useBackendHealth() {
  const forced = isForcedDown();
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [verified, setVerified] = useState(false);
  const [grace, setGrace] = useState(false);
  const downRef = useRef(false);
  const attemptRef = useRef(0);
  const timerRef = useRef(0);
  const aliveRef = useRef(true);
  const busyRef = useRef(false);

  const run = useCallback(async (secondLook) => {
    if (busyRef.current) return;
    busyRef.current = true;
    clearTimeout(timerRef.current);
    setChecking(true);
    let ok = await probe();
    if (!ok && secondLook && aliveRef.current) {
      await sleep(SECOND_LOOK_MS);
      if (aliveRef.current) ok = await probe();
    }
    busyRef.current = false;
    if (!aliveRef.current) return;
    setChecking(false);
    if (ok) {
      setVerified(true);
      attemptRef.current = 0;
      if (downRef.current) {
        downRef.current = false;
        setDown(false);
        setEpoch((e) => e + 1);
      }
      return;
    }
    downRef.current = true;
    setDown(true);
    const delay = RETRY_STEPS_MS[Math.min(attemptRef.current, RETRY_STEPS_MS.length - 1)];
    attemptRef.current += 1;
    timerRef.current = setTimeout(() => run(false), delay);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (forced) return undefined;
    const graceTimer = setTimeout(() => setGrace(true), FIRST_ANSWER_GRACE_MS);
    run(true);
    const again = () => {
      if (downRef.current) run(false);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') again();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', again);
    return () => {
      aliveRef.current = false;
      clearTimeout(graceTimer);
      clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', again);
    };
  }, [forced, run]);

  const retry = useCallback(() => {
    if (forced) return;
    attemptRef.current = 0;
    run(false);
  }, [forced, run]);

  // `ready`: the first probe has answered (or the grace ran out), so the app may be shown. Until then the host covers it,
  // which stops the app's own failed calls (for example the legal-agreement check) from flashing an error card first.
  return { down: forced || down, checking, retry, epoch, ready: forced || verified || grace };
}
