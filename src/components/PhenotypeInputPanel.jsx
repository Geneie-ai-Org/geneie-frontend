/**
 * Germline phenotype entry: Findings | Disease tabs + live HPO chips.
 * Confirmed HPO IDs are what Exomiser prefers when saved on sample_metadata.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { resolveHpoTerms, suggestPhenotypePhrases } from '@/services/mongodbApi';

export const PHENOTYPE_MODE_FINDINGS = 'findings';
export const PHENOTYPE_MODE_DISEASE = 'disease';

/** True when free-text or confirmed HPO IDs are present. */
export function sampleHasPhenotype(sampleMetadata) {
  const meta = sampleMetadata || {};
  const confirmed = meta?.phenotype_hpo?.confirmed_ids;
  if (Array.isArray(confirmed) && confirmed.some((id) => String(id || '').startsWith('HP:'))) {
    return true;
  }
  return Boolean(
    String(meta.phenotype || '').trim() ||
      String(meta.phenotype_findings || '').trim() ||
      String(meta.phenotype_disease || '').trim()
  );
}

export function buildPhenotypeFieldsForSave({
  mode,
  findingsText,
  diseaseText,
  candidates,
}) {
  const isDisease = mode === PHENOTYPE_MODE_DISEASE;
  const findings = isDisease ? '' : String(findingsText || '').trim();
  const disease = isDisease ? String(diseaseText || '').trim() : '';
  const phenotype = isDisease ? disease : findings;
  const selected = (candidates || []).filter((c) => c.selected);
  const confirmed_ids = selected.map((c) => c.hpo_id).filter(Boolean);
  return {
    phenotype_mode: isDisease ? PHENOTYPE_MODE_DISEASE : PHENOTYPE_MODE_FINDINGS,
    phenotype_findings: findings,
    phenotype_disease: disease,
    phenotype,
    phenotype_hpo: {
      confirmed_ids,
      candidates: candidates || [],
      resolution_mode: isDisease ? 'somatic' : 'germline',
      disease_match: null,
      resolved_at: confirmed_ids.length ? new Date().toISOString() : null,
    },
  };
}

function mapResolveToCandidates(payload, { defaultSelected }) {
  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  const ids = Array.isArray(payload?.hpo_ids) ? payload.hpo_ids : [];
  const byId = new Map();
  for (const m of matches) {
    const hid = String(m?.hpo_id || '').trim().toUpperCase();
    if (!hid.startsWith('HP:') || byId.has(hid)) continue;
    byId.set(hid, {
      hpo_id: hid,
      hpo_name: m.hpo_name || '',
      matched_phrase: m.matched_phrase || '',
      match_score: m.match_score,
      match_type: m.match_type || '',
      selected: Boolean(defaultSelected),
    });
  }
  for (const id of ids) {
    const hid = String(id || '').trim().toUpperCase();
    if (!hid.startsWith('HP:') || byId.has(hid)) continue;
    byId.set(hid, {
      hpo_id: hid,
      hpo_name: '',
      matched_phrase: '',
      match_score: null,
      match_type: '',
      selected: Boolean(defaultSelected),
    });
  }
  return Array.from(byId.values());
}

/**
 * Controlled phenotype panel.
 *
 * value shape:
 * {
 *   phenotype_mode, phenotype_findings, phenotype_disease, phenotype,
 *   phenotype_hpo?: { confirmed_ids, candidates, disease_match, ... }
 * }
 */
