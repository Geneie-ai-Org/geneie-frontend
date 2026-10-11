import { useEffect, useState } from 'react';
import { fetchModule1Capacity } from '@/services/backendApi';

const POLL_MS = 15000;
// The route does not exist on older backends; asking every 15 s would only add noise.
const NOT_FOUND_BACKOFF_MS = 60000;
const REQUEST_TIMEOUT_MS = 10000;
// A snapshot the backend itself dates older than this is treated as unavailable.
const MAX_SNAPSHOT_AGE_MS = 3 * 60 * 1000;

/**
 * DEV-only canned payloads: `?m1capacity=free|busy|long|nogpu|down` (same idiom as
 * `?tierdebug=`). The branch is dead code in production builds.
 */
const DEV_FIXTURES = {
  free: { gpu_slots_free: 1, gpu_queued_ahead: 0, est_gpu_wait_min: [0, 3], est_gpu_total_min: [20, 35], est_cpu_total_min: [90, 150], gpu_capacity_unavailable: false },
  busy: { gpu_slots_free: 0, gpu_queued_ahead: 2, est_gpu_wait_min: [15, 25], est_gpu_total_min: [35, 55], est_cpu_total_min: [90, 150], gpu_capacity_unavailable: false },
  long: { gpu_slots_free: 0, gpu_queued_ahead: 9, est_gpu_wait_min: [100, 140], est_gpu_total_min: [120, 170], est_cpu_total_min: [90, 150], gpu_capacity_unavailable: false },
  nogpu: { gpu_slots_free: 0, gpu_queued_ahead: 0, est_gpu_wait_min: null, est_gpu_total_min: null, est_cpu_total_min: [90, 150], gpu_capacity_unavailable: true },
};

function devFixture() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
  const key = new URLSearchParams(window.location.search).get('m1capacity');
  if (!key) return undefined;
  return key === 'down' ? null : DEV_FIXTURES[key];
}

function snapshotIsStale(data) {
  const raw = data?.as_of ?? data?.updated_at ?? data?.generated_at;
  if (raw == null) return false;
  const ms = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(raw);
  return Number.isFinite(ms) && Date.now() - ms > MAX_SNAPSHOT_AGE_MS;
}

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Module 1 capacity request timed out')), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * GET /api/module1/capacity every 15 s while `enabled` (the upload form is open). Never
 * throws: a 404, error, timeout or stale snapshot all resolve to status 'unavailable', and
 * the form then shows typical ranges with the "Auto will pick" line.
 *
 * Returns `{ capacity, status }` where status is 'loading' | 'ok' | 'unavailable'.
 */
export function useModule1Capacity({ enabled }) {
  const [capacity, setCapacity] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!enabled) return undefined;

    const fixture = devFixture();
    if (fixture !== undefined) {
      setCapacity(fixture);
      setStatus(fixture ? 'ok' : 'unavailable');
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    setCapacity(null);
    setStatus('loading');

    const tick = async () => {
      let nextDelay = POLL_MS;
      try {
        const data = await withTimeout(fetchModule1Capacity());
        if (cancelled) return;
        const usable = data && typeof data === 'object' && !snapshotIsStale(data);
        setCapacity(usable ? data : null);
        setStatus(usable ? 'ok' : 'unavailable');
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 404) nextDelay = NOT_FOUND_BACKOFF_MS;
        setCapacity(null);
        setStatus('unavailable');
      }
      if (!cancelled) timer = setTimeout(tick, nextDelay);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return { capacity, status };
}
