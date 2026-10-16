/**
 * Clock times for the workbench, always in IST with AM/PM ("11:40 PM IST"). A time on a day
 * other than today carries its day ("yesterday" or "15 Oct") so an old failure never reads as
 * something that just happened. Every function returns null for a missing or unparseable input,
 * so callers can render nothing rather than a made-up time.
 */
import { formatDuration } from '@/lib/formatDuration';

const TZ = 'Asia/Kolkata';

function toDate(value) {
  if (value == null || value === '') return null;
  let v = typeof value === 'number' || value instanceof Date ? value : String(value);
  // The backend writes some timestamps as naive UTC ("2026-10-15T15:20:27.498"): read those as UTC.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(v)) v += 'Z';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });

/** "11:40 PM IST" */
export function formatIstTime(value) {
  const d = toDate(value);
  return d ? `${clockFmt.format(d).replace(/ /g, ' ')} IST` : null;
}

/** Whole IST calendar days between `value` and `now` (0 = today, 1 = yesterday). */
function istDaysAgo(d, now) {
  const a = Date.parse(`${dayFmt.format(d)}T00:00:00Z`);
  const b = Date.parse(`${dayFmt.format(now)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** "11:40 PM IST" today, "11:40 PM IST yesterday", otherwise "11:40 PM IST on 15 Oct". */
export function formatIstWhen(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return null;
  const time = formatIstTime(d);
  const ago = istDaysAgo(d, toDate(now) || new Date());
  if (ago === 0) return time;
  if (ago === 1) return `${time} yesterday`;
  return `${time} on ${dayLabelFmt.format(d)}`;
}

/** "15 Oct, 11:40:47 PM IST" for the developer console, where seconds matter. */
export function formatIstStamp(value) {
  const d = toDate(value);
  if (!d) return null;
  const t = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
    .format(d)
    .replace(/ /g, ' ');
  return `${dayLabelFmt.format(d)}, ${t} IST`;
}

/**
 * A job's duration in ms from what the server recorded: `duration_seconds`, else completed minus
 * started. Returns null when neither is present, so a missing time stays missing.
 */
export function jobDurationMs(job) {
  if (!job) return null;
  const secs = Number(job.duration_seconds);
  if (job.duration_seconds != null && Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const a = toDate(job.started_at);
  const b = toDate(job.completed_at);
  return a && b && b >= a ? b.getTime() - a.getTime() : null;
}

/** "under 1s" for a sub-second job, otherwise the shared duration wording ("7s", "2m 05s"). */
export function formatJobDuration(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return null;
  if (Number(ms) < 1000) return 'under 1s';
  return formatDuration(ms);
}
