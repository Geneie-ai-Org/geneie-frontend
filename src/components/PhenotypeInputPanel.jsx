/**
 * Germline phenotype entry via clinical note.
 * Selected HPO finding IDs (confirmed_ids) drive phenotype prioritization.
 * Disease matches are a shortcut to load annotated findings for review.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { interpretPhenotypeNarrative, resolveHpoTerms } from '@/services/mongodbApi';

export const PHENOTYPE_MODE_FINDINGS = 'findings';
export const PHENOTYPE_MODE_DISEASE = 'disease';
export const PHENOTYPE_MODE_NOTE = 'note';

/** @deprecated use PIPELINE_RUN_* from PipelineRunModeToggle — kept for save-field compat */
export const PHENOTYPE_RUN_MANUAL = 'manual';
export const PHENOTYPE_RUN_AUTOMATIC = 'automatic';

/** Strong disease match — auto-apply in Automatic analysis mode only. */
const AUTO_DISEASE_MIN_SCORE = 0.9;

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
  runMode = PHENOTYPE_RUN_MANUAL,
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

  const phenotype_run_mode =
    runMode === PHENOTYPE_RUN_AUTOMATIC ? PHENOTYPE_RUN_AUTOMATIC : PHENOTYPE_RUN_MANUAL;

  return {
    phenotype_mode: isNote ? PHENOTYPE_MODE_NOTE : PHENOTYPE_MODE_DISEASE,
    phenotype_run_mode,
    // Case-level alias — same value; parent may also set pipeline_run_mode directly.
    pipeline_run_mode: phenotype_run_mode,
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
    selected_default: Boolean(c.selected_default ?? c.selected),
    llm_confidence: c.llm_confidence || '',
  };
}

/** Keep pinned (selected) chips; merge incoming proposals without dropping selections.
 * For IDs already seen, preserve the user's selected/deselected choice (undo survives re-interpret).
 * New IDs take the backend auto-select default.
 */
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
        selected: prev.selected,
        hpo_name: prev.hpo_name || c.hpo_name,
        matched_phrase: prev.matched_phrase || c.matched_phrase,
        selected_default: c.selected_default ?? prev.selected_default,
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

function diseaseScore(d) {
  const n = Number(d?.score);
  return Number.isFinite(n) ? n : null;
}

function shouldAutoSelectDisease(d, runMode) {
  if (runMode !== PHENOTYPE_RUN_AUTOMATIC || !d) return false;
  const score = diseaseScore(d);
  return score != null && score >= AUTO_DISEASE_MIN_SCORE;
}

function diseaseKey(d) {
  return `${String(d?.disease_id || d?.id || '').trim()}::${String(d?.disease_name || d?.name || '')
    .trim()
    .toLowerCase()}`;
}

function normalizeDiseaseOption(d) {
  if (!d) return null;
  const disease_name = String(d.disease_name || d.name || '').trim();
  if (!disease_name) return null;
  const scoreRaw = d.score;
  let score = null;
  if (typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)) score = scoreRaw;
  else if (scoreRaw != null && scoreRaw !== '') {
    const n = Number(scoreRaw);
    if (Number.isFinite(n)) score = n;
  } else if (d.confidence === 'high') score = 1;
  else if (d.confidence === 'medium') score = 0.7;
  else if (d.confidence === 'low') score = 0.4;
  return {
    disease_id: d.disease_id || d.id || '',
    disease_name,
    score,
    source: d.source || '',
  };
}

