/**
 * Side-by-side config compare: SSE client for the admin tuning mode.
 *
 * Mirrors streamExploratory.js deliberately - same self-contained frame parser, same
 * onEvent callback shape, same "one concern per file" separation from the chat hook. The ONLY new
 * logic is demultiplexing on `ev.col`.
 *
 * The per-event shape is IDENTICAL to the single-column chat stream (delta / sources / meta / done /
 * error) with one extra field, `col`. That is the whole contract: the backend tags existing events
 * rather than inventing a dialect, so nothing here has to understand a new event type.
 *
 * ONE THING THAT IS EASY TO GET WRONG, so it is spelled out:
 * there are THREE kinds of "done" and they mean different things.
 *
 *   { type:'done', col:'baseline'  }  -> THAT column finished; carries ITS full assembled `response`
 *   { type:'done', col:'candidate' }  -> the other column finished
 *   { type:'done' }  (no col)          -> BOTH columns finished; the stream is closing
 *
 * A naive `if (ev.type === 'done') return;` would swallow the two per-column events and throw away
 * each column's final assembled answer, which is the only place the full text is guaranteed to be.
 * So the `col` check has to come FIRST. (This is not hypothetical - it is what the plan's sample
 * snippet did, and the live stream demonstrably emits all three.)
 *
 * `column_done` needs no handling: it arrives AFTER that column's own `done`, so the column is already
 * marked finished. It is mentioned here only so nobody adds a redundant branch for it later.
 */

import { apiUrl } from '@/config/api';

export const COLUMNS = ['baseline', 'candidate'];

export const COLUMN_LABELS = {
  baseline: 'Global config',
  candidate: 'Your changes',
};

/** The tunable namespaces the backend allow-lists. Anything else is dropped server-side anyway. */
export const TUNABLE_PREFIXES = ['persona.', 'prompt.', 'pack.', 'agent.', 'knobs.'];
export const TUNABLE_EXACT = ['model.smart', 'model.fast'];

export function isTunableKey(key) {
  if (!key) return false;
  if (TUNABLE_EXACT.includes(key)) return true;
  return TUNABLE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Header values must be ISO-8859-1, so a prompt with curly quotes or an emoji made fetch() throw
 * before the request left the browser. Escape every non-ASCII character as a JSON \uXXXX escape:
 * the header is plain ASCII and the backend's json.loads decodes it back to the same text.
 */
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Load balancers reject a single header much over 16 KB, well below the backend's own 64 KB cap. */
export const MAX_OVERRIDE_HEADER_BYTES = 16 * 1024;

/** Build the X-Config-Overrides header value, or null when there is nothing to send. */
export function buildOverridesHeader(overrides) {
  const clean = {};
  for (const [k, v] of Object.entries(overrides || {})) {
    if (isTunableKey(k) && v !== undefined && v !== null && v !== '') clean[k] = v;
  }
  return Object.keys(clean).length ? asciiJson(clean) : null;
}

/**
 * Stream a two-column comparison.
 *
 * onEvent(evt) receives every event with its `col` intact. Callers accumulate per column; see
 * `createColumnState` for the accumulator shape and the done-handling contract.
 */
export async function streamCompare({ path, body, overrides, authHeaders = {}, deviceId, onEvent, signal }) {
  const url = apiUrl(path);
  const headers = { 'Content-Type': 'application/json', ...authHeaders };
  if (deviceId) headers['X-Device-Id'] = deviceId;
  const overrideHeader = buildOverridesHeader(overrides);
  if (overrideHeader && overrideHeader.length > MAX_OVERRIDE_HEADER_BYTES) {
    throw new Error(
      `Your changes are too large to send (${Math.round(overrideHeader.length / 1024)} KB, limit 16 KB). Revert some keys and try again.`,
    );
  }
  if (overrideHeader) headers['X-Config-Overrides'] = overrideHeader;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.detail ? ` - ${typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)}` : '';
    } catch { /* ignore */ }
    throw new Error(`compare stream failed: ${res.status}${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      let evt;
      try {
        evt = JSON.parse(line.slice(6));
      } catch {
        continue; // ignore malformed frame
      }
      onEvent(evt);
    }
  }
}

/**
 * Per-column accumulator. `finish(col, response)` is called on a per-column done, and
 * `allFinished()` on the terminal untagged done.
 */
export function createColumnState() {
  const startedAt = Date.now(); // both columns start together; finishedAt is per column
  const state = { baseline: { text: '', meta: null, sources: null, error: null, done: false, startedAt, finishedAt: null },
                  candidate: { text: '', meta: null, sources: null, error: null, done: false, startedAt, finishedAt: null } };
  return {
    state,
    apply(evt) {
      const col = evt.col;
      if (!col || !state[col]) return;
      const c = state[col];
      if (evt.type === 'delta') c.text += evt.text || '';
      else if (evt.type === 'sources') c.sources = evt.sources;
      else if (evt.type === 'meta') c.meta = evt;
      else if (evt.type === 'error') { c.error = evt.detail || evt; c.done = true; c.finishedAt = Date.now(); }
      else if (evt.type === 'done') { c.done = true; c.finishedAt = Date.now(); if (evt.response) c.text = evt.response; }
    },
    differ() {
      return state.baseline.text !== state.candidate.text;
    },
  };
}
