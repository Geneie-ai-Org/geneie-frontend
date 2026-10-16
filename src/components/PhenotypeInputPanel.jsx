/**
 * Germline phenotype entry via clinical note.
 * Selected HPO finding IDs (confirmed_ids) drive phenotype prioritization.
 * Disease matches are a shortcut to load annotated findings for review.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Circle, Info, Lock, Plus, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChipList, CountUp, PopIn, StageMark } from '@/components/motion';
import { interpretPhenotypeNarrative, resolveHpoTerms, suggestHpoTerms } from '@/services/mongodbApi';
import PanelAppSuggestSection from '@/components/PanelAppSuggestSection';
import { AiSuggestedTag } from '@/components/tabs/ModeParts';

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
/** Small (i) button that opens a short explanation. A popover, so Esc closes it and focus returns. */
function InfoHint({ label, children }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] after:absolute after:-inset-2.5"
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-1 text-xs font-normal leading-snug">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export default function PhenotypeInputPanel({
  value,
  onChange,
  disabled = false,
  conversationId = null,
  // The note only reaches `onChange` once it has been de-identified, so a parent that
  // needs to know whether anything is typed yet (e.g. a "Skip" label) listens here.
  onDraftChange,
  // The upload forms name the step "Phenotype (optional)" in their header already.
  hideLabel = false,
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

  // Reopening the step (Back → Continue, or editing a saved case) remounts this panel.
  // Start from the saved note, and leave the saved results alone until the user edits it —
  // otherwise the empty/unchanged draft reads as "note cleared" and wipes them.
  // Only the cleaned note: `phenotype` falls back to a findings/disease label the user never
  // typed, and editing that would re-interpret it and replace their picks.
  const [draft, setDraft] = useState(() => value?.phenotype_note_clean || '');
  const untouchedDraftRef = useRef(draft);
  const isUntouchedDraft = (text) => {
    if (untouchedDraftRef.current === null) return false;
    if (text === untouchedDraftRef.current) return true;
    untouchedDraftRef.current = null;
    return false;
  };
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    onDraftChangeRef.current?.(draft);
  }, [draft]);
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

  /** A term the user searched for and picked: it joins the list already selected, marked as theirs. */
  const addFinding = (hit) => {
    const hid = String(hit?.hpo_id || '').trim().toUpperCase();
    if (!hid.startsWith('HP:')) return;
    const exists = candidates.some((c) => c.hpo_id === hid);
    const next = exists
      ? candidates.map((c) => (c.hpo_id === hid ? { ...c, selected: true } : c))
      : [
          ...candidates,
          {
            hpo_id: hid,
            hpo_name: hit.hpo_name || '',
            matched_phrase: hit.matched_phrase || hit.hpo_name || '',
            match_score: hit.match_score,
            match_type: 'user_added',
            origin: 'user',
            selected: true,
            selected_default: false,
          },
        ];
    emit({ candidates: next, phenotype_findings: findingsLabelFrom(next) });
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
    if (isUntouchedDraft(draft)) return undefined;
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
    if (isUntouchedDraft(draft)) return undefined;
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

  // ---- presentation (logic above is unchanged) ----

  const FINDINGS_PREVIEW = 10;
  const CONDITIONS_PREVIEW = 3;
  const EXAMPLE_NOTE = 'Painful blisters in skin folds, armpits and groin since childhood';

  const [showAllFindings, setShowAllFindings] = useState(false);

  // Stable order: findings read from the note first, then those added by a condition; within
  // each, best match first. Never ordered by selection, so chips do not jump on a click.
  const orderedClinical = useMemo(() => {
    const score = (c) => {
      const n = Number(c.match_score);
      return Number.isFinite(n) ? n : -1;
    };
    return clinicalCandidates
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const rank = (o) => (o === 'disease_annotation' ? 2 : o === 'user' ? 1 : 0);
        const ao = rank(a.c.origin);
        const bo = rank(b.c.origin);
        if (ao !== bo) return ao - bo;
        const diff = score(b.c) - score(a.c);
        if (diff !== 0) return diff;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }, [clinicalCandidates]);

  const noteFoundCount = orderedClinical.filter((c) => c.origin !== 'disease_annotation' && c.origin !== 'user').length;
  const clinicalSelectedCount = clinicalCandidates.filter((c) => c.selected).length;
  const visibleFindings = showAllFindings
    ? orderedClinical
    : orderedClinical.slice(0, FINDINGS_PREVIEW);
  const hiddenFindingsCount = orderedClinical.length - visibleFindings.length;
  const hiddenSelectedCount = showAllFindings
    ? 0
    : orderedClinical.slice(FINDINGS_PREVIEW).filter((c) => c.selected).length;
  const noteGroup = visibleFindings.filter((c) => c.origin !== 'disease_annotation' && c.origin !== 'user');
  const userGroup = visibleFindings.filter((c) => c.origin === 'user');
  const conditionGroup = visibleFindings.filter((c) => c.origin === 'disease_annotation');
  const groupsLabelled = [noteGroup, userGroup, conditionGroup].filter((g) => g.length > 0).length > 1;

  const unmappedCount = noteUnmapped.length;
  const draftLen = draft.trim().length;
  const working = searchingDiseases || interpreting;

  const allConditions = primaryDisease ? [primaryDisease, ...altDiseases] : [];
  const showConditionStep = allConditions.length > 0;
  const showFindingsStep = clinicalCandidates.length > 0 || inheritanceCandidates.length > 0;
  const showPanelsStep = selectedCount > 0 || (value?.selected_panels || []).length > 0;
  let stepNo = 1;
  const conditionStepNo = showConditionStep ? ++stepNo : 0;
  const findingsStepNo = showFindingsStep ? ++stepNo : 0;
  const panelsStepNo = showPanelsStep ? ++stepNo : 0;

  // One toggle per finding. There's no separate remove: an unselected finding is already left
  // out of ranking, and removing one could only be undone by re-applying the disease.
  // Chips pop in as they are found (PopIn) and the row re-flows around them.
  const renderChip = (c) => {
    const label = c.hpo_name || c.matched_phrase || c.hpo_id;
    return (
      <PopIn key={c.hpo_id} className="max-w-full">
        <FindingChip candidate={c} label={label} disabled={disabled} onToggle={toggleCandidate} />
      </PopIn>
    );
  };

  return (
    <div className="space-y-5 text-foreground">
      {/* 1. Describe */}
      <section className="space-y-2" aria-labelledby="pheno-step-describe">
        <div className="flex items-center gap-1.5">
          {hideLabel ? (
            <StepHeader id="pheno-step-describe" n={1} title="Describe the patient" />
          ) : (
            <StepHeader id="pheno-step-describe" n={1} title="Phenotype" aside="Optional" />
          )}
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
          <Textarea
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
            aria-label="Clinical note"
            aria-describedby="pheno-note-status"
            placeholder="Describe symptoms, age of onset and anything notable in your own words"
            rows={5}
            className="min-h-28 resize-none rounded-2xl border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] dark:bg-[hsl(var(--wb-card))] px-4 py-3 pr-11 text-base transition-[border-color,box-shadow] duration-200 hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] md:text-[13px] md:leading-5"
          />
          {draft.trim() && !disabled && (
            <button
              type="button"
              onClick={clearNoteOnly}
              aria-label="Clear note and detected findings"
              title="Clear note and detected findings"
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] max-md:size-11"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        {draftLen === 0 && !disabled ? (
          <p className="text-xs text-muted-foreground">
            Example: <span className="italic">{EXAMPLE_NOTE}</span>{' '}
            <button
              type="button"
              onClick={() => setDraft(EXAMPLE_NOTE)}
              className="rounded-full font-medium underline underline-offset-2 outline-none transition-colors hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] max-md:inline-flex max-md:min-h-11 max-md:items-center"
              style={{ color: 'hsl(var(--brand-solid))' }}
            >
              Use example
            </button>
          </p>
        ) : null}

        <p
          id="pheno-note-status"
          role="status"
          aria-live="polite"
          className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        >
          {working ? (
            <span className="wb-status" data-state="running">
              {searchingDiseases ? 'Finding matches' : 'Reading note'}
            </span>
          ) : draftLen > 0 && draftLen < 3 ? (
            <span>Keep typing to search…</span>
          ) : notePreview || candidates.length > 0 ? (
            <span className="wb-status" data-state={noteFoundCount > 0 ? 'done' : 'pending'}>
              {noteFoundCount > 0 ? (
                <span>
                  Found <CountUp value={noteFoundCount} duration={0.4} /> finding{noteFoundCount === 1 ? '' : 's'}
                </span>
              ) : (
                'No findings recognised yet'
              )}
            </span>
          ) : null}
          {!working ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="size-3" aria-hidden />
              Patient names are removed automatically.
            </span>
          ) : null}
        </p>

        {(unmappedCount > 0 || noteAmbiguous.length > 0) && !working && (
          <div
            role="note"
            className="wb-rise flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[13px]"
            style={{
              background: 'var(--warning-soft)',
              border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            }}
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
            <div className="min-w-0 space-y-1 text-foreground">
              {unmappedCount > 0 && (
                <p>
                  <span className="font-medium">Could not map: </span>
                  <span className="break-words">{noteUnmapped.join('; ')}</span>
                  <span className="block text-muted-foreground">
                    These terms are not used for ranking. Try rewording them.
                  </span>
                </p>
              )}
              {noteAmbiguous.length > 0 && (
                <p>
                  <span className="font-medium">Ambiguous: </span>
                  <span className="break-words">{noteAmbiguous.join('; ')}</span>
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {!disabled && (
        <FindingSearch
          selectedIds={new Set(candidates.filter((c) => c.selected).map((c) => c.hpo_id))}
          onPick={addFinding}
        />
      )}

      {/* Loading skeleton: matches the finding chips' size, so nothing jumps when they arrive. */}
      {interpreting && !showFindingsStep && !showConditionStep && (
        <section className="space-y-2.5 border-t border-[hsl(var(--wb-line))] pt-4" aria-label="Reading your note" aria-busy="true">
          <div className="wb-shimmer h-4 w-36 rounded-full" />
          <div className="flex flex-wrap gap-1.5" aria-hidden>
            {[88, 120, 72, 104, 96, 132, 80].map((w, i) => (
              <span key={i} className="wb-shimmer h-7 rounded-full" style={{ width: w }} />
            ))}
          </div>
        </section>
      )}

      {/* 2. Confirm condition */}
      {showConditionStep &&
        (() => {
          // The first few matches stay visible; a selected match stays visible wherever it ranks.
          const collapsed = allConditions.filter(
            (c, i) => i < CONDITIONS_PREVIEW || isActiveDisease(c)
          );
          const shown = showMoreDiseases ? allConditions : collapsed;
          const hiddenCount = allConditions.length - collapsed.length;
          const activeCount = allConditions.filter(isActiveDisease).length;
          // Rows revealed by "Show more" ease in; a row that merely changes state never replays it.
          const renderCondition = (c, i) => (
            <li key={diseaseKey(c)} className={i >= CONDITIONS_PREVIEW ? 'wb-rise' : undefined}>
              <ConditionRow
                condition={c}
                active={isActiveDisease(c)}
                disabled={disabled || resolving}
                onToggle={applyDisease}
              />
            </li>
          );
          return (
            <section
              className="wb-rise space-y-2 border-t border-[hsl(var(--wb-line))] pt-4"
              aria-labelledby="pheno-step-condition"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <StepHeader id="pheno-step-condition" n={conditionStepNo} title="Confirm the condition" />
                  <InfoHint label="About disease matches">
                    <p>Pick one or more. Their clinical findings are added to the list below.</p>
                  </InfoHint>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {activeCount > 0 ? (
                    <>
                      <CountUp value={activeCount} duration={0.3} /> selected
                    </>
                  ) : (
                    'Optional'
                  )}
                </span>
              </div>

              <ul className="m-0 list-none space-y-1.5 p-0">{shown.map(renderCondition)}</ul>

              {hiddenCount > 0 || showMoreDiseases ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setShowMoreDiseases((v) => !v)}
                  aria-expanded={showMoreDiseases}
                  className="text-muted-foreground max-md:h-11"
                >
                  {showMoreDiseases ? (
                    <>
                      Show fewer <ChevronUp aria-hidden />
                    </>
                  ) : (
                    <>
                      Show {hiddenCount} more <ChevronDown aria-hidden />
                    </>
                  )}
                </Button>
              ) : null}

              {/* Says what picking does, until something is picked. */}
              {activeCount === 0 && !resolving && (
                <p className="text-xs text-muted-foreground">
                  Pick a condition to add its known findings. You can also skip this.
                </p>
              )}
              {propagatedFromRelated?.length > 0 && isActiveDisease(primaryDisease) && (
                <p className="text-xs text-muted-foreground">
                  Includes annotations from {propagatedFromRelated.length} related subtype
                  {propagatedFromRelated.length === 1 ? '' : 's'}.
                </p>
              )}
              {resolving && (
                <p
                  role="status"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <StageMark state="running" size={14} />
                  Loading findings for this condition
                </p>
              )}
            </section>
          );
        })()}

      {resolveError && (
        <div
          role="alert"
          className="wb-rise flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[13px]"
          style={{
            background: 'var(--error-soft)',
            border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
          }}
        >
          <StageMark state="failed" size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 text-foreground">{resolveError}</span>
        </div>
      )}

      {/* 3. Review findings */}
      {showFindingsStep && (
        <section
          className="wb-rise space-y-2.5 border-t border-[hsl(var(--wb-line))] pt-4"
          aria-labelledby="pheno-step-findings"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <StepHeader id="pheno-step-findings" n={findingsStepNo} title="Review findings" />
            {clinicalCandidates.length > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={disabled || clinicalSelectedCount === clinicalCandidates.length}
                  onClick={() => setGroupSelected(clinicalCandidates, true)}
                  className="max-md:h-11 max-md:px-3"
                >
                  Select all {clinicalCandidates.length}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={disabled || clinicalSelectedCount === 0}
                  onClick={() => setGroupSelected(clinicalCandidates, false)}
                  className="max-md:h-11 max-md:px-3"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {clinicalCandidates.length > 0 && (
            <p role="status" className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                <CountUp value={clinicalSelectedCount} duration={0.3} /> of {clinicalCandidates.length} selected
              </span>
              {' · '}
              {selectedCount === 0
                ? 'Pick the findings that match this patient. Ranking uses only the ones you select.'
                : `${selectedCount} finding${selectedCount === 1 ? '' : 's'} drive${selectedCount === 1 ? 's' : ''} phenotype ranking.`}
            </p>
          )}

          {clinicalSelectedCount > 0 && (
            <div className="rounded-2xl border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] px-3 py-2.5" role="group" aria-label="Selected for ranking">
              <p className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-[hsl(var(--brand-700))]">
                <span>Selected for ranking</span>
                <span className="tabular-nums"><CountUp value={clinicalSelectedCount} duration={0.3} /></span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ChipList>
                  {clinicalCandidates.filter((c) => c.selected).map((c) => {
                    const label = c.hpo_name || c.matched_phrase || c.hpo_id;
                    const ai = c.origin === 'note_phrase' || (c.origin !== 'disease_annotation' && c.origin !== 'user');
                    return (
                      <PopIn key={c.hpo_id} className="max-w-full">
                        <span
                          className={`inline-flex h-7 max-w-full items-center gap-1 rounded-full border bg-[hsl(var(--wb-card))] pl-2.5 pr-1 text-xs font-medium text-[hsl(var(--brand-700))] ${ai ? 'border-dashed border-[hsl(var(--brand-300))]' : 'border-[hsl(var(--brand-200))]'}`}
                          title={c.hpo_id ? `${label} · ${c.hpo_id}` : label}
                        >
                          {ai ? <Sparkles aria-hidden className="size-3 shrink-0" /> : null}
                          <span className="truncate">{label}</span>
                          {ai ? <span className="sr-only"> (AI suggested)</span> : null}
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleCandidate(c.hpo_id)}
                            aria-label={`Remove ${label} from ranking`}
                            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[hsl(var(--brand-100))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:opacity-50 max-md:size-8"
                          >
                            <X className="size-3" aria-hidden />
                          </button>
                        </span>
                      </PopIn>
                    );
                  })}
                </ChipList>
              </div>
            </div>
          )}

          {clinicalCandidates.length > 0 && (
            <div className="space-y-2.5">
              {noteGroup.length > 0 && (
                <FindingGroup label={groupsLabelled ? 'From your note' : null} aiTag>
                  {noteGroup.map(renderChip)}
                </FindingGroup>
              )}
              {userGroup.length > 0 && (
                <FindingGroup label="Added by you">
                  {userGroup.map(renderChip)}
                </FindingGroup>
              )}
              {conditionGroup.length > 0 && (
                <FindingGroup label={groupsLabelled ? 'From selected conditions' : 'From the selected condition'}>
                  {conditionGroup.map(renderChip)}
                </FindingGroup>
              )}
            </div>
          )}

          {(hiddenFindingsCount > 0 || showAllFindings) && orderedClinical.length > FINDINGS_PREVIEW && (
            <div className="flex flex-wrap items-center gap-x-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAllFindings((v) => !v)}
                aria-expanded={showAllFindings}
                className="text-muted-foreground max-md:h-11"
              >
                {showAllFindings ? (
                  <>
                    Show top {FINDINGS_PREVIEW} <ChevronUp aria-hidden />
                  </>
                ) : (
                  <>
                    Show all {orderedClinical.length} <ChevronDown aria-hidden />
                  </>
                )}
              </Button>
              {hiddenSelectedCount > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {hiddenSelectedCount} selected but hidden
                </span>
              )}
            </div>
          )}

          {inheritanceCandidates.length > 0 && (
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowInheritance((v) => !v)}
                disabled={disabled}
                aria-expanded={showInheritance}
                className="text-muted-foreground max-md:h-11"
              >
                {showInheritance ? 'Hide' : 'Show'} inheritance terms ({inheritanceCandidates.length})
                {showInheritance ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
              </Button>
              {showInheritance && (
                <FindingGroup label="Inheritance (not used unless you select them)">
                  {inheritanceCandidates.map(renderChip)}
                </FindingGroup>
              )}
            </div>
          )}
        </section>
      )}

      {/* Also shown while a panel is still chosen: its genes are sent with the upload,
        * so it must stay visible (and removable) even with no findings selected. */}
      {showPanelsStep && (
        <section className="border-t border-[hsl(var(--wb-line))] pt-4" aria-label={`Step ${panelsStepNo}: gene panels`}>
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
        </section>
      )}

      {/* What saving does, in words. The parent dialog owns the Save button. */}
      {selectedCount > 0 && (
        <section className="wb-rise rounded-2xl border border-dashed border-[hsl(var(--wb-line-strong))] px-3.5 py-3" aria-label="What happens next">
          <p className="m-0 text-xs font-semibold text-foreground">What happens next</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-muted-foreground">
            Saving keeps these {selectedCount} finding{selectedCount === 1 ? '' : 's'} on the sample. When you run Phenotype
            on the annotated file, variants are ranked by how well they fit them
            {showPanelsStep ? '. The gene panels you pick boost their genes in the Triage ranking' : ''}.
          </p>
        </section>
      )}
    </div>
  );
}

