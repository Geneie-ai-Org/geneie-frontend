import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  fetchPanelAppSuggestions,
  persistPanelAppSelection,
  resolvePanelAppSelection,
} from '@/services/backendApi';

/**
 * Analyst-selected PanelApp panels for GA gene boost (Track 14.6).
 * Never auto-applies — user must check panels. Selection lands on sample_metadata.
 */
export default function PanelAppSuggestSection({
  confirmedHpoIds = [],
  phenotypeText = '',
  value = null,
  onChange,
  conversationId = null,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeAmber, setIncludeAmber] = useState(
    value?.selected_panel_include_amber !== false
  );
  const [saving, setSaving] = useState(false);
  const seqRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    if (!hpoKey && !String(phenotypeText || '').trim()) {
      setSuggestions([]);
      setError('');
      return undefined;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const data = await fetchPanelAppSuggestions({
          conversationId,
          hpoIds: hpoKey ? hpoKey.split(',') : [],
          phenotypeText,
          includeAmber,
          limit: 10,
        });
        if (seq !== seqRef.current) return;
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
      } catch (err) {
        if (seq !== seqRef.current) return;
        setSuggestions([]);
        setError(err.message || 'Could not load PanelApp suggestions');
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [hpoKey, phenotypeText, includeAmber, conversationId]);

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

  const togglePanel = (panelId) => {
    if (disabled || saving) return;
    const next = new Set(selectedIds);
    if (next.has(panelId)) next.delete(panelId);
    else next.add(panelId);
    applySelection([...next]);
  };

  if (!hpoKey && !String(phenotypeText || '').trim()) return null;

  return (
    <div
      className="px-2.5 py-2 rounded-lg border text-xs space-y-2"
      style={{ borderColor: 'var(--border-default)', background: 'var(--bg-muted)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
            PanelApp suggestions (for GA)
          </div>
          <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Optional — select panels to boost GA ranking. Nothing is applied until you check a
            panel.
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
                applySelection([...selectedIds], next);
              }
            }}
          />
          Include Amber genes
        </label>
      </div>

      {loading && (
        <p className="text-2xs inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 className="w-3 h-3 animate-spin" /> Loading panel suggestions…
        </p>
      )}

      {!loading && suggestions.length === 0 && !error && (
        <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          No PanelApp panels matched these findings. GA will run without a panel boost.
        </p>
      )}

      {error && (
        <p className="text-2xs" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {suggestions.map((s) => {
            const id = String(s.panel_id || '').trim();
            if (!id) return null;
            const checked = selectedIds.has(id);
            const geneN = Array.isArray(s.matched_genes) ? s.matched_genes.length : 0;
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
                      · {geneN} matching gene{geneN === 1 ? '' : 's'}
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
            ? ` · ${value.selected_panel_gene_list.length} genes for GA boost`
            : ''}
          {saving ? ' · saving…' : ''}
        </p>
      )}
    </div>
  );
}
