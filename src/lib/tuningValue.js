/**
 * Helpers for the tuning config editor.
 *
 * Overrides travel to the backend as plain scalar strings, so a typo in a number or a boolean is easy
 * to make and hard to notice. `validateValue` checks a draft against the key's declared type before it is
 * applied; `lineDiff` shows what changed in a long prompt without making the admin eyeball two panes.
 */

/** @returns {{ ok: boolean, error?: string, value?: string }} value is the normalised text to store. */
export function validateValue(type, raw) {
  const text = raw ?? '';
  if (text.trim() === '') return { ok: true, value: '' }; // blank = use the baseline
  switch (type) {
    case 'bool': {
      const v = text.trim().toLowerCase();
      if (v === 'true' || v === 'false') return { ok: true, value: v };
      return { ok: false, error: 'Use true or false.' };
    }
    case 'int':
      return /^-?\d+$/.test(text.trim())
        ? { ok: true, value: String(parseInt(text.trim(), 10)) }
        : { ok: false, error: 'Use a whole number, for example 10.' };
    case 'float': {
      const n = Number(text.trim());
      return text.trim() !== '' && Number.isFinite(n)
        ? { ok: true, value: String(n) }
        : { ok: false, error: 'Use a number, for example 0.25.' };
    }
    case 'json':
      try {
        JSON.parse(text);
        return { ok: true, value: text };
      } catch (e) {
        return { ok: false, error: `Not valid JSON: ${String(e.message).replace(/^JSON\.parse: /, '')}` };
      }
    default:
      return { ok: true, value: text };
  }
}

export const TYPE_LABEL = { bool: 'true / false', int: 'whole number', float: 'number', json: 'JSON', string: 'text' };

/** Pretty-print a JSON string; returns null when it does not parse. */
export function formatJson(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

const MAX_CELLS = 4_000_000;

/**
 * Line diff by longest common subsequence.
 * @returns {{ op: ' ' | '+' | '-', text: string }[]}  '+' only in `b` (your value), '-' only in `a` (baseline).
 * Falls back to "everything removed, everything added" when the inputs are too large to compare cheaply.
 */
export function lineDiff(a, b) {
  const x = a === '' ? [] : String(a).split('\n');
  const y = b === '' ? [] : String(b).split('\n');
  const n = x.length;
  const m = y.length;
  if (n * m > MAX_CELLS) {
    return [...x.map((text) => ({ op: '-', text })), ...y.map((text) => ({ op: '+', text }))];
  }
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      t[i * w + j] = x[i] === y[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ op: ' ', text: x[i] }); i += 1; j += 1; }
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) { out.push({ op: '-', text: x[i] }); i += 1; }
    else { out.push({ op: '+', text: y[j] }); j += 1; }
  }
  while (i < n) { out.push({ op: '-', text: x[i] }); i += 1; }
  while (j < m) { out.push({ op: '+', text: y[j] }); j += 1; }
  return out;
}

/** Counts for the diff summary line. */
export function diffStats(rows) {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.op === '+') added += 1;
    else if (r.op === '-') removed += 1;
  }
  return { added, removed };
}
