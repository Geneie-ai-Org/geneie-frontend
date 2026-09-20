/**
 * Run durations, written the way a person reads a wall clock: seconds until a minute
 * is worth naming, then minutes, then hours. Returns null rather than "0s" when there
 * is nothing to report, so callers can render nothing at all.
 */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(Number(ms)) || Number(ms) < 0) return null;
  const totalSeconds = Math.round(Number(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** Absolute start time, for the tooltip on a timer that only shows elapsed. */
export function formatClockTime(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return null;
  return new Date(Number(ms)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
