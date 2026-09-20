import { useEffect, useState } from 'react';

const TICK_MS = 1000;

/**
 * Start/end times for runs the server does not timestamp (client-side steps, and any
 * job written before the backend carried timing fields). Module-level on purpose: the
 * pipeline drawer unmounts when it collapses, and a run that is still going must not
 * lose the moment it started.
 */
const observed = new Map();

function toMs(value) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsToMs(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n * 1000 : null;
}

/**
 * One run's timing. `key` scopes the observed fallback (conversation + step, so two
 * conversations don't share a stopwatch); `running` drives the ticking. Server-reported
 * `startedAt` / `completedAt` / `durationSeconds` always win over what we observed —
 * a job that started before this tab was open still reports its real elapsed time.
 */
export function useRunTimer(key, running, backend = {}) {
  const backendStart = toMs(backend.startedAt);
  const backendEnd = toMs(backend.completedAt);
  const backendDurationMs = secondsToMs(backend.durationSeconds);

  const [, setTick] = useState(0);

  useEffect(() => {
    if (key) {
      const prev = observed.get(key);
      if (running) {
        // A fresh run (or a re-run after a finished one) resets the stopwatch.
        if (!prev || prev.endMs != null) {
          observed.set(key, { startMs: backendStart ?? Date.now(), endMs: null });
        } else if (backendStart != null && prev.startMs !== backendStart) {
          observed.set(key, { ...prev, startMs: backendStart });
        }
      } else if (prev && prev.endMs == null) {
        observed.set(key, { ...prev, endMs: backendEnd ?? Date.now() });
      }
    }
    setTick((t) => t + 1);
  }, [key, running, backendStart, backendEnd]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const record = key ? observed.get(key) : null;
  const startMs = backendStart ?? record?.startMs ?? null;
  const endMs = backendEnd ?? record?.endMs ?? null;

  if (running) {
    return {
      running: true,
      startMs,
      elapsedMs: startMs != null ? Math.max(0, Date.now() - startMs) : null,
      durationMs: null,
    };
  }

  const durationMs =
    backendDurationMs ?? (startMs != null && endMs != null ? Math.max(0, endMs - startMs) : null);
  return { running: false, startMs, elapsedMs: null, durationMs };
}

/** Plain ticking elapsed time from a start instant — for a turn that isn't a job. */
export function useElapsed(startMs) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startMs == null) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [startMs]);

  if (startMs == null) return null;
  return Math.max(0, now - startMs);
}