/** Add one finding by name: live suggestions from the HPO typeahead, picked as pills. */
function FindingSearch({ selectedIds, onPick }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const text = q.trim();
    const mine = ++seq.current;
    if (text.length < 2) {
      setHits([]);
      setLoading(false);
      setFailed(false);
      return undefined;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await suggestHpoTerms({ text, limit: 8 });
        if (mine !== seq.current) return;
        setHits((res?.suggestions || []).filter((h) => String(h?.hpo_id || '').startsWith('HP:')));
        setFailed(false);
      } catch {
        if (mine !== seq.current) return;
        setHits([]);
        setFailed(true);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [q]);
  const text = q.trim();
  return (
    <section className="space-y-2" aria-label="Add a finding">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); } }}
          placeholder="Or add a finding by name, for example “nail dystrophy”"
          aria-label="Add a finding by name"
          aria-describedby="pheno-add-status"
          className="h-9 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-9 pr-9 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] md:text-[13px] max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] max-md:size-9"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <p id="pheno-add-status" role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {loading ? 'Searching…' : failed ? 'Search is unavailable right now.' : text.length >= 2 && hits.length === 0 ? 'No matching terms. Try another word.' : ''}
      </p>
      {hits.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Suggested terms">
          {hits.map((h) => {
            const picked = selectedIds.has(String(h.hpo_id).toUpperCase());
            return (
              <li key={h.hpo_id}>
                <button
                  type="button"
                  disabled={picked}
                  onClick={() => { onPick(h); }}
                  title={`${h.hpo_name || h.matched_phrase} · ${h.hpo_id}`}
                  className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-2 pr-3 text-xs font-medium text-foreground outline-none transition-colors duration-150 hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:opacity-60 motion-reduce:transition-none max-md:min-h-11"
                >
                  {picked ? <Check aria-hidden className="size-3 shrink-0" /> : <Plus aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{h.hpo_name || h.matched_phrase || h.hpo_id}</span>
                  {picked ? <span className="sr-only"> (already selected)</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function StepHeader({ id, n, title, aside }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[11px] font-semibold tabular-nums text-[hsl(var(--brand-700))]"
      >
        {n}
      </span>
      <span>{title}</span>
      {aside ? <span className="text-xs font-normal text-muted-foreground">{aside}</span> : null}
    </h3>
  );
}

function FindingGroup({ label, aiTag = false, children }) {
  return (
    <div className="space-y-1.5">
      {label || aiTag ? (
        <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          {label}
          {aiTag ? <AiSuggestedTag>AI suggested from your note</AiSuggestedTag> : null}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5 max-md:gap-2">
        <ChipList>{children}</ChipList>
      </div>
    </div>
  );
}

function FindingChip({ candidate: c, label, disabled, onToggle }) {
  const selected = !!c.selected;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(c.hpo_id)}
      aria-pressed={selected}
      title={c.hpo_id ? `${label} · ${c.hpo_id}` : label}
      className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border pl-2 pr-3 text-xs font-medium outline-none transition-[background-color,border-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] active:scale-[0.97] disabled:opacity-60 motion-reduce:transition-none max-md:min-h-11 max-md:px-3 ${
        selected
          ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
          : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] text-foreground hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]'
      }`}
    >
      {selected ? (
        <Check className="wb-draw-lucide size-3 shrink-0" strokeWidth={2.6} aria-hidden />
      ) : (
        <Circle className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Radio-style row. Picking several is allowed, so it keeps toggle (aria-pressed) semantics. */
function ConditionRow({ condition: c, active, disabled, onToggle }) {
  const score = c.score;
  const strong = score != null && score >= AUTO_DISEASE_MIN_SCORE;
  const hints = [];
  if (score != null) hints.push(`${strong ? 'Strong match' : 'Match'} ${Number(score).toFixed(2)}`);
  if (c.annotation_hpo_count > 0) {
    hints.push(`${c.annotation_hpo_count} known finding${c.annotation_hpo_count === 1 ? '' : 's'}`);
  }
  const src = (c.sources || []).slice(0, 2).join(', ');
  if (src) hints.push(src);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(c)}
      aria-pressed={active}
      title={c.disease_id ? `${c.disease_name} · ${c.disease_id}` : c.disease_name}
      className={`flex w-full items-start gap-2.5 rounded-2xl border px-3 py-2 text-left outline-none transition-[background-color,border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] active:scale-[0.995] disabled:opacity-60 motion-reduce:transition-none max-md:min-h-11 ${
        active
          ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-100))]'
          : 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]'
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
          active
            ? 'border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-500))] text-[hsl(var(--wb-card))]'
            : 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))]'
        }`}
      >
        {active ? <Check className="wb-draw-lucide size-3" strokeWidth={3.2} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] font-medium ${active ? 'text-[hsl(var(--brand-700))]' : 'text-foreground'}`}>{c.disease_name}</span>
        {hints.length > 0 ? (
          <span className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground">
            {hints.join(' · ')}
          </span>
        ) : null}
      </span>
    </button>
  );
}
