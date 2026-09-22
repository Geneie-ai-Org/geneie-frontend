/**
 * Germline phenotype entry via clinical note.
 * Selected HPO finding IDs (confirmed_ids) drive phenotype prioritization.
 * Disease matches are a shortcut to load annotated findings for review.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react';
import { interpretPhenotypeNarrative, resolveHpoTerms } from '@/services/mongodbApi';

export const PHENOTYPE_MODE_FINDINGS = 'findings';
export const PHENOTYPE_MODE_DISEASE = 'disease';
export const PHENOTYPE_MODE_NOTE = 'note';

/** Mode-of-inheritance / non-finding HPO IDs commonly dumped in disease annotations. */
const INHERITANCE_HPO_IDS = new Set([
  'HP:0000005',
  'HP:0000006',
  'HP:0000007',
  'HP:0001417',
  'HP:0001419',
  'HP:0001423',
  'HP:0001426',
  'HP:0001427',
  'HP:0001428',
  'HP:0001450',
  'HP:0001470',
  'HP:0003745',
  'HP:0010985',
  'HP:0032113',
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
      String(meta.phenotype_disease || '').trim() ||
      String(meta.phenotype_note_clean || '').trim()
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
  noteClean = '',
}) {
  const isDisease = mode === PHENOTYPE_MODE_DISEASE;
  const isNote = mode === PHENOTYPE_MODE_NOTE || !isDisease;
  const selected = (candidates || []).filter((c) => c.selected);
  const confirmed_ids = selected.map((c) => c.hpo_id).filter(Boolean);
  const chipLabel = selected
    .map((c) => c.hpo_name || c.matched_phrase || c.hpo_id)
    .filter(Boolean)
    .join(', ');

  let findings = '';
  let disease = '';
  let phenotype = '';
  let phenotype_note_clean = '';

  if (isNote) {
    findings = chipLabel || String(findingsText ?? '');
    disease = String(diseaseText ?? '');
    phenotype_note_clean = String(noteClean ?? '').trim();
    phenotype = (phenotype_note_clean || findings || disease).trim();
  } else {
    findings = '';
    disease = String(diseaseText ?? '');
    phenotype = disease.trim();
  }

  return {
    phenotype_mode: isNote ? PHENOTYPE_MODE_NOTE : PHENOTYPE_MODE_DISEASE,
    phenotype_findings: findings,
    phenotype_disease: disease,
    phenotype,
    phenotype_note_clean,
    phenotype_hpo: {
      confirmed_ids,
      candidates: candidates || [],
      resolution_mode: isNote ? 'note' : 'somatic',
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
      match_type: m.match_type || 'disease_annotation',
      origin: 'disease_annotation',
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
      match_type: 'disease_annotation',
      origin: 'disease_annotation',
      selected: Boolean(defaultSelected),
    });
  }
  return Array.from(byId.values());
}

function normalizeCandidate(c) {
  const hid = String(c?.hpo_id || '').trim().toUpperCase();
  if (!hid.startsWith('HP:')) return null;
  return {
    hpo_id: hid,
    hpo_name: c.hpo_name || '',
    matched_phrase: c.matched_phrase || c.source_phrase || '',
    match_score: c.match_score,
    match_type: c.match_type || '',
    origin: c.origin || (c.match_type === 'disease_annotation' ? 'disease_annotation' : 'note_phrase'),
    selected: Boolean(c.selected),
  };
}

/** Keep pinned (selected) chips; merge incoming proposals without dropping selections. */
function mergeCandidates(existing, incoming) {
  const byId = new Map();
  for (const raw of existing || []) {
    const c = normalizeCandidate(raw);
    if (!c) continue;
    byId.set(c.hpo_id, c);
  }
  for (const raw of incoming || []) {
    const c = normalizeCandidate(raw);
    if (!c) continue;
    const prev = byId.get(c.hpo_id);
    if (prev) {
      byId.set(c.hpo_id, {
        ...c,
        selected: prev.selected || c.selected,
        hpo_name: prev.hpo_name || c.hpo_name,
        matched_phrase: prev.matched_phrase || c.matched_phrase,
      });
    } else {
      byId.set(c.hpo_id, c);
    }
  }
  return Array.from(byId.values());
}

