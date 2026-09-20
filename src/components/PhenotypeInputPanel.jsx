/**
 * Germline phenotype entry: Findings | Disease tabs + live HPO chips.
 * Confirmed HPO IDs are what Exomiser prefers when saved on sample_metadata.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { resolveHpoTerms, suggestPhenotypePhrases } from '@/services/mongodbApi';

export const PHENOTYPE_MODE_FINDINGS = 'findings';
export const PHENOTYPE_MODE_DISEASE = 'disease';

/** Mode-of-inheritance / non-finding HPO IDs commonly dumped in disease annotations. */
const INHERITANCE_HPO_IDS = new Set([
  'HP:0000005', // Mode of inheritance
  'HP:0000006', // Autosomal dominant inheritance
  'HP:0000007', // Autosomal recessive inheritance
  'HP:0001417', // X-linked inheritance
  'HP:0001419', // X-linked recessive inheritance
  'HP:0001423', // X-linked dominant inheritance
  'HP:0001426', // Multifactorial inheritance
  'HP:0001427', // Mitochondrial inheritance
  'HP:0001428', // Somatic mutation
  'HP:0001450', // Y-linked inheritance
  'HP:0001470', // Sex-limited autosomal dominant
  'HP:0003745', // Sporadic
  'HP:0010985', // Gonosomal inheritance
  'HP:0032113', // Semidominant
]);

const INHERITANCE_NAME_RE =
  /\b(inheritance|autosomal|x-linked|y-linked|mitochondrial|multifactorial|somatic mutation|sporadic|digenic|oligogenic|codominant)\b/i;