export default function PhenotypeInputPanel({ value, onChange, disabled = false }) {
  const mode = value?.phenotype_mode === PHENOTYPE_MODE_DISEASE
    ? PHENOTYPE_MODE_DISEASE
    : PHENOTYPE_MODE_FINDINGS;
  const findingsText = value?.phenotype_findings ?? (mode === PHENOTYPE_MODE_FINDINGS ? (value?.phenotype || '') : '');
  const diseaseText = value?.phenotype_disease ?? (mode === PHENOTYPE_MODE_DISEASE ? (value?.phenotype || '') : '');
  const candidates = value?.phenotype_hpo?.candidates || [];
  const diseaseMatch = value?.phenotype_hpo?.disease_match || null;

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState({ suggested_phrases: [], ambiguous: [], too_vague: [] });
  const resolveSeq = useRef(0);
  const debounceRef = useRef(null);
  const lastResolvedKey = useRef('');
  const onChangeRef = useRef(onChange);
  const stateRef = useRef({ mode, findingsText, diseaseText, candidates, diseaseMatch });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const activeText = mode === PHENOTYPE_MODE_DISEASE ? diseaseText : findingsText;
  const selectedCount = useMemo(
    () => candidates.filter((c) => c.selected).length,
    [candidates]
  );

  const emit = useCallback((patch) => {
    const cur = stateRef.current;
    const nextMode = patch.phenotype_mode ?? cur.mode;
    const nextFindings =
      patch.phenotype_findings !== undefined ? patch.phenotype_findings : cur.findingsText;
    const nextDisease =
      patch.phenotype_disease !== undefined ? patch.phenotype_disease : cur.diseaseText;
    const nextCandidates =
      patch.candidates !== undefined
        ? patch.candidates
        : patch.phenotype_hpo?.candidates !== undefined
          ? patch.phenotype_hpo.candidates
          : cur.candidates;
    const nextDiseaseMatch =
      patch.disease_match !== undefined
        ? patch.disease_match
        : patch.phenotype_hpo?.disease_match !== undefined
          ? patch.phenotype_hpo.disease_match
          : cur.diseaseMatch;

    const fields = buildPhenotypeFieldsForSave({
      mode: nextMode,
      findingsText: nextFindings,
      diseaseText: nextDisease,
      candidates: nextCandidates,
    });
    if (nextDiseaseMatch) {
      fields.phenotype_hpo = {
        ...fields.phenotype_hpo,
        disease_match: nextDiseaseMatch,
        hpo_resolution_method:
          patch.hpo_resolution_method ?? cur.hpoResolutionMethod ?? null,
        propagated_from_related_records:
          patch.propagated_from_related_records ?? cur.propagatedFromRelated ?? [],
      };
    } else if (patch.phenotype_hpo) {
      fields.phenotype_hpo = {
        ...fields.phenotype_hpo,
        ...patch.phenotype_hpo,
        confirmed_ids: fields.phenotype_hpo.confirmed_ids,
        candidates: nextCandidates,
      };
    }
    onChangeRef.current?.(fields);
  }, []);

  useEffect(() => {
    stateRef.current = {
      mode,
      findingsText,
      diseaseText,
      candidates,
      diseaseMatch,
      hpoResolutionMethod: value?.phenotype_hpo?.hpo_resolution_method,
      propagatedFromRelated: value?.phenotype_hpo?.propagated_from_related_records || [],
    };
  }, [
    mode,
    findingsText,
    diseaseText,
    candidates,
    diseaseMatch,
    value?.phenotype_hpo?.hpo_resolution_method,
    value?.phenotype_hpo?.propagated_from_related_records,
  ]);

  const switchMode = (nextMode) => {
    if (nextMode === mode || disabled) return;
    setSuggestions({ suggested_phrases: [], ambiguous: [], too_vague: [] });
    setResolveError('');
    lastResolvedKey.current = '';
    // Mutual exclusive: clear both texts and chips on switch.
    emit({
      phenotype_mode: nextMode,
      phenotype_findings: '',
      phenotype_disease: '',
      candidates: [],
      disease_match: null,
    });
  };

  useEffect(() => {
    if (disabled) return undefined;
    const text = String(activeText || '').trim();
    const key = `${mode}::${text}`;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text) {
      if (lastResolvedKey.current !== key) {
        lastResolvedKey.current = key;
        emit({ candidates: [], disease_match: null });
      }
      setResolveError('');
      setResolving(false);
      return undefined;
    }

    if (key === lastResolvedKey.current) return undefined;

    debounceRef.current = setTimeout(async () => {
      const seq = ++resolveSeq.current;
      setResolving(true);
      setResolveError('');
      try {
        const payload = await resolveHpoTerms({ text, forceMode: mode });
        if (seq !== resolveSeq.current) return;
        const defaultSelected = mode !== PHENOTYPE_MODE_DISEASE;
        const nextCandidates = mapResolveToCandidates(payload, { defaultSelected });
        lastResolvedKey.current = key;
        emit({
          candidates: nextCandidates,
          disease_match: payload.disease_match || null,
          hpo_resolution_method: payload.hpo_resolution_method,
          propagated_from_related_records: payload.propagated_from_related_records || [],
        });
      } catch (err) {
        if (seq !== resolveSeq.current) return;
        setResolveError(err?.message || 'Could not resolve HPO terms');
      } finally {
        if (seq === resolveSeq.current) setResolving(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeText, mode, disabled, emit]);

  const toggleCandidate = (hpoId) => {
    const next = candidates.map((c) =>
      c.hpo_id === hpoId ? { ...c, selected: !c.selected } : c
    );
    emit({ candidates: next });
  };

  const setAllSelected = (selected) => {
    emit({ candidates: candidates.map((c) => ({ ...c, selected })) });
  };

  const onTextChange = (text) => {
    lastResolvedKey.current = '';
    if (mode === PHENOTYPE_MODE_DISEASE) {
      emit({ phenotype_disease: text, phenotype_findings: '', candidates: [] });
    } else {
      emit({ phenotype_findings: text, phenotype_disease: '', candidates: [] });
    }
  };

  const runSuggest = async () => {
    if (mode !== PHENOTYPE_MODE_FINDINGS || !findingsText.trim() || disabled) return;
    setSuggesting(true);
    try {
      const data = await suggestPhenotypePhrases({ text: findingsText.trim() });
      setSuggestions({
        suggested_phrases: data.suggested_phrases || [],
        ambiguous: data.ambiguous || [],
        too_vague: data.too_vague || [],
      });
    } catch (err) {
      setSuggestions({
        suggested_phrases: [],
        ambiguous: [],
        too_vague: [],
        error: err?.message,
      });
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestion = (phrase) => {
    const p = String(phrase || '').trim();
    if (!p) return;
    lastResolvedKey.current = '';
    const existing = findingsText.trim();
    const next = existing
      ? existing.toLowerCase().includes(p.toLowerCase())
        ? existing
        : `${existing}, ${p}`
      : p;
    emit({ phenotype_findings: next, phenotype_disease: '', candidates: [] });
    setSuggestions((prev) => ({
      ...prev,
      suggested_phrases: (prev.suggested_phrases || []).filter((x) => x !== phrase),
    }));
  };

  const inputStyle = {
    borderColor: 'var(--border-default)',
    background: 'var(--bg-input)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: 'var(--text-primary)',
  };

  const tabBtn = (id, label) => {
    const active = mode === id;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => switchMode(id)}
        className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all"
        style={{
          background: active ? 'var(--bg-surface-raised)' : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
          boxShadow: active ? 'var(--shadow-sm)' : 'none',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <label className="flex items-baseline gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        Phenotype
        <span className="text-2xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
          (enables phenotype-driven prioritization)
        </span>
      </label>

      <div
        className="flex p-0.5 rounded-lg gap-0.5"
        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-default)' }}
      >
        {tabBtn(PHENOTYPE_MODE_FINDINGS, 'Findings')}
        {tabBtn(PHENOTYPE_MODE_DISEASE, 'Disease')}
      </div>

      <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
        {mode === PHENOTYPE_MODE_DISEASE
          ? 'Enter a disease name or ORPHA/OMIM/MONDO ID. Select only findings present in this patient.'
          : 'Enter short clinical findings (e.g. ptosis, proximal muscle weakness). Switching tabs clears the other.'}
      </p>

      <textarea
        value={activeText}
        onChange={(e) => onTextChange(e.target.value)}
        disabled={disabled}
        placeholder={
          mode === PHENOTYPE_MODE_DISEASE
            ? 'Disease name or ID (e.g. Noonan syndrome, ORPHA:648)…'
            : 'Describe clinical findings…'
        }
        rows={3}
        className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-1 resize-none text-sm transition-all"
        style={inputStyle}
      />

      {mode === PHENOTYPE_MODE_FINDINGS && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || suggesting || !findingsText.trim()}
            onClick={runSuggest}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium rounded-md border transition-all"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-secondary)',
              background: 'var(--bg-surface-raised)',
            }}
          >
            {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Improve for HPO matching
          </button>
        </div>
      )}

      {mode === PHENOTYPE_MODE_FINDINGS &&
        (suggestions.suggested_phrases?.length > 0 ||
          suggestions.ambiguous?.length > 0 ||
          suggestions.too_vague?.length > 0) && (
          <div className="space-y-1.5 p-2 rounded-lg border" style={{ borderColor: 'var(--border-default)' }}>
            {suggestions.suggested_phrases?.length > 0 && (
              <div>
                <div className="text-2xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Suggested phrases — click to add
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.suggested_phrases.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => acceptSuggestion(p)}
                      className="px-2 py-0.5 text-2xs rounded-full border"
                      style={{
                        borderColor: 'var(--accent-teal)',
                        color: 'var(--accent-teal)',
                        background: 'transparent',
                      }}
                    >
                      + {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {suggestions.ambiguous?.length > 0 && (
              <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                Ambiguous: {suggestions.ambiguous.join('; ')}
              </p>
            )}
            {suggestions.too_vague?.length > 0 && (
              <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                Too vague: {suggestions.too_vague.join('; ')}
              </p>
            )}
          </div>
        )}

      {mode === PHENOTYPE_MODE_DISEASE && diseaseMatch?.name && (
        <div
          className="px-2.5 py-2 rounded-lg border text-xs"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-muted)' }}
        >
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Matched: {diseaseMatch.name}
          </div>
          <div style={{ color: 'var(--text-tertiary)' }}>
            {[diseaseMatch.id, diseaseMatch.score != null ? `score ${Number(diseaseMatch.score).toFixed(2)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="mt-1 text-2xs" style={{ color: 'var(--text-secondary)' }}>
            Select findings present in this patient (none selected by default).
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          {resolving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Resolving HPO terms…
            </span>
          ) : candidates.length > 0 ? (
            <span>
              Detected HPO terms ({selectedCount}/{candidates.length} selected)
            </span>
          ) : activeText.trim() ? (
            <span>No HPO terms detected yet</span>
          ) : null}
        </div>
        {candidates.length > 0 && (
          <div className="flex gap-2 text-2xs">
            <button type="button" className="underline" style={{ color: 'var(--text-secondary)' }} onClick={() => setAllSelected(true)} disabled={disabled}>
              Select all
            </button>
            <button type="button" className="underline" style={{ color: 'var(--text-secondary)' }} onClick={() => setAllSelected(false)} disabled={disabled}>
              Clear
            </button>
          </div>
        )}
      </div>

      {mode === PHENOTYPE_MODE_DISEASE && activeText.trim() && !resolving && selectedCount === 0 && candidates.length > 0 && (
        <p className="text-2xs" style={{ color: 'var(--warning, #b45309)' }}>
          Select at least one finding for this patient — otherwise phenotype prioritization will fall back to free-text matching.
        </p>
      )}

      {resolveError && (
        <p className="text-2xs" style={{ color: 'var(--error)' }}>
          {resolveError}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {candidates.map((c) => (
            <button
              key={c.hpo_id}
              type="button"
              disabled={disabled}
              onClick={() => toggleCandidate(c.hpo_id)}
              title={c.matched_phrase ? `Matched: ${c.matched_phrase}` : c.hpo_id}
              className="px-2 py-1 text-2xs rounded-md border text-left transition-all"
              style={{
                borderColor: c.selected ? 'var(--accent-teal)' : 'var(--border-default)',
                background: c.selected ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)' : 'var(--bg-surface-raised)',
                color: 'var(--text-primary)',
                opacity: c.selected ? 1 : 0.7,
              }}
            >
              <span className="font-medium">{c.selected ? '✓ ' : ''}{c.hpo_id}</span>
              {c.hpo_name ? <span style={{ color: 'var(--text-secondary)' }}> — {c.hpo_name}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