function findingsLabelFrom(candidates) {
  return (candidates || [])
    .filter((c) => c.selected)
    .map((c) => c.hpo_name || c.matched_phrase || c.hpo_id)
    .join(', ');
}

function diseaseKey(d) {
  return `${String(d?.disease_id || d?.id || '').trim()}::${String(d?.disease_name || d?.name || '')
    .trim()
    .toLowerCase()}`;
}

/**
 * Clinical-note phenotype panel (pinned findings + optional disease shortcut).
 */
export default function PhenotypeInputPanel({ value, onChange, disabled = false }) {
  const candidates = value?.phenotype_hpo?.candidates || [];
  const diseaseMatch = value?.phenotype_hpo?.disease_match || null;
  const topCandidates = value?.phenotype_hpo?.top_candidates || [];
  const hpoResolutionMethod = value?.phenotype_hpo?.hpo_resolution_method || null;
  const propagatedFromRelated = value?.phenotype_hpo?.propagated_from_related_records || [];
  const noteCleanText = value?.phenotype_note_clean || '';
  const diseaseText = value?.phenotype_disease || '';
  const findingsText = value?.phenotype_findings || '';

  const [draft, setDraft] = useState('');
  const [resolving, setResolving] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [notePreview, setNotePreview] = useState(null);
  const [noteUnmapped, setNoteUnmapped] = useState([]);
  const [noteAmbiguous, setNoteAmbiguous] = useState([]);
  const [showMoreDiseases, setShowMoreDiseases] = useState(false);
  const [showInheritance, setShowInheritance] = useState(false);

  const onChangeRef = useRef(onChange);
  const stateRef = useRef({});
  const focusedRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    stateRef.current = {
      candidates,
      diseaseMatch,
      topCandidates,
      hpoResolutionMethod,
      propagatedFromRelated,
      noteCleanText,
      diseaseText,
      findingsText,
      draft,
    };
  }, [
    candidates,
    diseaseMatch,
    topCandidates,
    hpoResolutionMethod,
    propagatedFromRelated,
    noteCleanText,
    diseaseText,
    findingsText,
    draft,
  ]);

  // Ensure saved mode is always clinical-note.
  useEffect(() => {
    if (value?.phenotype_mode && value.phenotype_mode !== PHENOTYPE_MODE_NOTE) {
      onChangeRef.current?.(
        buildPhenotypeFieldsForSave({
          mode: PHENOTYPE_MODE_NOTE,
          findingsText: value.phenotype_findings || '',
          diseaseText: value.phenotype_disease || '',
          candidates: value?.phenotype_hpo?.candidates || [],
          diseaseMatch: value?.phenotype_hpo?.disease_match || null,
          topCandidates: value?.phenotype_hpo?.top_candidates || [],
          hpoResolutionMethod: value?.phenotype_hpo?.hpo_resolution_method || null,
          propagatedFromRelated: value?.phenotype_hpo?.propagated_from_related_records || [],
          noteClean: value.phenotype_note_clean || '',
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time normalize on mount / legacy modes
  }, [value?.phenotype_mode]);

  const emit = useCallback((patch) => {
    const cur = stateRef.current;
    const nextCandidates = patch.candidates !== undefined ? patch.candidates : cur.candidates;
    const fields = buildPhenotypeFieldsForSave({
      mode: PHENOTYPE_MODE_NOTE,
      findingsText:
        patch.phenotype_findings !== undefined
          ? patch.phenotype_findings
          : findingsLabelFrom(nextCandidates) || cur.findingsText,
      diseaseText: patch.phenotype_disease !== undefined ? patch.phenotype_disease : cur.diseaseText,
      candidates: nextCandidates,
      diseaseMatch: patch.disease_match !== undefined ? patch.disease_match : cur.diseaseMatch,
      topCandidates: patch.top_candidates !== undefined ? patch.top_candidates : cur.topCandidates,
      hpoResolutionMethod:
        patch.hpo_resolution_method !== undefined
          ? patch.hpo_resolution_method
          : cur.hpoResolutionMethod,
      propagatedFromRelated:
        patch.propagated_from_related_records !== undefined
          ? patch.propagated_from_related_records
          : cur.propagatedFromRelated,
      noteClean:
        patch.phenotype_note_clean !== undefined ? patch.phenotype_note_clean : cur.noteCleanText,
    });
    if (patch.sampleSex !== undefined) fields.sampleSex = patch.sampleSex;
    onChangeRef.current?.(fields);
  }, []);

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

  const diseaseOptions = useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (d) => {
      if (!d) return;
      const name = String(d.disease_name || d.name || '').trim();
      if (!name) return;
      const item = {
        disease_id: d.disease_id || d.id || '',
        disease_name: name,
        score: d.score,
        source: d.source,
      };
      const key = diseaseKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    push(
      diseaseMatch
        ? {
            disease_id: diseaseMatch.id,
            disease_name: diseaseMatch.name,
            score: diseaseMatch.score,
            source: diseaseMatch.source,
          }
        : null
    );
    for (const c of topCandidates || []) push(c);
    for (const c of notePreview?.disease_candidates || []) {
      push({ disease_name: c.name, score: c.confidence === 'high' ? 1 : 0.5 });
    }
    return out;
  }, [diseaseMatch, topCandidates, notePreview]);

  const primaryDisease = diseaseOptions[0] || null;
  const altDiseases = diseaseOptions.slice(1);
  const visibleAlts = showMoreDiseases ? altDiseases : [];

  const clearNoteOnly = () => {
    setDraft('');
    setNotePreview(null);
    setNoteUnmapped([]);
    setNoteAmbiguous([]);
    setResolveError('');
    // Keep disease + selected findings pinned.
  };

  const toggleCandidate = (hpoId) => {
    const next = candidates.map((c) =>
      c.hpo_id === hpoId ? { ...c, selected: !c.selected } : c
    );
    emit({
      candidates: next,
      phenotype_findings: findingsLabelFrom(next),
    });
  };

  const removeCandidate = (hpoId) => {
    const next = (candidates || []).filter(
      (c) => String(c.hpo_id || '').toUpperCase() !== String(hpoId || '').toUpperCase()
    );
    emit({
      candidates: next,
      phenotype_findings: findingsLabelFrom(next),
    });
  };

  const setGroupSelected = (group, selected) => {
    const ids = new Set(group.map((c) => c.hpo_id));
    const next = candidates.map((c) => (ids.has(c.hpo_id) ? { ...c, selected } : c));
    emit({
      candidates: next,
      phenotype_findings: findingsLabelFrom(next),
    });
  };

  const applyDisease = async (disease) => {
    const name = String(disease?.disease_name || disease?.name || '').trim();
    if (!name || disabled) return;
    setResolving(true);
    setResolveError('');
    try {
      const resolved = await resolveHpoTerms({
        text: name,
        forceMode: PHENOTYPE_MODE_DISEASE,
      });
      const fromDisease = mapResolveToCandidates(resolved, { defaultSelected: false });
      // Keep only pinned selections from before; replace unselected proposals with this disease's list.
      const pinned = (stateRef.current.candidates || []).filter((c) => c.selected);
      const merged = mergeCandidates(pinned, fromDisease);
      const match =
        resolved.disease_match ||
        {
          id: disease.disease_id || disease.id || '',
          name,
          score: disease.score,
          source: disease.source,
        };
      emit({
        phenotype_disease: name,
        candidates: merged,
        disease_match: match,
        top_candidates: resolved.top_candidates?.length
          ? resolved.top_candidates
          : stateRef.current.topCandidates,
        hpo_resolution_method: resolved.hpo_resolution_method || null,
        propagated_from_related_records: resolved.propagated_from_related_records || [],
        phenotype_findings: findingsLabelFrom(merged),
      });
      setShowMoreDiseases(false);
    } catch (err) {
      setResolveError(err?.message || 'Could not load findings for that disease');
    } finally {
      setResolving(false);
    }
  };

  const runInterpretNote = async () => {
    if (!draft.trim() || disabled) return;
    setInterpreting(true);
    setResolveError('');
    try {
      const data = await interpretPhenotypeNarrative({ text: draft.trim() });
      // Phrase-grounded findings only — do not auto-dump disease annotations
      // (that was loading wrong-disease HPOs for skin notes).
      const phraseFindings = (data.finding_candidates || [])
        .map(normalizeCandidate)
        .filter(Boolean)
        .filter((c) => c.origin !== 'disease_annotation' && c.match_type !== 'disease_annotation');

      const pinned = (stateRef.current.candidates || []).filter((c) => c.selected);
      const merged = mergeCandidates(pinned, phraseFindings);

      setNotePreview(data);
      setNoteUnmapped(data.unmapped || []);
      setNoteAmbiguous(data.ambiguous || []);
      setShowMoreDiseases(false);

      const diseaseName =
        data.disease_match?.name || data.disease_candidates?.[0]?.name || '';

      emit({
        phenotype_mode: PHENOTYPE_MODE_NOTE,
        phenotype_note_clean: data.deidentified_text || noteCleanText || '',
        phenotype_disease: diseaseName || diseaseText,
        phenotype_findings: findingsLabelFrom(merged),
        candidates: merged,
        disease_match: data.disease_match || diseaseMatch,
        top_candidates: data.top_candidates || [],
        hpo_resolution_method: data.hpo_resolution_method || null,
        propagated_from_related_records: data.propagated_from_related_records || [],
        ...(data.patient?.sex ? { sampleSex: data.patient.sex } : {}),
      });

      if (phraseFindings.length === 0 && !data.disease_match && !(data.disease_candidates || []).length) {
        setResolveError(
          'No disease or HPO findings detected. Try a clearer note, or pick a disease below if one appears.'
        );
      }
    } catch (err) {
      setResolveError(err?.message || 'Could not interpret clinical note');
    } finally {
      setInterpreting(false);
    }
  };

  const inputStyle = {
    borderColor: 'var(--border-default)',
    background: 'var(--bg-input)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: 'var(--text-primary)',
  };

  const renderChip = (c) => (
    <div
      key={c.hpo_id}
      className="inline-flex items-center gap-1 px-2 py-1 text-2xs rounded-md border text-left"
      style={{
        borderColor: c.selected ? 'var(--accent-teal)' : 'var(--border-default)',
        background: c.selected
          ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)'
          : 'var(--bg-surface-raised)',
        color: 'var(--text-primary)',
        opacity: c.selected ? 1 : 0.75,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => toggleCandidate(c.hpo_id)}
        title={c.matched_phrase ? `Matched: ${c.matched_phrase}` : c.hpo_id}
        className="text-left"
      >
        <span className="font-medium">
          {c.selected ? '✓ ' : ''}
          {c.hpo_id}
        </span>
        {c.hpo_name ? (
          <span style={{ color: 'var(--text-secondary)' }}> — {c.hpo_name}</span>
        ) : null}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => removeCandidate(c.hpo_id)}
        title="Remove"
        className="ml-0.5 p-0.5"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );

  const isActiveDisease = (d) =>
    diseaseMatch &&
    ((diseaseMatch.id && d.disease_id && diseaseMatch.id === d.disease_id) ||
      String(diseaseMatch.name || '').toLowerCase() === String(d.disease_name || '').toLowerCase());

  return (
    <div className="space-y-2">
      <label className="flex items-baseline gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        Phenotype
        <span className="text-2xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
          (enables phenotype-driven prioritization)
        </span>
      </label>

      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            setTimeout(() => {
              focusedRef.current = false;
            }, 150);
          }}
          disabled={disabled}
          placeholder="Paste clinical note (e.g. painful raw blisters in skin folds, armpits and groin…)"
          rows={5}
          className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-1 resize-none text-sm transition-all pr-9"
          style={inputStyle}
        />
        {draft.trim() && !disabled && (
          <button
            type="button"
            onClick={clearNoteOnly}
            className="absolute top-2 right-2 p-1 rounded-md"
            title="Clear note (keeps selected findings)"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={disabled || interpreting || draft.trim().length < 8}
          onClick={runInterpretNote}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-medium rounded-md border transition-all"
          style={{
            borderColor: 'var(--accent-teal)',
            color: 'var(--accent-teal)',
            background: 'color-mix(in srgb, var(--accent-teal) 10%, transparent)',
          }}
        >
          {interpreting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Interpret note
        </button>
        <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          Patient names are removed before chat
        </span>
      </div>

      {notePreview?.deidentified_text && (
        <div
          className="px-2.5 py-2 rounded-lg border text-2xs space-y-1"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-muted)' }}
        >
          <div className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            Cleaned note (saved for chat)
          </div>
          <p style={{ color: 'var(--text-primary)' }}>{notePreview.deidentified_text}</p>
          {(notePreview.patient?.sex || notePreview.patient?.age) && (
            <p style={{ color: 'var(--text-tertiary)' }}>
              {[
                notePreview.patient?.sex ? `Sex → ${notePreview.patient.sex}` : null,
                notePreview.patient?.age ? `Age noted: ${notePreview.patient.age}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {(noteUnmapped.length > 0 || noteAmbiguous.length > 0) && (
        <div className="text-2xs space-y-1" style={{ color: 'var(--text-tertiary)' }}>
          {noteAmbiguous.length > 0 && <p>Ambiguous: {noteAmbiguous.join('; ')}</p>}
          {noteUnmapped.length > 0 && (
            <p>Could not map to HPO: {noteUnmapped.join('; ')}</p>
          )}
        </div>
      )}

      {primaryDisease && (
        <div
          className="px-2.5 py-2 rounded-lg border text-xs space-y-1.5"
          style={{ borderColor: 'var(--border-default)', background: 'var(--bg-muted)' }}
        >
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
            Disease matches
          </div>

          <button
            type="button"
            disabled={disabled || resolving}
            onClick={() => applyDisease(primaryDisease)}
            className="w-full text-left px-2.5 py-2 rounded-md border text-2xs transition-all"
            style={{
              borderColor: isActiveDisease(primaryDisease)
                ? 'var(--accent-teal)'
                : 'var(--border-default)',
              background: isActiveDisease(primaryDisease)
                ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)'
                : 'var(--bg-surface-raised)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="font-medium">
              {isActiveDisease(primaryDisease) ? '✓ ' : ''}
              {primaryDisease.disease_name}
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              {' '}
              ·{' '}
              {[
                primaryDisease.disease_id,
                primaryDisease.source ? `source ${primaryDisease.source}` : null,
                primaryDisease.score != null
                  ? `score ${Number(primaryDisease.score).toFixed(2)}`
                  : null,
                isActiveDisease(primaryDisease) ? 'selected — findings loaded below' : 'click to use',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>

          {visibleAlts.map((c) => (
            <button
              key={diseaseKey(c)}
              type="button"
              disabled={disabled || resolving}
              onClick={() => applyDisease(c)}
              className="w-full text-left px-2.5 py-1.5 rounded-md border text-2xs transition-all"
              style={{
                borderColor: isActiveDisease(c) ? 'var(--accent-teal)' : 'var(--border-default)',
                background: isActiveDisease(c)
                  ? 'color-mix(in srgb, var(--accent-teal) 12%, transparent)'
                  : 'var(--bg-surface-raised)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="font-medium">
                {isActiveDisease(c) ? '✓ ' : ''}
                {c.disease_name}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {' '}
                ·{' '}
                {[c.disease_id, c.score != null ? `score ${Number(c.score).toFixed(2)}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          ))}

          {altDiseases.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowMoreDiseases((v) => !v)}
              className="inline-flex items-center gap-1 text-2xs underline"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showMoreDiseases ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Hide other matches
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Show more ({altDiseases.length})
                </>
              )}
            </button>
          )}

          {propagatedFromRelated?.length > 0 && isActiveDisease(primaryDisease) && (
            <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
              Includes annotations from {propagatedFromRelated.length} related subtype
              {propagatedFromRelated.length === 1 ? '' : 's'}.
            </p>
          )}
          {resolving && (
            <p className="text-2xs inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
              <Loader2 className="w-3 h-3 animate-spin" /> Loading findings for disease…
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          {interpreting ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Interpreting note…
            </span>
          ) : candidates.length > 0 ? (
            <span>
              Clinical findings ({clinicalCandidates.filter((c) => c.selected).length}/
              {clinicalCandidates.length} selected)
              {inheritanceCandidates.length > 0
                ? ` · ${inheritanceCandidates.length} inheritance terms hidden`
                : ''}
            </span>
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
              Clear selection
            </button>
          </div>
        )}
      </div>

      {!resolving && !interpreting && selectedCount === 0 && candidates.length > 0 && (
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