function isInheritanceLikeHpo(candidate) {
  const id = String(candidate?.hpo_id || '').toUpperCase();
  if (INHERITANCE_HPO_IDS.has(id)) return true;
  return INHERITANCE_NAME_RE.test(String(candidate?.hpo_name || ''));
}

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
  diseaseMatch = null,
  topCandidates = [],
  hpoResolutionMethod = null,
  propagatedFromRelated = [],
}) {
  const isDisease = mode === PHENOTYPE_MODE_DISEASE;
  // Keep raw draft text (do NOT trim) so trailing spaces while typing are preserved.
  const findings = isDisease ? '' : String(findingsText ?? '');
  const disease = isDisease ? String(diseaseText ?? '') : '';
  const phenotype = (isDisease ? disease : findings).trim();
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
      disease_match: diseaseMatch || null,
      top_candidates: topCandidates || [],
      hpo_resolution_method: hpoResolutionMethod,
      propagated_from_related_records: propagatedFromRelated || [],
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
 * Controlled phenotype panel with local draft so resolve does not block typing.
 */
export default function PhenotypeInputPanel({ value, onChange, disabled = false }) {
  const mode = value?.phenotype_mode === PHENOTYPE_MODE_DISEASE
    ? PHENOTYPE_MODE_DISEASE
    : PHENOTYPE_MODE_FINDINGS;
  const findingsText = value?.phenotype_findings ?? (mode === PHENOTYPE_MODE_FINDINGS ? (value?.phenotype || '') : '');
  const diseaseText = value?.phenotype_disease ?? (mode === PHENOTYPE_MODE_DISEASE ? (value?.phenotype || '') : '');
  const candidates = value?.phenotype_hpo?.candidates || [];
  const diseaseMatch = value?.phenotype_hpo?.disease_match || null;
  const topCandidates = value?.phenotype_hpo?.top_candidates || [];
  const hpoResolutionMethod = value?.phenotype_hpo?.hpo_resolution_method || null;
  const propagatedFromRelated = value?.phenotype_hpo?.propagated_from_related_records || [];

  const parentText = mode === PHENOTYPE_MODE_DISEASE ? diseaseText : findingsText;
  const [draft, setDraft] = useState(parentText || '');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState({ suggested_phrases: [], ambiguous: [], too_vague: [] });
  const [showInheritance, setShowInheritance] = useState(false);

  const resolveSeq = useRef(0);
  const debounceRef = useRef(null);
  const lastResolvedKey = useRef('');
  const onChangeRef = useRef(onChange);
  const focusedRef = useRef(false);
  const stateRef = useRef({});

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sync draft from parent only when not focused (external load / mode switch).
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(parentText || '');
    }
  }, [parentText, mode]);

  useEffect(() => {
    stateRef.current = {
      mode,
      findingsText,
      diseaseText,
      candidates,
      diseaseMatch,
      topCandidates,
      hpoResolutionMethod,
      propagatedFromRelated,
      draft,
    };
  }, [
    mode,
    findingsText,
    diseaseText,
    candidates,
    diseaseMatch,
    topCandidates,
    hpoResolutionMethod,
    propagatedFromRelated,
    draft,
  ]);

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.selected).length,
    [candidates]
  );

  const { clinicalCandidates, inheritanceCandidates } = useMemo(() => {
    const clinical = [];
    const inheritance = [];
    for (const c of candidates) {
      if (isInheritanceLikeHpo(c)) inheritance.push(c);
      else clinical.push(c);
    }
    return { clinicalCandidates: clinical, inheritanceCandidates: inheritance };
  }, [candidates]);

  const emit = useCallback((patch) => {
    const cur = stateRef.current;
    const nextMode = patch.phenotype_mode ?? cur.mode;
    const nextFindings =
      patch.phenotype_findings !== undefined ? patch.phenotype_findings : cur.findingsText;
    const nextDisease =
      patch.phenotype_disease !== undefined ? patch.phenotype_disease : cur.diseaseText;
    const nextCandidates =
      patch.candidates !== undefined ? patch.candidates : cur.candidates;
    const nextDiseaseMatch =
      patch.disease_match !== undefined ? patch.disease_match : cur.diseaseMatch;
    const nextTop =
      patch.top_candidates !== undefined ? patch.top_candidates : cur.topCandidates;
    const nextMethod =
      patch.hpo_resolution_method !== undefined
        ? patch.hpo_resolution_method
        : cur.hpoResolutionMethod;
    const nextProp =
      patch.propagated_from_related_records !== undefined
        ? patch.propagated_from_related_records
        : cur.propagatedFromRelated;

    const fields = buildPhenotypeFieldsForSave({
      mode: nextMode,
      findingsText: nextFindings,
      diseaseText: nextDisease,
      candidates: nextCandidates,
      diseaseMatch: nextDiseaseMatch,
      topCandidates: nextTop,
      hpoResolutionMethod: nextMethod,
      propagatedFromRelated: nextProp,
    });
    onChangeRef.current?.(fields);
  }, []);

  const switchMode = (nextMode) => {
    if (nextMode === mode || disabled) return;
    setSuggestions({ suggested_phrases: [], ambiguous: [], too_vague: [] });
    setResolveError('');
    lastResolvedKey.current = '';
    focusedRef.current = false;
    setDraft('');
    setShowInheritance(false);
    emit({
      phenotype_mode: nextMode,
      phenotype_findings: '',
      phenotype_disease: '',
      candidates: [],
      disease_match: null,
      top_candidates: [],
      hpo_resolution_method: null,
      propagated_from_related_records: [],
    });
  };

  // Debounced HPO resolve from draft — does not block typing.
  useEffect(() => {
    if (disabled) return undefined;
    const text = String(draft || '');
    const trimmed = text.trim();
    const key = `${mode}::${trimmed}`;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!trimmed) {
      if (lastResolvedKey.current !== key) {
        lastResolvedKey.current = key;
        emit({
          candidates: [],
          disease_match: null,
          top_candidates: [],
          hpo_resolution_method: null,
          propagated_from_related_records: [],
        });
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
        const payload = await resolveHpoTerms({ text: trimmed, forceMode: mode });
        if (seq !== resolveSeq.current) return;
        // Ignore stale responses if user kept typing.
        if (String(stateRef.current.draft || '').trim() !== trimmed) return;
        const defaultSelected = mode !== PHENOTYPE_MODE_DISEASE;
        const nextCandidates = mapResolveToCandidates(payload, { defaultSelected });
        lastResolvedKey.current = key;
        emit({
          candidates: nextCandidates,
          disease_match: payload.disease_match || null,
          top_candidates: payload.top_candidates || [],
          hpo_resolution_method: payload.hpo_resolution_method,
          propagated_from_related_records: payload.propagated_from_related_records || [],
        });
      } catch (err) {
        if (seq !== resolveSeq.current) return;
        setResolveError(err?.message || 'Could not resolve HPO terms');
      } finally {
        if (seq === resolveSeq.current) setResolving(false);
      }
    }, 550);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, mode, disabled, emit]);

  const toggleCandidate = (hpoId) => {
    const next = candidates.map((c) =>
      c.hpo_id === hpoId ? { ...c, selected: !c.selected } : c
    );
    emit({ candidates: next });
  };

  const setGroupSelected = (group, selected) => {
    const ids = new Set(group.map((c) => c.hpo_id));
    emit({
      candidates: candidates.map((c) =>
        ids.has(c.hpo_id) ? { ...c, selected } : c
      ),
    });
  };

  const onTextChange = (text) => {
    lastResolvedKey.current = '';
    setDraft(text);
    if (mode === PHENOTYPE_MODE_DISEASE) {
      emit({ phenotype_disease: text, phenotype_findings: '' });
    } else {
      emit({ phenotype_findings: text, phenotype_disease: '' });
    }
  };

  const pickDiseaseCandidate = (cand) => {
    const name = String(cand?.disease_name || cand?.matched_variant || '').trim();
    if (!name) return;
    lastResolvedKey.current = '';
    focusedRef.current = false;
    setDraft(name);
    emit({
      phenotype_disease: name,
      phenotype_findings: '',
      candidates: [],
      disease_match: null,
    });
  };

  const runSuggest = async () => {
    if (mode !== PHENOTYPE_MODE_FINDINGS || !draft.trim() || disabled) return;
    setSuggesting(true);
    try {
      const data = await suggestPhenotypePhrases({ text: draft.trim() });
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
    const existing = draft.trim();
    const next = existing
      ? existing.toLowerCase().includes(p.toLowerCase())
        ? existing
        : `${existing}, ${p}`
      : p;
    setDraft(next);
    emit({ phenotype_findings: next, phenotype_disease: '' });
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

  const renderChip = (c) => (
    <button
      key={c.hpo_id}
      type="button"
      disabled={disabled}
      onClick={() => toggleCandidate(c.hpo_id)}
      title={c.matched_phrase ? `Matched: ${c.matched_phrase}` : c.hpo_id}
      className="px-2 py-1 text-2xs rounded-md border text-left transition-all"
      style={{
        borderColor: c.selected ? 'var(--accent-teal)' : 'var(--border-default)',
        background: c.selected
          ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)'
          : 'var(--bg-surface-raised)',
        color: 'var(--text-primary)',
        opacity: c.selected ? 1 : 0.75,
      }}
    >
      <span className="font-medium">
        {c.selected ? '✓ ' : ''}
        {c.hpo_id}
      </span>
      {c.hpo_name ? (
        <span style={{ color: 'var(--text-secondary)' }}> — {c.hpo_name}</span>
      ) : null}
    </button>
  );

  const altDiseases = (topCandidates || [])
    .filter((c) => c && (c.disease_id || c.disease_name))
    .filter((c) => !diseaseMatch?.id || c.disease_id !== diseaseMatch.id)
    .slice(0, 5);

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
          ? 'Type a disease name or ORPHA/OMIM/MONDO ID. Confirm the matched disease, then select findings this patient actually has.'
          : 'Enter short clinical findings (e.g. ptosis, proximal muscle weakness). Switching tabs clears the other.'}
      </p>

      <textarea
        value={draft}
        onChange={(e) => onTextChange(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        disabled={disabled}
        placeholder={
          mode === PHENOTYPE_MODE_DISEASE
            ? 'Disease name or ID (e.g. Epidermolysis bullosa, ORPHA:648)…'
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
            disabled={disabled || suggesting || !draft.trim()}
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
          className="px-2.5 py-2 rounded-lg border text-xs space-y-1.5"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-muted)' }}
        >
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Best match: {diseaseMatch.name}
          </div>
          <div style={{ color: 'var(--text-tertiary)' }}>
            {[
              diseaseMatch.id,
              diseaseMatch.source ? `source ${diseaseMatch.source}` : null,
              diseaseMatch.score != null ? `score ${Number(diseaseMatch.score).toFixed(2)}` : null,
              `${candidates.length} annotated HPO terms`,
              hpoResolutionMethod === 'propagated_from_related_subtypes'
                ? 'expanded from related subtypes'
                : hpoResolutionMethod === 'direct_disease_annotation'
                  ? 'direct disease annotations'
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <p className="text-2xs" style={{ color: 'var(--text-secondary)' }}>
            This card is the disease we matched — not a selectable finding. Below, tick only
            findings present in <span className="font-medium">this patient</span>. Inheritance
            terms (e.g. autosomal recessive) are listed separately; they describe the disease
            model, not a symptom.
          </p>
          {propagatedFromRelated?.length > 0 && (
            <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
              Includes annotations from {propagatedFromRelated.length} related subtype
              {propagatedFromRelated.length === 1 ? '' : 's'} (may be broader than this exact
              disease). Prefer precise disease names/IDs when possible.
            </p>
          )}
          {altDiseases.length > 0 && (
            <div className="pt-1 space-y-1">
              <div className="text-2xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Other close matches — click to use instead
              </div>
              <div className="flex flex-col gap-1">
                {altDiseases.map((c) => (
                  <button
                    key={`${c.disease_id}-${c.disease_name}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => pickDiseaseCandidate(c)}
                    className="text-left px-2 py-1 rounded-md border text-2xs transition-all"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-surface-raised)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span className="font-medium">{c.disease_name}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {' '}
                      · {[c.disease_id, c.score != null ? `score ${Number(c.score).toFixed(2)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          {resolving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Looking up HPO terms… (keep typing)
            </span>
          ) : candidates.length > 0 ? (
            <span>
              Clinical findings ({clinicalCandidates.filter((c) => c.selected).length}/
              {clinicalCandidates.length} selected)
              {inheritanceCandidates.length > 0
                ? ` · ${inheritanceCandidates.length} inheritance terms hidden`
                : ''}
            </span>
          ) : draft.trim() ? (
            <span>No HPO terms detected yet</span>
          ) : null}
        </div>
        {clinicalCandidates.length > 0 && (
          <div className="flex gap-2 text-2xs">
            <button
              type="button"
              className="underline"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setGroupSelected(clinicalCandidates, true)}
              disabled={disabled}
            >
              Select clinical
            </button>
            <button
              type="button"
              className="underline"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setGroupSelected(clinicalCandidates, false)}
              disabled={disabled}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {mode === PHENOTYPE_MODE_DISEASE &&
        draft.trim() &&
        !resolving &&
        selectedCount === 0 &&
        candidates.length > 0 && (
          <p className="text-2xs" style={{ color: 'var(--warning, #b45309)' }}>
            Select at least one clinical finding for this patient before running phenotype
            prioritization.
          </p>
        )}

      {resolveError && (
        <p className="text-2xs" style={{ color: 'var(--error)' }}>
          {resolveError}
        </p>
      )}

      {clinicalCandidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
          {clinicalCandidates.map(renderChip)}
        </div>
      )}

      {inheritanceCandidates.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            className="text-2xs underline"
            style={{ color: 'var(--text-tertiary)' }}
            onClick={() => setShowInheritance((v) => !v)}
          >
            {showInheritance ? 'Hide' : 'Show'} inheritance / non-finding terms (
            {inheritanceCandidates.length})
          </button>
          {showInheritance && (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto opacity-80">
              {inheritanceCandidates.map(renderChip)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
