import { useEffect, useRef, useState } from 'react';

/**
 * Presentation helper for a button that morphs idle -> running -> done.
 *
 * It owns no async work. Pass the busy flag the host already has; after a true -> false edge it
 * returns true for `ms` (default 1.8s) when the run looks successful, so the button can show a
 * check. "Successful" is whatever the caller can already read from existing state:
 *  - `armed`: true at the moment busy turns on (so a run that never could have succeeded, or a
 *    different action that shares the flag, never flashes done).
 *  - `ok`: true once the outcome is visible in existing state. The host often updates that a
 *    beat after the busy flag drops, so the verdict window stays open for `grace` ms.
 * Nothing is shown when the run failed (`ok` never becomes true) or when busy turns on again.
 *
 * Returns `{ done, armedRun }`. `armedRun` is true while a run that started armed is still busy, for
 * buttons that share one busy flag with an opposite action (apply vs remove).
 */
export function useDoneFlash(busy, { armed = true, ok = true, ms = 1800, grace = 2500 } = {}) {
  const [phase, setPhase] = useState('idle'); // idle | pending | done
  const wasBusy = useRef(false);
  const wasArmed = useRef(false);
  const armedNow = useRef(armed);
  armedNow.current = armed;
  const [armedRun, setArmedRun] = useState(false);

  useEffect(() => {
    if (busy) {
      if (!wasBusy.current) wasArmed.current = armedNow.current;
      wasBusy.current = true;
      setArmedRun(wasArmed.current);
      setPhase('idle');
      return;
    }
    setArmedRun(false);
    if (wasBusy.current) {
      wasBusy.current = false;
      if (wasArmed.current) setPhase('pending');
    }
  }, [busy]);

  useEffect(() => {
    if (phase === 'pending') {
      if (ok) {
        setPhase('done');
        return undefined;
      }
      const t = setTimeout(() => setPhase('idle'), grace);
      return () => clearTimeout(t);
    }
    if (phase === 'done') {
      const t = setTimeout(() => setPhase('idle'), ms);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, ok, ms, grace]);

  return { done: phase === 'done', armedRun: busy && armedRun };
}