/** Merge disease lists; keep highest score; sort score desc. Never drop prior entries. */
function mergeDiseaseCatalog(existing, incoming) {
  const byKey = new Map();
  for (const raw of [...(existing || []), ...(incoming || [])]) {
    const d = normalizeDiseaseOption(raw);
    if (!d) continue;
    const key = diseaseKey(d);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, d);
      continue;
    }
    const prevScore = prev.score == null ? -1 : prev.score;
    const nextScore = d.score == null ? -1 : d.score;
    byKey.set(key, {
      ...prev,
      ...d,
      disease_id: d.disease_id || prev.disease_id,
      source: d.source || prev.source,
      score: Math.max(prevScore, nextScore) < 0 ? null : Math.max(prevScore, nextScore),
    });
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const as = a.score == null ? -1 : a.score;
    const bs = b.score == null ? -1 : b.score;
    if (bs !== as) return bs - as;
    return String(a.disease_name).localeCompare(String(b.disease_name));
  });
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
  const runMode =
    value?.pipeline_run_mode === PHENOTYPE_RUN_AUTOMATIC ||
    value?.phenotype_run_mode === PHENOTYPE_RUN_AUTOMATIC
      ? PHENOTYPE_RUN_AUTOMATIC
      : PHENOTYPE_RUN_MANUAL;
  const isAutomatic = runMode === PHENOTYPE_RUN_AUTOMATIC;
  // Async search/interpret must not wait for the stateRef effect — that lag treated Automatic as Manual.
  const runModeRef = useRef(runMode);
  runModeRef.current = runMode;

  const [draft, setDraft] = useState('');
  const [resolving, setResolving] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [notePreview, setNotePreview] = useState(null);
  const [noteUnmapped, setNoteUnmapped] = useState([]);
  const [noteAmbiguous, setNoteAmbiguous] = useState([]);
  const [showMoreDiseases, setShowMoreDiseases] = useState(false);
  const [showInheritance, setShowInheritance] = useState(false);
  const notePreviewRef = useRef(null);

  const onChangeRef = useRef(onChange);
  const stateRef = useRef({});
  const focusedRef = useRef(false);
  const interpretSeq = useRef(0);
  const interpretDebounceRef = useRef(null);
  const diseaseSeq = useRef(0);
  const diseaseDebounceRef = useRef(null);
  const [searchingDiseases, setSearchingDiseases] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    notePreviewRef.current = notePreview;
  }, [notePreview]);

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
      runMode,
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
    runMode,
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
          runMode: value.phenotype_run_mode || PHENOTYPE_RUN_MANUAL,
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
      // Mode is owned at case/upload level — always read the live ref, not a stale stateRef.
      runMode: runModeRef.current || PHENOTYPE_RUN_MANUAL,
    });
    if (patch.sampleSex !== undefined) fields.sampleSex = patch.sampleSex;
    onChangeRef.current?.(fields);
  }, []);

  // Any analysis-mode switch: clear phenotype interpret UI + selections.
  const prevRunModeRef = useRef(runMode);
  useEffect(() => {
    const was = prevRunModeRef.current;
    prevRunModeRef.current = runMode;
    if (was === runMode) return;
    interpretSeq.current += 1;
    diseaseSeq.current += 1;
    setDraft('');
    setInterpreting(false);
    setSearchingDiseases(false);
    setNotePreview(null);
    setNoteUnmapped([]);
    setNoteAmbiguous([]);
    setResolveError('');
    setShowMoreDiseases(false);
    emit({
      phenotype_note_clean: '',
      phenotype_disease: '',
      phenotype_findings: '',
      candidates: [],
      disease_match: null,
      top_candidates: [],
      hpo_resolution_method: null,
      propagated_from_related_records: [],
    });
  }, [runMode, emit]);

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
    // Stable catalog from top_candidates (score-sorted). Selection never reorders/removes rows.
    const fromTop = mergeDiseaseCatalog([], topCandidates || []);
    const fromPreview = (notePreview?.disease_candidates || []).map((c) =>
      normalizeDiseaseOption({
        disease_name: c.name,
        score: c.confidence === 'high' ? 1 : c.confidence === 'medium' ? 0.7 : 0.4,
      })
    );
    return mergeDiseaseCatalog(fromTop, fromPreview);
  }, [topCandidates, notePreview]);

  const primaryDisease = diseaseOptions[0] || null;
  const altDiseases = diseaseOptions.slice(1);
  const visibleAlts = showMoreDiseases ? altDiseases : [];

  const clearInterpretUi = useCallback(() => {
    setNotePreview(null);
    setNoteUnmapped([]);
    setNoteAmbiguous([]);
    setResolveError('');
    setShowMoreDiseases(false);
  }, []);

  const clearEphemeralPhenotypeResults = useCallback(
    ({ keepPinned = true } = {}) => {
      clearInterpretUi();
      const pinned = keepPinned
        ? (stateRef.current.candidates || []).filter((c) => c.selected)
        : [];
      emit({
        phenotype_note_clean: '',
        phenotype_disease: '',
        phenotype_findings: findingsLabelFrom(pinned),
        candidates: pinned,
        disease_match: null,
        top_candidates: [],
        hpo_resolution_method: null,
        propagated_from_related_records: [],
      });
    },
    [clearInterpretUi, emit]
  );

  const clearNoteOnly = () => {
    interpretSeq.current += 1;
    diseaseSeq.current += 1;
    setDraft('');
    setInterpreting(false);
    setSearchingDiseases(false);
    clearEphemeralPhenotypeResults({ keepPinned: true });
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

  const isActiveDisease = (d) =>
    Boolean(
      diseaseMatch &&
        d &&
        ((diseaseMatch.id && (d.disease_id || d.id) && diseaseMatch.id === (d.disease_id || d.id)) ||
          String(diseaseMatch.name || '').toLowerCase() ===
            String(d.disease_name || d.name || '').toLowerCase())
    );

  const clearDisease = () => {
    // Deselect only — keep catalog (top_candidates) and pinned findings.
    const pinned = (stateRef.current.candidates || []).filter((c) => c.selected);
    emit({
      phenotype_disease: '',
      candidates: pinned,
      disease_match: null,
      hpo_resolution_method: null,
      propagated_from_related_records: [],
      phenotype_findings: findingsLabelFrom(pinned),
      // top_candidates intentionally unchanged
    });
  };

  const applyDisease = useCallback(
    async (disease, { allowToggleOff = true } = {}) => {
      const name = String(disease?.disease_name || disease?.name || '').trim();
      if (!name || disabled) return;

      // Toggle off if this disease is already selected (manual click only).
      if (allowToggleOff && isActiveDisease(disease)) {
        clearDisease();
        return;
      }
      if (!allowToggleOff && isActiveDisease(disease)) return;

      setResolving(true);
      setResolveError('');
      try {
        const resolved = await resolveHpoTerms({
          text: name,
          forceMode: PHENOTYPE_MODE_DISEASE,
        });
        const fromDisease = mapResolveToCandidates(resolved, {
          // Automatic: pre-select disease-linked clinical findings (not inheritance).
          defaultSelected: runModeRef.current === PHENOTYPE_RUN_AUTOMATIC,
        }).map((c) =>
          isInheritanceLikeHpo(c) ? { ...c, selected: false, selected_default: false } : c
        );
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
        const catalog = mergeDiseaseCatalog(stateRef.current.topCandidates, [
          match,
          ...(resolved.top_candidates || []),
          disease,
        ]);
        emit({
          phenotype_disease: name,
          candidates: merged,
          disease_match: match,
          top_candidates: catalog,
          hpo_resolution_method: resolved.hpo_resolution_method || null,
          propagated_from_related_records: resolved.propagated_from_related_records || [],
          phenotype_findings: findingsLabelFrom(merged),
        });
      } catch (err) {
        setResolveError(err?.message || 'Could not load findings for that disease');
      } finally {
        setResolving(false);
      }
    },
    // isActiveDisease/clearDisease close over latest diseaseMatch via render; emit is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, emit, diseaseMatch]
  );

  const applyDiseaseRef = useRef(applyDisease);
  const autoApplyingDiseaseRef = useRef(false);
  useEffect(() => {
    applyDiseaseRef.current = applyDisease;
  }, [applyDisease]);

  const autoApplyTopDisease = useCallback(async (disease) => {
    if (!disease || autoApplyingDiseaseRef.current) return;
    if (runModeRef.current !== PHENOTYPE_RUN_AUTOMATIC) return;
    if (!shouldAutoSelectDisease(disease, runModeRef.current)) return;
    // Skip only if this same disease is already applied.
    const cur = stateRef.current.diseaseMatch;
    if (
      cur?.name &&
      (String(cur.name).toLowerCase() === String(disease.disease_name || disease.name || '').toLowerCase() ||
        (cur.id &&
          (disease.disease_id || disease.id) &&
          cur.id === (disease.disease_id || disease.id)))
    ) {
      return;
    }
    autoApplyingDiseaseRef.current = true;
    try {
      await applyDiseaseRef.current?.(disease, { allowToggleOff: false });
    } finally {
      autoApplyingDiseaseRef.current = false;
    }
  }, []);

  const runInterpretNote = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (trimmed.length < 8 || disabled) return;
    const seq = ++interpretSeq.current;
    setInterpreting(true);
    setResolveError('');
    try {
      const data = await interpretPhenotypeNarrative({ text: trimmed });
      if (seq !== interpretSeq.current) return;

      const phraseFindings = (data.finding_candidates || [])
        .map(normalizeCandidate)
        .filter(Boolean)
        .filter((c) => c.origin !== 'disease_annotation' && c.match_type !== 'disease_annotation')
        .map((c) => {
          if (isInheritanceLikeHpo(c)) {
            return { ...c, selected: false, selected_default: false };
          }
          // Manual: unchecked. Automatic: keep backend high-confidence / high-score ticks.
          if (runModeRef.current !== PHENOTYPE_RUN_AUTOMATIC) {
            return { ...c, selected: false, selected_default: false };
          }
          return c;
        });

      // Keep analyst-pinned chips; replace proposals from this note (no stale merge).
      const priorPinned = (stateRef.current.candidates || []).filter((c) => c.selected);
      const mergedFindings = mergeCandidates(priorPinned, phraseFindings);

      const incomingDiseases = [
        data.disease_match
          ? {
              disease_id: data.disease_match.id,
              disease_name: data.disease_match.name,
              score: data.disease_match.score,
              source: data.disease_match.source,
            }
          : null,
        ...(data.top_candidates || []),
        ...((data.disease_candidates || []).map((c) => ({
          disease_name: c.name,
          score: c.confidence === 'high' ? 1 : c.confidence === 'medium' ? 0.7 : 0.4,
        })) || []),
      ];
      // Fresh catalog for this note — do not keep diseases from a previous phrase.
      const catalog = mergeDiseaseCatalog([], incomingDiseases);

      // Keep user's disease selection if still in catalog; Automatic may adopt a strong top hit.
      const prev = stateRef.current.diseaseMatch;
      let nextMatch = null;
      if (prev?.name) {
        nextMatch =
          catalog.find(
            (d) =>
              (prev.id && d.disease_id && prev.id === d.disease_id) ||
              String(d.disease_name || '').toLowerCase() === String(prev.name || '').toLowerCase()
          ) || null;
        if (nextMatch) {
          nextMatch = {
            id: nextMatch.disease_id || prev.id || '',
            name: nextMatch.disease_name,
            score: nextMatch.score != null ? nextMatch.score : prev.score,
            source: nextMatch.source || prev.source,
          };
        }
      }

      const autoDisease =
        !nextMatch && shouldAutoSelectDisease(catalog[0], runModeRef.current)
          ? catalog[0]
          : null;

      setNotePreview(data);
      setNoteUnmapped(data.unmapped || []);
      setNoteAmbiguous(data.ambiguous || []);

      emit({
        phenotype_mode: PHENOTYPE_MODE_NOTE,
        phenotype_note_clean: data.deidentified_text || stateRef.current.noteCleanText || '',
        phenotype_disease: nextMatch?.name || '',
        phenotype_findings: findingsLabelFrom(mergedFindings),
        candidates: mergedFindings,
        disease_match: nextMatch,
        top_candidates: catalog,
        hpo_resolution_method: nextMatch
          ? stateRef.current.hpoResolutionMethod
          : data.hpo_resolution_method || null,
        propagated_from_related_records: nextMatch
          ? stateRef.current.propagatedFromRelated
          : data.propagated_from_related_records || [],
        ...(data.patient?.sex ? { sampleSex: data.patient.sex } : {}),
      });

      if (autoDisease && seq === interpretSeq.current) {
        await autoApplyTopDisease(autoDisease);
      }
    } catch (err) {
      if (seq !== interpretSeq.current) return;
      setResolveError(err?.message || 'Could not interpret clinical note');
    } finally {
      if (seq === interpretSeq.current) setInterpreting(false);
    }
  }, [disabled, emit, autoApplyTopDisease]);

  /** Fast disease catalog update — deterministic resolve, no LLM. */
  const runFastDiseaseSearch = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (trimmed.length < 3 || disabled) return;
    const seq = ++diseaseSeq.current;
    setSearchingDiseases(true);
    try {
      const resolved = await resolveHpoTerms({
        text: trimmed,
        forceMode: PHENOTYPE_MODE_DISEASE,
      });
      if (seq !== diseaseSeq.current) return;

      const incoming = [
        resolved.disease_match
          ? {
              disease_id: resolved.disease_match.id,
              disease_name: resolved.disease_match.name,
              score: resolved.disease_match.score,
              source: resolved.disease_match.source,
            }
          : null,
        ...(resolved.top_candidates || []),
      ];
      const catalog = mergeDiseaseCatalog([], incoming);
      if (catalog.length === 0) {
        emit({
          top_candidates: [],
          disease_match: null,
          phenotype_disease: '',
        });
        return;
      }

      // Prefer API disease_match when it qualifies; else top catalog row.
      const preferredAuto =
        resolved.disease_match &&
        shouldAutoSelectDisease(
          {
            disease_id: resolved.disease_match.id,
            disease_name: resolved.disease_match.name,
            score: resolved.disease_match.score,
            source: resolved.disease_match.source,
          },
          runModeRef.current
        )
          ? {
              disease_id: resolved.disease_match.id,
              disease_name: resolved.disease_match.name,
              score: resolved.disease_match.score,
              source: resolved.disease_match.source,
            }
          : shouldAutoSelectDisease(catalog[0], runModeRef.current)
            ? catalog[0]
            : null;

      // Preserve selection; only refresh the ranked disease list.
      const prev = stateRef.current.diseaseMatch;
      let nextMatch = null;
      if (prev?.name) {
        const found = catalog.find(
          (d) =>
            (prev.id && d.disease_id && prev.id === d.disease_id) ||
            String(d.disease_name || '').toLowerCase() === String(prev.name || '').toLowerCase()
        );
        if (found) {
          nextMatch = {
            id: found.disease_id || prev.id || '',
            name: found.disease_name,
            score: found.score != null ? found.score : prev.score,
            source: found.source || prev.source,
          };
        }
      }

      const autoDisease = !nextMatch ? preferredAuto : null;

      emit({
        top_candidates: catalog,
        disease_match: nextMatch,
        phenotype_disease: nextMatch?.name || '',
      });

      if (autoDisease && seq === diseaseSeq.current) {
        await autoApplyTopDisease(autoDisease);
      }
    } catch (err) {
      if (seq !== diseaseSeq.current) return;
      // Soft-fail: interpret path may still populate diseases.
      console.warn('[Phenotype] fast disease search failed', err);
    } finally {
      if (seq === diseaseSeq.current) setSearchingDiseases(false);
    }
  }, [disabled, emit, autoApplyTopDisease]);

  // Fast disease matches on every edit (short debounce) — scores refresh from the current text.
  useEffect(() => {
    if (disabled) return undefined;
    if (diseaseDebounceRef.current) clearTimeout(diseaseDebounceRef.current);
    const trimmed = String(draft || '').trim();
    if (trimmed.length < 3) {
      setSearchingDiseases(false);
      diseaseSeq.current += 1;
      // Cleared / too short: wipe ephemeral results; keep pinned selections only.
      if (
        stateRef.current.topCandidates?.length ||
        stateRef.current.noteCleanText ||
        notePreviewRef.current ||
        stateRef.current.diseaseMatch ||
        (stateRef.current.candidates || []).some((c) => !c.selected)
      ) {
        clearEphemeralPhenotypeResults({ keepPinned: true });
      }
      return undefined;
    }
    diseaseDebounceRef.current = setTimeout(() => {
      runFastDiseaseSearch(trimmed);
    }, 180);
    return () => {
      if (diseaseDebounceRef.current) clearTimeout(diseaseDebounceRef.current);
    };
  }, [draft, disabled, runFastDiseaseSearch, clearEphemeralPhenotypeResults]);

  // Live interpret while typing. Do NOT depend on notePreview — that re-fired interpret forever.
  useEffect(() => {
    if (disabled) return undefined;
    if (interpretDebounceRef.current) clearTimeout(interpretDebounceRef.current);
    const trimmed = String(draft || '').trim();
    if (trimmed.length < 8) {
      setInterpreting(false);
      interpretSeq.current += 1;
      const pinned = (stateRef.current.candidates || []).filter((c) => c.selected);
      const hadUnselected = (stateRef.current.candidates || []).some((c) => !c.selected);
      if (stateRef.current.noteCleanText || notePreviewRef.current || hadUnselected) {
        setNotePreview(null);
        setNoteUnmapped([]);
        setNoteAmbiguous([]);
        emit({
          phenotype_note_clean: '',
          candidates: pinned,
          phenotype_findings: findingsLabelFrom(pinned),
        });
      }
      return undefined;
    }
    interpretDebounceRef.current = setTimeout(() => {
      runInterpretNote(trimmed);
    }, 500);
    return () => {
      if (interpretDebounceRef.current) clearTimeout(interpretDebounceRef.current);
    };
  }, [draft, disabled, runInterpretNote, emit]);

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

  return (
    <div className="space-y-2">
      <label className="flex items-baseline gap-1.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        Phenotype
        <span className="text-2xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
          (enables phenotype-driven prioritization)
        </span>
      </label>
      {isAutomatic ? (
        <p className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
          Automatic: strong disease matches (score ≥ 0.90) and high-confidence findings are
          pre-selected — click to change.
        </p>
      ) : null}

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

      <div className="flex items-center gap-2 flex-wrap min-h-[1.25rem]">
        {searchingDiseases || interpreting ? (
          <span className="text-2xs inline-flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            {searchingDiseases ? 'Updating disease matches…' : 'Updating findings…'}
          </span>
        ) : draft.trim().length >= 3 ? (
          <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
            Patient names are removed before chat
          </span>
        ) : draft.trim().length > 0 ? (
          <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
            Keep typing to search…
          </span>
        ) : (
          <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
            Patient names are removed before chat
          </span>
        )}
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
                isActiveDisease(primaryDisease) ? 'selected — click to deselect' : 'click to use',
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
                {[
                  c.disease_id,
                  c.score != null ? `score ${Number(c.score).toFixed(2)}` : null,
                  isActiveDisease(c) ? 'selected — click to deselect' : null,
                ]
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
              {clinicalCandidates.some((c) => c.selected && c.selected_default && isAutomatic)
                ? ' · high-confidence pre-selected — click to undo'
                : ''}
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
