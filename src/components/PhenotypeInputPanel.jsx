/**
 * Germline phenotype entry via clinical note.
 * Selected HPO finding IDs (confirmed_ids) drive phenotype prioritization.
 * Disease matches are a shortcut to load annotated findings for review.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Info, Loader2, X } from 'lucide-react';
import { interpretPhenotypeNarrative, resolveHpoTerms } from '@/services/mongodbApi';
import PanelAppSuggestSection from '@/components/PanelAppSuggestSection';

export const PHENOTYPE_MODE_FINDINGS = 'findings';
export const PHENOTYPE_MODE_DISEASE = 'disease';
export const PHENOTYPE_MODE_NOTE = 'note';

/** @deprecated use PIPELINE_RUN_* from PipelineRunModeToggle — kept for save-field compat */
export const PHENOTYPE_RUN_MANUAL = 'manual';
export const PHENOTYPE_RUN_AUTOMATIC = 'automatic';

/**
 * Deterministic cleanup before disease/HPO resolve (mirrors BE sanitize_clinical_query_text).
 * Turns junk separators like "hailey=hailey" into searchable tokens.
 */
export function sanitizePhenotypeQuery(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  s = s.replace(/[=_/|\\;:]+/g, ' ');
  s = s.replace(/[^\w\s\-'.,()]/gi, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[,;\s.]+|[,;\s.]+$/g, '');
  return s;
}

/** Strong disease match — auto-apply in Automatic analysis mode only. */
const AUTO_DISEASE_MIN_SCORE = 0.9;
/** Cap auto-selected differentials from a clinical note (matches narrative grounding). */
const MAX_AUTO_DISEASES = 3;

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

function _uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const s = String(x || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Normalized name so OMIM / ORPHA / MONDO rows for the same disease collapse. */
function diseaseNameClusterKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diseaseKey(d) {
  const nameKey = diseaseNameClusterKey(d?.disease_name || d?.name || '');
  return nameKey || String(d?.disease_id || d?.id || '').trim().toUpperCase();
}

function toDiseaseMatchRecord(d) {
  if (!d) return null;
  const name = String(d.disease_name || d.name || '').trim();
  if (!name) return null;
  return {
    id: d.disease_id || d.id || '',
    name,
    score: d.score != null ? d.score : null,
    source: d.source || '',
  };
}

function diseaseMatchKey(m) {
  return diseaseKey({
    disease_id: m?.id || m?.disease_id,
    disease_name: m?.name || m?.disease_name,
  });
}

function dedupeDiseaseMatches(list) {
  const byKey = new Map();
  for (const raw of list || []) {
    const rec = toDiseaseMatchRecord(raw);
    if (!rec) continue;
    const k = diseaseMatchKey(rec);
    if (!byKey.has(k)) byKey.set(k, rec);
  }
  return Array.from(byKey.values());
}

/** Hydrate multi-select list; fall back to legacy singular disease_match. */
function hydrateDiseaseMatches(phenoHpo) {
  const fromList = dedupeDiseaseMatches(phenoHpo?.disease_matches || []);
  if (fromList.length) return fromList;
  const single = toDiseaseMatchRecord(phenoHpo?.disease_match);
  return single ? [single] : [];
}

function phenotypeDiseaseLabel(matches) {
  return dedupeDiseaseMatches(matches)
    .map((m) => m.name)
    .filter(Boolean)
    .join('; ');
}

export function buildPhenotypeFieldsForSave({
  mode,
  findingsText,
  diseaseText,
  candidates,
  diseaseMatch = null,
  diseaseMatches = null,
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

  const matches = dedupeDiseaseMatches(
    Array.isArray(diseaseMatches) && diseaseMatches.length
      ? diseaseMatches
      : diseaseMatch
        ? [diseaseMatch]
        : []
  );
  const primaryMatch = matches[0] || null;

  let findings = '';
  let disease = '';
  let phenotype = '';
  let phenotype_note_clean = '';

  if (isNote) {
    findings = chipLabel || String(findingsText ?? '');
    disease =
      String(diseaseText ?? '').trim() ||
      matches.map((m) => m.name).filter(Boolean).join('; ');
    phenotype_note_clean = String(noteClean ?? '').trim();
    phenotype = (phenotype_note_clean || findings || disease).trim();
  } else {
    findings = '';
    disease = String(diseaseText ?? '').trim() || matches.map((m) => m.name).filter(Boolean).join('; ');
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
      disease_match: primaryMatch,
      disease_matches: matches,
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
    disease_keys: _uniqStrings(c.disease_keys || []),
  };
}

/** Keep pinned (selected) chips; merge incoming proposals without dropping selections.
 * For IDs already seen, preserve the user's selected/deselected choice (undo survives re-interpret).
 * New IDs take the backend auto-select default. Union disease_keys for multi-disease select.
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
        disease_keys: _uniqStrings([...(prev.disease_keys || []), ...(c.disease_keys || [])]),
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
  if (!diseaseHasHpoAnnotations(d)) return false;
  const score = diseaseScore(d);
  return score != null && score >= AUTO_DISEASE_MIN_SCORE;
}

/**
 * High-confidence catalog rows to auto-apply.
 * Automatic only: prefer diseases explicitly named by the note LLM
 * (disease_candidates); otherwise top score≥0.90 rows (capped).
 * Manual: never auto-select — analyst must click a disease match.
 */
function diseasesToAutoApply(
  catalog,
  runMode,
  { alreadyKeys = new Set(), namedNameKeys = null } = {}
) {
  if (runMode !== PHENOTYPE_RUN_AUTOMATIC) return [];

  let pool = (catalog || []).filter((d) => {
    if (!d || alreadyKeys.has(diseaseKey(d))) return false;
    return shouldAutoSelectDisease(d, runMode);
  });

  if (namedNameKeys && namedNameKeys.size) {
    const named = pool.filter((d) => namedNameKeys.has(diseaseNameClusterKey(d.disease_name)));
    if (named.length) pool = named;
  }

  return pool.slice(0, MAX_AUTO_DISEASES);
}

/** True when catalog metadata says this disease has ≥1 usable HPO annotation. */
function diseaseHasHpoAnnotations(d) {
  if (!d) return false;
  // Preview-only LLM names lack HPO metadata — allow until resolve fills counts.
  if (!d.has_hpo_meta) return true;
  const n = d.annotation_hpo_count;
  if (typeof n === 'number' && Number.isFinite(n)) return n > 0;
  return (d.hpo_ids || []).length > 0;
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
  const has_hpo_meta =
    Array.isArray(d.hpo_ids) ||
    typeof d.annotation_hpo_count === 'number' ||
    Array.isArray(d.member_ids) ||
    Array.isArray(d.sources);
  const hpo_ids = _uniqStrings(d.hpo_ids || []);
  const member_ids = _uniqStrings(d.member_ids || [d.disease_id || d.id].filter(Boolean));
  const sources = _uniqStrings(
    Array.isArray(d.sources) && d.sources.length
      ? d.sources
      : String(d.source || '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
  );
  const annotation_hpo_count =
    typeof d.annotation_hpo_count === 'number' && Number.isFinite(d.annotation_hpo_count)
      ? d.annotation_hpo_count
      : hpo_ids.length;
  return {
    disease_id: d.disease_id || d.id || '',
    disease_name,
    score,
    source: sources.join(';') || d.source || '',
    sources,
    hpo_ids,
    member_ids,
    annotation_hpo_count,
    has_hpo_meta,
  };
}

/** Merge disease lists by normalized name; union HPOs; keep richest id + highest score. */
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
    const prevHpo = prev.annotation_hpo_count || (prev.hpo_ids || []).length || 0;
    const nextHpo = d.annotation_hpo_count || (d.hpo_ids || []).length || 0;
    // Prefer the ontology row with more annotated HPOs (usually HPOA over bare MONDO).
    const preferIncomingId = nextHpo > prevHpo || (nextHpo === prevHpo && nextScore > prevScore);
    const hpo_ids = _uniqStrings([...(prev.hpo_ids || []), ...(d.hpo_ids || [])]);
    const member_ids = _uniqStrings([...(prev.member_ids || []), ...(d.member_ids || [])]);
    const sources = _uniqStrings([...(prev.sources || []), ...(d.sources || [])]);
    byKey.set(key, {
      ...prev,
      ...d,
      disease_id: preferIncomingId
        ? d.disease_id || prev.disease_id
        : prev.disease_id || d.disease_id,
      disease_name: prev.disease_name || d.disease_name,
      source: sources.join(';') || d.source || prev.source,
      sources,
      hpo_ids,
      member_ids,
      annotation_hpo_count: hpo_ids.length || Math.max(prevHpo, nextHpo),
      has_hpo_meta: Boolean(prev.has_hpo_meta || d.has_hpo_meta),
      score: Math.max(prevScore, nextScore) < 0 ? null : Math.max(prevScore, nextScore),
    });
  }
  return Array.from(byKey.values())
    .filter(diseaseHasHpoAnnotations)
    .sort((a, b) => {
      const as = a.score == null ? -1 : a.score;
      const bs = b.score == null ? -1 : b.score;
      if (bs !== as) return bs - as;
      return String(a.disease_name).localeCompare(String(b.disease_name));
    });
}

/**
 * Clinical-note phenotype panel (pinned findings + optional disease shortcut).
 */
/** Small (i) button that opens a short explanation on click; closes on outside click or Escape. */
function InfoHint({ label, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-middle" ref={wrapRef}>
      <button
        type="button"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ color: open ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info className="h-3 w-3" aria-hidden />
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-md border px-2.5 py-2 text-2xs font-normal leading-snug shadow-md space-y-1"
          style={{
            color: 'var(--text-secondary)',
            background: 'var(--bg-surface-raised)',
            borderColor: 'var(--border-default)',
          }}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

export default function PhenotypeInputPanel({
  value,
  onChange,
  disabled = false,
  conversationId = null,
}) {
  const candidates = value?.phenotype_hpo?.candidates || [];
  const diseaseMatches = hydrateDiseaseMatches(value?.phenotype_hpo);
  const diseaseMatch = diseaseMatches[0] || null;
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
      diseaseMatches,
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
    diseaseMatches,
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
          diseaseMatch: hydrateDiseaseMatches(value?.phenotype_hpo)[0] || null,
          diseaseMatches: hydrateDiseaseMatches(value?.phenotype_hpo),
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
    const resolvedMatches =
      patch.disease_matches !== undefined
        ? dedupeDiseaseMatches(patch.disease_matches)
        : cur.diseaseMatches || [];
    const fields = buildPhenotypeFieldsForSave({
      mode: PHENOTYPE_MODE_NOTE,
      findingsText:
        patch.phenotype_findings !== undefined
          ? patch.phenotype_findings
          : findingsLabelFrom(nextCandidates) || cur.findingsText,
      diseaseText:
        patch.phenotype_disease !== undefined
          ? patch.phenotype_disease
          : phenotypeDiseaseLabel(resolvedMatches) || cur.diseaseText,
      candidates: nextCandidates,
      diseaseMatch: resolvedMatches[0] || null,
      diseaseMatches: resolvedMatches,
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
      disease_matches: [],
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
        disease_matches: [],
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
    autoApplyingDiseaseRef.current = false;
    setDraft('');
    setInterpreting(false);
    setSearchingDiseases(false);
    // Clearing the note clears auto-detected disease + findings too.
    clearEphemeralPhenotypeResults({ keepPinned: false });
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

  const setGroupSelected = (group, selected) => {
    const ids = new Set(group.map((c) => c.hpo_id));
    const next = candidates.map((c) => (ids.has(c.hpo_id) ? { ...c, selected } : c));
    emit({
      candidates: next,
      phenotype_findings: findingsLabelFrom(next),
    });
  };

  const isActiveDisease = (d) => {
    if (!d) return false;
    const key = diseaseKey(d);
    return (diseaseMatches || []).some((m) => diseaseMatchKey(m) === key);
  };

  const removeDiseaseSelection = (disease) => {
    const key = diseaseKey(disease);
    const nextMatches = (stateRef.current.diseaseMatches || []).filter(
      (m) => diseaseMatchKey(m) !== key
    );
    const nextCandidates = (stateRef.current.candidates || [])
      .map((raw) => {
        const c = normalizeCandidate(raw);
        if (!c) return null;
        const keys = (c.disease_keys || []).filter((k) => k !== key);
        // Drop disease-only annotations that no longer belong to any selected disease.
        if (
          c.origin === 'disease_annotation' &&
          (c.disease_keys || []).length > 0 &&
          keys.length === 0
        ) {
          return null;
        }
        return { ...c, disease_keys: keys };
      })
      .filter(Boolean);
    emit({
      phenotype_disease: phenotypeDiseaseLabel(nextMatches),
      candidates: nextCandidates,
      disease_matches: nextMatches,
      phenotype_findings: findingsLabelFrom(nextCandidates),
      hpo_resolution_method: nextMatches.length ? stateRef.current.hpoResolutionMethod : null,
      propagated_from_related_records: nextMatches.length
        ? stateRef.current.propagatedFromRelated
        : [],
    });
    // Optimistic — sequential multi-apply must see updated matches before re-render.
    stateRef.current.diseaseMatches = nextMatches;
    stateRef.current.diseaseMatch = nextMatches[0] || null;
    stateRef.current.candidates = nextCandidates;
  };

  const clearDisease = () => {
    // Deselect all diseases — keep catalog (top_candidates) and note-pinned findings.
    const pinned = (stateRef.current.candidates || []).filter(
      (c) => c.selected && c.origin !== 'disease_annotation'
    );
    emit({
      phenotype_disease: '',
      candidates: pinned,
      disease_matches: [],
      hpo_resolution_method: null,
      propagated_from_related_records: [],
      phenotype_findings: findingsLabelFrom(pinned),
      // top_candidates intentionally unchanged
    });
    stateRef.current.diseaseMatches = [];
    stateRef.current.diseaseMatch = null;
    stateRef.current.candidates = pinned;
  };

  const applyDisease = useCallback(
    async (disease, { allowToggleOff = true } = {}) => {
      const name = sanitizePhenotypeQuery(disease?.disease_name || disease?.name || '');
      if (!name || disabled) return;

      // Toggle off if this disease is already selected (manual click only).
      if (allowToggleOff && isActiveDisease(disease)) {
        removeDiseaseSelection(disease);
        return;
      }
      if (!allowToggleOff && isActiveDisease(disease)) return;

      // Phase B: never select a catalog row known to have zero HPO annotations.
      if (disease?.has_hpo_meta && !diseaseHasHpoAnnotations(disease)) {
        setResolveError(
          'No clinical findings (HPO terms) are annotated for this disease — pick another match.'
        );
        return;
      }

      setResolving(true);
      setResolveError('');
      try {
        const resolved = await resolveHpoTerms({
          text: name,
          forceMode: PHENOTYPE_MODE_DISEASE,
        });
        const dKey = diseaseKey(disease);
        const fromDisease = mapResolveToCandidates(resolved, {
          defaultSelected: runModeRef.current === PHENOTYPE_RUN_AUTOMATIC,
        })
          .map((c) =>
            isInheritanceLikeHpo(c) ? { ...c, selected: false, selected_default: false } : c
          )
          .map((c) => ({ ...c, disease_keys: [dKey] }));
        if (!fromDisease.length) {
          setResolveError(
            'No clinical findings (HPO terms) are annotated for this disease — pick another match.'
          );
          return;
        }
        const match = toDiseaseMatchRecord(
          resolved.disease_match || {
            disease_id: disease.disease_id || disease.id || '',
            disease_name: name,
            score: disease.score,
            source: disease.source,
          }
        );
        const nextMatches = dedupeDiseaseMatches([
          ...(stateRef.current.diseaseMatches || []),
          match,
        ]);
        const merged = mergeCandidates(stateRef.current.candidates || [], fromDisease);
        const catalog = mergeDiseaseCatalog(stateRef.current.topCandidates, [
          {
            ...match,
            disease_id: match?.id,
            disease_name: match?.name,
            hpo_ids: (resolved.hpo_ids || fromDisease.map((c) => c.hpo_id)).filter(Boolean),
            annotation_hpo_count: (resolved.hpo_ids || fromDisease).length,
            member_ids: disease.member_ids,
            sources: disease.sources,
          },
          ...(resolved.top_candidates || []),
          disease,
        ]);
        emit({
          phenotype_disease: phenotypeDiseaseLabel(nextMatches),
          candidates: merged,
          disease_matches: nextMatches,
          top_candidates: catalog,
          hpo_resolution_method: resolved.hpo_resolution_method || null,
          propagated_from_related_records: resolved.propagated_from_related_records || [],
          phenotype_findings: findingsLabelFrom(merged),
        });
        stateRef.current.diseaseMatches = nextMatches;
        stateRef.current.diseaseMatch = nextMatches[0] || null;
        stateRef.current.candidates = merged;
        stateRef.current.topCandidates = catalog;
      } catch (err) {
        setResolveError(err?.message || 'Could not load findings for that disease');
      } finally {
        setResolving(false);
      }
    },
    // isActiveDisease/removeDiseaseSelection close over latest matches via render; emit is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, emit, diseaseMatches]
  );

  const applyDiseaseRef = useRef(applyDisease);
  const autoApplyingDiseaseRef = useRef(false);
  useEffect(() => {
    applyDiseaseRef.current = applyDisease;
  }, [applyDisease]);

  const autoApplyTopDisease = useCallback(async (disease) => {
    if (!disease || autoApplyingDiseaseRef.current) return;
    // Skip if this disease is already in the multi-select set.
    const curList = stateRef.current.diseaseMatches || [];
    const key = diseaseKey(disease);
    if (curList.some((m) => diseaseMatchKey(m) === key)) return;
    autoApplyingDiseaseRef.current = true;
    try {
      await applyDiseaseRef.current?.(disease, { allowToggleOff: false });
    } finally {
      autoApplyingDiseaseRef.current = false;
    }
  }, []);

  const autoApplyDiseases = useCallback(async (diseases, seqRef, seq) => {
    for (const d of diseases || []) {
      if (seqRef.current !== seq) return;
      await autoApplyTopDisease(d);
    }
  }, [autoApplyTopDisease]);

  const runInterpretNote = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (trimmed.length < 8 || disabled) return;
    const seq = ++interpretSeq.current;
    // Invalidate in-flight raw fast-search so it cannot overwrite LLM-grounded matches.
    diseaseSeq.current += 1;
    setSearchingDiseases(false);
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

      // Keep user's disease selections if still in catalog; then auto-apply all high-score hits.
      const prevList = stateRef.current.diseaseMatches || [];
      let nextMatches = prevList
        .map((prev) => {
          const found = catalog.find(
            (d) =>
              (prev.id && d.disease_id && prev.id === d.disease_id) ||
              String(d.disease_name || '').toLowerCase() === String(prev.name || '').toLowerCase()
          );
          if (!found) return null;
          return {
            id: found.disease_id || prev.id || '',
            name: found.disease_name,
            score: found.score != null ? found.score : prev.score,
            source: found.source || prev.source,
          };
        })
        .filter(Boolean);

      const alreadyKeys = new Set(nextMatches.map(diseaseMatchKey));
      const namedNameKeys = new Set(
        (data.disease_candidates || [])
          .map((c) => diseaseNameClusterKey(c?.name || ''))
          .filter(Boolean)
      );
      const toAuto = diseasesToAutoApply(catalog, runModeRef.current, {
        alreadyKeys,
        namedNameKeys,
      });

      setNotePreview(data);
      setNoteUnmapped(data.unmapped || []);
      setNoteAmbiguous(data.ambiguous || []);

      emit({
        phenotype_mode: PHENOTYPE_MODE_NOTE,
        phenotype_note_clean: data.deidentified_text || stateRef.current.noteCleanText || '',
        phenotype_disease: phenotypeDiseaseLabel(nextMatches),
        phenotype_findings: findingsLabelFrom(mergedFindings),
        candidates: mergedFindings,
        disease_matches: nextMatches,
        top_candidates: catalog,
        hpo_resolution_method: nextMatches.length
          ? stateRef.current.hpoResolutionMethod
          : data.hpo_resolution_method || null,
        propagated_from_related_records: nextMatches.length
          ? stateRef.current.propagatedFromRelated
          : data.propagated_from_related_records || [],
        ...(data.patient?.sex ? { sampleSex: data.patient.sex } : {}),
      });
      stateRef.current.diseaseMatches = nextMatches;
      stateRef.current.candidates = mergedFindings;
      stateRef.current.topCandidates = catalog;

      if (toAuto.length && seq === interpretSeq.current) {
        await autoApplyDiseases(toAuto, interpretSeq, seq);
      }
    } catch (err) {
      if (seq !== interpretSeq.current) return;
      setResolveError(err?.message || 'Could not interpret clinical note');
    } finally {
      if (seq === interpretSeq.current) setInterpreting(false);
    }
  }, [disabled, emit, autoApplyDiseases]);

  /** Fast disease catalog update — deterministic resolve, no LLM. */
  const runFastDiseaseSearch = useCallback(async (text) => {
    const trimmed = sanitizePhenotypeQuery(text);
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
          disease_matches: [],
          phenotype_disease: '',
        });
        return;
      }

      // Prefer API disease_match when it qualifies; else top catalog row(s).
      const preferredAutos = diseasesToAutoApply(
        [
          resolved.disease_match
            ? {
                disease_id: resolved.disease_match.id,
                disease_name: resolved.disease_match.name,
                score: resolved.disease_match.score,
                source: resolved.disease_match.source,
                ...(catalog.find(
                  (d) =>
                    d.disease_id === resolved.disease_match.id ||
                    String(d.disease_name || '').toLowerCase() ===
                      String(resolved.disease_match.name || '').toLowerCase()
                ) || {}),
              }
            : null,
          ...catalog,
        ].filter(Boolean),
        runModeRef.current,
        {}
      );

      // Preserve multi-select; only refresh the ranked disease list.
      const prevList = stateRef.current.diseaseMatches || [];
      const nextMatches = prevList
        .map((prev) => {
          const found = catalog.find(
            (d) =>
              (prev.id && d.disease_id && prev.id === d.disease_id) ||
              String(d.disease_name || '').toLowerCase() === String(prev.name || '').toLowerCase()
          );
          if (!found) return null;
          return {
            id: found.disease_id || prev.id || '',
            name: found.disease_name,
            score: found.score != null ? found.score : prev.score,
            source: found.source || prev.source,
          };
        })
        .filter(Boolean);

      const alreadyKeys = new Set(nextMatches.map(diseaseMatchKey));
      const toAuto = preferredAutos.filter((d) => !alreadyKeys.has(diseaseKey(d)));

      emit({
        top_candidates: catalog,
        disease_matches: nextMatches,
        phenotype_disease: phenotypeDiseaseLabel(nextMatches),
      });
      stateRef.current.diseaseMatches = nextMatches;
      stateRef.current.topCandidates = catalog;

      if (toAuto.length && seq === diseaseSeq.current) {
        await autoApplyDiseases(toAuto, diseaseSeq, seq);
      }
    } catch (err) {
      if (seq !== diseaseSeq.current) return;
      // Soft-fail: interpret path may still populate diseases.
      console.warn('[Phenotype] fast disease search failed', err);
    } finally {
      if (seq === diseaseSeq.current) setSearchingDiseases(false);
    }
  }, [disabled, emit, autoApplyDiseases]);

  // Fast disease matches on every edit (short debounce) — scores refresh from the current text.
  useEffect(() => {
    if (disabled) return undefined;
    if (diseaseDebounceRef.current) clearTimeout(diseaseDebounceRef.current);
    const trimmed = String(draft || '').trim();
    if (trimmed.length < 3) {
      setSearchingDiseases(false);
      diseaseSeq.current += 1;
      autoApplyingDiseaseRef.current = false;
      // Cleared / too short: wipe disease matches, cleaned note, and all findings (incl. auto-selected).
      if (
        stateRef.current.topCandidates?.length ||
        stateRef.current.noteCleanText ||
        notePreviewRef.current ||
        stateRef.current.diseaseMatch ||
        (stateRef.current.diseaseMatches || []).length > 0 ||
        (stateRef.current.candidates || []).length > 0
      ) {
        clearEphemeralPhenotypeResults({ keepPinned: false });
      }
      return undefined;
    }
    // Longer notes: LLM interpret owns disease/HPO grounding (corrected names).
    // Fast resolve on raw draft would defeat typo/special-char cleanup.
    if (trimmed.length >= 8) {
      setSearchingDiseases(false);
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
      // Fully cleared / too short for interpret: do not re-emit pinned chips here —
      // the disease-search effect owns the empty-note wipe (keeps races from restoring selections).
      if (trimmed.length < 3) {
        return undefined;
      }
      // Shortened but still typing (3–7 chars): drop cleaned note + unselected proposals only.
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

  const renderChip = (c) => {
    const label = c.hpo_name || c.matched_phrase || c.hpo_id;
    return (
      <button
        key={c.hpo_id}
        type="button"
        disabled={disabled}
        onClick={() => toggleCandidate(c.hpo_id)}
        title={c.hpo_id || undefined}
        aria-pressed={!!c.selected}
        className="inline-flex items-center px-2 py-1 text-2xs rounded-md border text-left"
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
          {label}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          Phenotype
        </label>
        <InfoHint label="About phenotype">
          <p>Clinical findings are used to rank variants by how well they fit the patient.</p>
          {isAutomatic ? (
            <p>
              Automatic mode pre-selects strong disease matches and high-confidence findings.
              Click any of them to change it.
            </p>
          ) : null}
        </InfoHint>
      </div>

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
            title="Clear note and detected findings"
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
          <div className="flex items-center gap-1 font-medium" style={{ color: 'var(--text-primary)' }}>
            Disease matches
            <InfoHint label="About disease matches">
              <p>Pick one or more. Their clinical findings are combined below.</p>
            </InfoHint>
          </div>

          <button
            type="button"
            disabled={disabled || resolving}
            onClick={() => applyDisease(primaryDisease)}
            title={primaryDisease.disease_id || undefined}
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
          </button>

          {visibleAlts.map((c) => (
            <button
              key={diseaseKey(c)}
              type="button"
              disabled={disabled || resolving}
              onClick={() => applyDisease(c)}
              title={c.disease_id || undefined}
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
            </span>
          ) : null}
        </div>
        {(clinicalCandidates.length > 0 || inheritanceCandidates.length > 0) && (
          <div className="flex flex-wrap justify-end gap-2 text-2xs">
            {inheritanceCandidates.length > 0 && (
              <button
                type="button"
                className="underline"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setShowInheritance((v) => !v)}
                disabled={disabled}
              >
                {showInheritance
                  ? `Hide inheritance (${inheritanceCandidates.length})`
                  : `Show inheritance (${inheritanceCandidates.length})`}
              </button>
            )}
            {clinicalCandidates.length > 0 && (
              <>
                <button
                  type="button"
                  className="underline"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => setGroupSelected(clinicalCandidates, true)}
                  disabled={disabled}
                >
                  Select all
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
              </>
            )}
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

      {showInheritance && inheritanceCandidates.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-2xs" style={{ color: 'var(--text-tertiary)' }}>
            Inheritance terms
            <InfoHint label="About inheritance terms">
              <p>Optional. These aren't used as clinical findings unless you select them.</p>
            </InfoHint>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto opacity-80">
            {inheritanceCandidates.map(renderChip)}
          </div>
        </div>
      )}

      {selectedCount > 0 && (
        <PanelAppSuggestSection
          confirmedHpoIds={candidates.filter((c) => c.selected).map((c) => c.hpo_id)}
          // Stable text only — live `draft` was re-fetching panels on every keystroke.
          phenotypeText={
            value?.phenotype ||
            value?.phenotype_note_clean ||
            value?.phenotype_disease ||
            ''
          }
          value={value}
          conversationId={conversationId}
          disabled={disabled}
          isAutomatic={isAutomatic}
          onChange={(panelPatch) => {
            // Parent merges into sample_metadata; send panel keys only.
            onChangeRef.current?.(panelPatch);
          }}
        />
      )}
    </div>
  );
}
