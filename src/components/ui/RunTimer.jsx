import React from 'react';
import { formatClockTime, formatDuration } from '@/lib/formatDuration';

/**
 * One reading for one run: ticking elapsed while it is in flight, the total once it is
 * over. Renders nothing when there is no time to report — a step that never ran must
 * not print "0s" — so callers can drop it in unconditionally.
 */
export default function RunTimer({
  running,
  elapsedMs,
  durationMs,
  startMs = null,
  prefix = '',
  className = '',
  style = undefined,
}) {
  const text = formatDuration(running ? elapsedMs : durationMs);
  if (!text) return null;

  const started = formatClockTime(startMs);
  const title = running
    ? `Running${started ? ` since ${started}` : ''}`
    : `Total time taken${started ? ` · started ${started}` : ''}`;

  return (
    <span className={`tabular-nums ${className}`} style={style} title={title}>
      {prefix}
      {text}
    </span>
  );
}
