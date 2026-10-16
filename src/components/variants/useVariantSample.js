import { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders, parseApiErrorDetail } from '@/services/backendApi';
import { apiUrl } from '@/config/api';
import { readTsvStream } from '@/lib/tsvStream';
import { NUM_RE, isMissing } from '@/lib/variantFormat';

/**
 * A small read-only look at the variants currently in scope, for distributions inside the filter editors.
 *
 * It reuses the two read-only export calls the Results tab already makes (eligibility, then the TSV stream)
 * and stops reading after MAX_ROWS rows, so no new backend is involved and a big file is never downloaded
 * whole. The rows are the CURRENT working set (what the last Apply left in scope), not the full file, and
 * the editors say so. Requests are shared per conversation + scope key, so two editors never fetch twice.
 */
const MAX_ROWS = 500;
const cache = new Map(); // key -> Promise<{ header, rows, truncated, total }>

function fetchSample(conversationId) {
  return (async () => {
    const headers = await getAuthHeaders();
    const id = encodeURIComponent(conversationId);
    const elig = await fetch(apiUrl(`/api/export-variants-eligibility/${id}`), { headers });
    const eligData = await elig.json().catch(() => ({}));
    if (!elig.ok) throw new Error(parseApiErrorDetail(eligData.detail) || 'Eligibility check failed');
    if (eligData.can_export !== true) return { header: [], rows: [], truncated: false, total: null, blocked: true };
    const res = await fetch(apiUrl(`/api/export-variants/${id}`), { headers });
    if (!res.ok) throw new Error('Sample unavailable');
    const out = await readTsvStream(res, { maxRows: MAX_ROWS });
    return { ...out, total: eligData.row_count ?? null };
  })();
}

export function useVariantSample({ conversationId, enabled, scopeKey }) {
  const [state, setState] = useState({ status: 'idle', data: null, key: null });
  const key = conversationId ? `${conversationId}|${scopeKey}` : null;

  useEffect(() => {
    if (!enabled || !key) return undefined;
    let live = true;
    let p = cache.get(key);
    if (!p) {
      p = fetchSample(conversationId);
      cache.set(key, p);
      p.catch(() => cache.delete(key)); // a failure may be retried on the next open
    }
    setState((s) => (s.key === key && s.status === 'ready' ? s : { status: 'loading', data: s.key === key ? s.data : null, key }));
    p.then((data) => { if (live) setState({ status: data.blocked ? 'unavailable' : 'ready', data, key }); })
      .catch(() => { if (live) setState({ status: 'unavailable', data: null, key }); });
    return () => { live = false; };
  }, [enabled, key, conversationId]);

  const data = state.key === key ? state.data : null;
  const status = state.key === key ? state.status : 'idle';

  return useMemo(() => {
    const colIdx = new Map();
    (data?.header || []).forEach((h, i) => colIdx.set(h, i));
    const numCache = new Map();
    const catCache = new Map();
    return {
      status,
      n: data?.rows?.length || 0,
      total: data?.total ?? null,
      truncated: !!data?.truncated,
      /** Finite numbers in the column, or null when the column is absent or not numeric. */
      numbers(col) {
        if (!data || !colIdx.has(col)) return null;
        if (numCache.has(col)) return numCache.get(col);
        const i = colIdx.get(col);
        const out = [];
        let seen = 0;
        for (const r of data.rows) {
          const v = r[i];
          if (isMissing(v)) continue;
          seen += 1;
          const t = String(v).trim();
          if (NUM_RE.test(t)) out.push(Number(t));
        }
        const res = out.length && out.length / seen >= 0.8 ? out : null;
        numCache.set(col, res);
        return res;
      },
      /** Map of value -> count ("Empty" for blanks), or null when the column is absent. */
      counts(col) {
        if (!data || !colIdx.has(col)) return null;
        if (catCache.has(col)) return catCache.get(col);
        const i = colIdx.get(col);
        const m = new Map();
        for (const r of data.rows) {
          const v = r[i] == null || r[i] === '' ? 'Empty' : String(r[i]);
          m.set(v, (m.get(v) || 0) + 1);
        }
        catCache.set(col, m);
        return m;
      },
    };
  }, [data, status]);
}

/** "the first 500 of 949 variants in scope" or "all 949 variants in scope". */
export function sampleCaption(sample) {
  if (!sample || !sample.n) return '';
  if (sample.truncated && sample.total) return `the first ${sample.n.toLocaleString()} of ${sample.total.toLocaleString()} variants in scope`;
  if (sample.truncated) return `the first ${sample.n.toLocaleString()} variants in scope`;
  return `all ${sample.n.toLocaleString()} variants in scope`;
}
