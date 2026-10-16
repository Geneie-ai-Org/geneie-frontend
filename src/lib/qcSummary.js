/** Formatting + rule-of-thumb grades for the native Module 1 QC view (numbers come from fastp). */

export const fmtInt = (n) => (Number.isFinite(Number(n)) && n !== null ? Number(n).toLocaleString('en-US') : '–');

export function fmtPct(rate, digits = 1) {
  const n = Number(rate);
  if (rate === null || rate === undefined || !Number.isFinite(n)) return '–';
  return `${(n * 100).toFixed(digits)}%`;
}

/** 1,234,567 -> "1.23 M", 1.2e9 -> "1.20 G"; smaller counts stay exact (reads and bases). */
export function fmtCompact(n) {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return '–';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} G`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
  return v.toLocaleString('en-US');
}

// Same cut-offs as the backend narrative (module1_qc_report): >= 90% strong, >= 80% acceptable.
export const GUIDE = {
  q30: { pass: 0.9, warn: 0.8 },
  kept: { pass: 0.9, warn: 0.75 },
  dup: { pass: 0.2, warn: 0.4 },
};

const higher = (v, g) => (!Number.isFinite(Number(v)) || v === null ? null : v >= g.pass ? 'pass' : v >= g.warn ? 'warn' : 'fail');
const lower = (v, g) => (!Number.isFinite(Number(v)) || v === null ? null : v <= g.pass ? 'pass' : v <= g.warn ? 'warn' : 'fail');

export const gradeQ30 = (rate) => higher(rate, GUIDE.q30);
export const gradeKept = (rate) => higher(rate, GUIDE.kept);
export const gradeDup = (rate) => lower(rate, GUIDE.dup);

const RANK = { pass: 0, warn: 1, fail: 2 };
/** The worst of the graded checks, or null when none could be graded. */
export function overallGrade(grades) {
  const known = grades.filter(Boolean);
  if (!known.length) return null;
  return known.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

export const OVERALL_LABEL = { pass: 'Looks good', warn: 'Worth a look', fail: 'Needs attention' };

/** Segments of "what happened to every read": kept first, then each reason it was dropped. */
export function filterSegments(filtering) {
  const f = filtering || {};
  const raw = [
    { key: 'passed', label: 'Kept', value: f.passed },
    { key: 'low_quality', label: 'Low quality', value: f.low_quality },
    { key: 'too_many_n', label: 'Too many N', value: f.too_many_n },
    { key: 'too_short', label: 'Too short', value: f.too_short },
    { key: 'too_long', label: 'Too long', value: f.too_long },
  ].map((s) => ({ ...s, value: Number.isFinite(Number(s.value)) && s.value !== null ? Math.max(0, Number(s.value)) : 0 }));
  const total = raw.reduce((a, s) => a + s.value, 0);
  return { total, segments: raw.map((s) => ({ ...s, share: total ? s.value / total : 0 })) };
}

/** Sum a histogram into at most `max` bins so a 600-bin array draws as readable bars. */
export function rebin(values, max = 60) {
  if (!Array.isArray(values) || !values.length) return [];
  const size = Math.max(1, Math.ceil(values.length / max));
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    let sum = 0;
    for (let j = i; j < Math.min(values.length, i + size); j += 1) sum += Number(values[j]) || 0;
    out.push({ from: i, to: Math.min(values.length, i + size) - 1, value: sum });
  }
  return out;
}

/** Axis ticks: ~`count` round values covering [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** A y-range that frames the data: padded, snapped to whole units, at least `minSpan` tall, inside [lo, hi]. */
export function frameRange(seriesList, { lo = 0, hi = 100, pad = 3, minSpan = 10 } = {}) {
  let min = Infinity;
  let max = -Infinity;
  for (const vals of seriesList) {
    for (const v of vals || []) {
      if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    }
  }
  if (!Number.isFinite(min)) return { min: lo, max: hi };
  let a = Math.max(lo, Math.floor(min - pad));
  let b = Math.min(hi, Math.ceil(max + pad));
  if (b - a < minSpan) { const mid = (a + b) / 2; a = Math.max(lo, Math.floor(mid - minSpan / 2)); b = Math.min(hi, a + minSpan); }
  return { min: a, max: b };
}
