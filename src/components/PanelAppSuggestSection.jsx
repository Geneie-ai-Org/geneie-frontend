import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  fetchPanelAppSuggestions,
  persistPanelAppSelection,
  resolvePanelAppSelection,
  searchPanelAppPanels,
} from '@/services/backendApi';

/**
 * Analyst-selected gene panels for GA ranking boost (Track 14.6).
 * Manual: suggestions + catalog search; nothing checked until user picks.
 * Automatic: preselect top suggested panel (user can change).
 */
export default function PanelAppSuggestSection({
  confirmedHpoIds = [],
  phenotypeText = '',
  value = null,
  onChange,
  conversationId = null,
  disabled = false,
  isAutomatic = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeAmber, setIncludeAmber] = useState(
    value?.selected_panel_include_amber !== false
  );
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const seqRef = useRef(0);
  const searchSeqRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const userTouchedRef = useRef(false);
  const lastHpoKeyRef = useRef('');

  const selectedIds = useMemo(() => {
    const fromMeta = value?.selected_panels;
    if (!Array.isArray(fromMeta)) return new Set();
    return new Set(fromMeta.map((p) => String(p.panel_id || p).trim()).filter(Boolean));
  }, [value?.selected_panels]);

  const hpoKey = useMemo(
    () =>
      (confirmedHpoIds || [])
        .map((id) => String(id || '').trim().toUpperCase())
        .filter(Boolean)
        .sort()
        .join(','),
    [confirmedHpoIds]
  );

  useEffect(() => {
    if (hpoKey === lastHpoKeyRef.current) return;
    lastHpoKeyRef.current = hpoKey;
    userTouchedRef.current = false;
  }, [hpoKey]);

  // Freeze phenotype text used for API: when HPOs are confirmed, gene overlap is enough —
  // avoid refetch storms from unrelated text churn.
  const suggestPhenotypeText = hpoKey ? '' : String(phenotypeText || '').trim();

  useEffect(() => {
    if (!hpoKey && !suggestPhenotypeText) {
      setSuggestions([]);
      setError('');
      return undefined;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError('');
    // Longer debounce while analysts click many finding chips.
    const delay = hpoKey ? 450 : 300;
    const timer = setTimeout(async () => {
      try {
        const data = await fetchPanelAppSuggestions({
          conversationId,
          hpoIds: hpoKey ? hpoKey.split(',') : [],
          phenotypeText: suggestPhenotypeText,
          includeAmber,
          limit: 10,
        });
        if (seq !== seqRef.current) return;
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (err) {
        if (seq !== seqRef.current) return;
        // Keep prior suggestions on transient errors so the list does not blank out.
        setError(err.message || 'Could not load gene panel suggestions');
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [hpoKey, suggestPhenotypeText, includeAmber, conversationId]);

  // Manual: catalog search when query has 2+ chars.
  useEffect(() => {
    if (isAutomatic) {
      setSearchHits([]);
      setSearchLoading(false);
      return undefined;
    }
    const q = String(searchQuery || '').trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return undefined;
    }
    const seq = ++searchSeqRef.current;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchPanelAppPanels({
          query: q,
          includeAmber,
          limit: 20,
        });
        if (seq !== searchSeqRef.current) return;
        setSearchHits(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (err) {
        if (seq !== searchSeqRef.current) return;
        setSearchHits([]);
        setError(err.message || 'Could not search gene panels');
      } finally {
        if (seq === searchSeqRef.current) setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, includeAmber, isAutomatic]);

  const applySelection = useCallback(
    async (nextIds, amber = includeAmber) => {
      if (typeof onChangeRef.current !== 'function') return;
      setSaving(true);
      setError('');
      try {
        let resolved;
        if (conversationId) {
          resolved = await persistPanelAppSelection(conversationId, {
            panelIds: nextIds,
            includeAmber: amber,
          });
        } else {
          resolved = await resolvePanelAppSelection({
            panelIds: nextIds,
            includeAmber: amber,
          });
        }
        onChangeRef.current({
          selected_panels: resolved.selected_panels || [],
          selected_panel_gene_list: resolved.selected_panel_gene_list || [],
          selected_panel_include_amber:
            resolved.selected_panel_include_amber ?? amber,
        });
      } catch (err) {
        setError(err.message || 'Could not save panel selection');
      } finally {
        setSaving(false);
      }
    },
    [conversationId, includeAmber]
  );

  // Automatic: preselect top suggested panel once per finding set (unless user already chose).
  useEffect(() => {
    if (!isAutomatic || disabled || saving || loading) return;
    if (userTouchedRef.current || selectedIds.size > 0) return;
    const topId = String(suggestions[0]?.panel_id || '').trim();
    if (!topId) return;
    applySelection([topId]);
  }, [
    isAutomatic,
    disabled,
    saving,
    loading,
    suggestions,
    selectedIds.size,
    applySelection,
  ]);

  const togglePanel = (panelId) => {
    if (disabled || saving) return;
    userTouchedRef.current = true;
    const next = new Set(selectedIds);
    if (next.has(panelId)) next.delete(panelId);
    else next.add(panelId);
    applySelection([...next]);
  };

  const suggestionIds = useMemo(
    () => new Set(suggestions.map((s) => String(s.panel_id || '').trim()).filter(Boolean)),
    [suggestions]
  );

  const displayRows = useMemo(() => {
    const q = String(searchQuery || '').trim();
    const searching = !isAutomatic && q.length >= 2;
    if (searching) {
      // Keep already-selected panels visible even if not in search hits.
      const byId = new Map();
      for (const s of searchHits) {
        const id = String(s.panel_id || '').trim();
        if (id) byId.set(id, s);
      }
      for (const p of value?.selected_panels || []) {
        const id = String(p.panel_id || p || '').trim();
        if (id && !byId.has(id)) {
          byId.set(id, {
            panel_id: id,
            panel_name: p.panel_name || id,
            matched_genes: [],
          });
        }
      }
      return [...byId.values()];
    }
    // Suggestions + any selected panels not in the top list (e.g. from prior search).
    const byId = new Map();
    for (const s of suggestions) {
      const id = String(s.panel_id || '').trim();
      if (id) byId.set(id, { ...s, _fromSuggest: true });
    }
    for (const p of value?.selected_panels || []) {
      const id = String(p.panel_id || p || '').trim();
      if (id && !byId.has(id)) {
        byId.set(id, {
          panel_id: id,
          panel_name: p.panel_name || id,
          matched_genes: [],
          _fromSuggest: false,
        });
      }
    }
    return [...byId.values()];
  }, [isAutomatic, searchQuery, searchHits, suggestions, value?.selected_panels]);

  if (!hpoKey && !String(phenotypeText || '').trim()) return null;

  const searching = !isAutomatic && String(searchQuery || '').trim().length >= 2;

  return (
    <div
      className="px-2.5 py-2 rounded-lg border text-xs space-y-2"
      style={{ borderColor: 'var(--border-default)', background: 'var(--bg-muted)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Gene panel suggestions
          </div>
          <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {isAutomatic
              ? 'Optional — top panel is pre-selected for ranking. Change or clear if needed.'
              : 'Optional — select panels to boost ranking. Search if the panel you need is not listed.'}
          </p>
        </div>
        <label
          className="inline-flex items-center gap-1.5 text-2xs shrink-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          <input
            type="checkbox"
            checked={includeAmber}
            disabled={disabled || saving}
            onChange={(e) => {
              const next = e.target.checked;
              setIncludeAmber(next);
              if (selectedIds.size > 0) {
                userTouchedRef.current = true;
                applySelection([...selectedIds], next);
              }
            }}
          />
          Include lower-confidence genes
        </label>
      </div>

      {!isAutomatic && (
        <input
          type="search"
          value={searchQuery}
          disabled={disabled}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search panels by name…"
          className="w-full px-2.5 h-8 border rounded-md text-2xs"
          style={{
            borderColor: 'var(--border-default)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
          }}
        />
      )}

      {(loading || searchLoading) && (
        <p className="text-2xs inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          {searchLoading ? 'Searching panels…' : 'Loading panel suggestions…'}
        </p>
      )}

      {!loading && !searching && suggestions.length === 0 && !error && (
        <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          No gene panels matched these findings.
          {!isAutomatic ? ' Use search to pick a panel, or continue without a boost.' : ' Ranking will run without a panel boost.'}
        </p>
      )}

      {!searchLoading && searching && searchHits.length === 0 && !error && (
        <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          No panels matched “{String(searchQuery).trim()}”.
        </p>
      )}

      {error && (
        <p className="text-2xs" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {displayRows.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {displayRows.map((s) => {
            const id = String(s.panel_id || '').trim();
            if (!id) return null;
            const checked = selectedIds.has(id);
            const geneN = Array.isArray(s.matched_genes) ? s.matched_genes.length : 0;
            const fromSuggest = suggestionIds.has(id) || s._fromSuggest;
            return (
              <label
                key={id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md border text-2xs cursor-pointer"
                style={{
                  borderColor: checked ? 'var(--accent-teal)' : 'var(--border-default)',
                  background: checked
                    ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)'
                    : 'var(--bg-surface-raised)',
                  color: 'var(--text-primary)',
                  opacity: disabled || saving ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  disabled={disabled || saving}
                  onChange={() => togglePanel(id)}
                />
                <span className="min-w-0">
                  <span className="font-medium">{s.panel_name || id}</span>
                  {geneN > 0 ? (
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {' '}
                      · {geneN} {fromSuggest && !searching ? 'matching ' : ''}
                      gene{geneN === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <p className="text-2xs" style={{ color: 'var(--text-secondary)' }}>
          {selectedIds.size} panel{selectedIds.size === 1 ? '' : 's'} selected
          {Array.isArray(value?.selected_panel_gene_list) && value.selected_panel_gene_list.length
            ? ` · ${value.selected_panel_gene_list.length} genes for ranking boost`
            : ''}
          {saving ? ' · saving…' : ''}
        </p>
      )}
    </div>
  );
}
