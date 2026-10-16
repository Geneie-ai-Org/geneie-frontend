import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download, FileText, Lock, RotateCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RunTimer from '@/components/ui/RunTimer';
import { useRunTimer } from '@/hooks/useRunTimer';
import { cn } from '@/lib/utils';
import { CountUp, ChipList, PopIn, SelectionMarker, StageMark, StateButton, undoToast } from '@/components/motion';
import { SegmentedPill } from '@/components/UploadWizardKit';
import {
  downloadGaTriageArtifact,
  fetchClinicalReportCandidates,
  generateClinicalReport,
} from '@/services/backendApi';
import {
  ADDITIONAL,
  INCLUDE,
  assignmentsFromSuggestions,
  rowKeyOf,
  rowLabel,
  selectedIdsFrom,
  whyText,
} from '@/lib/clinicalReportAssign';

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';
const PAGE = 40;
const ROW_OPTIONS = [
  { value: INCLUDE, label: 'Include' },
  { value: ADDITIONAL, label: 'Additional' },
];

/* ---- small, safe browser memory -----------------------------------------------------------------
 * Picks are local until "Generate report" posts them, so they are kept per conversation in
 * sessionStorage (closing the tab must not lose the work). The last result is kept in localStorage:
 * the server does not store reports, so "last generated" can only be this browser's memory. */
const picksKey = (id) => `geneie-report-picks:${id}`;
const lastKey = (id) => `geneie-report-last:${id}`;
function readJson(store, key) {
  try { return JSON.parse(window[store].getItem(key)); } catch { return null; }
}
function writeJson(store, key, value) {
  try { window[store].setItem(key, JSON.stringify(value)); } catch { /* storage blocked: lives for this session only */ }
}

/** "16 Oct, 2:23 PM IST". The app tells the user times in IST with AM/PM. */
export function formatIST(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  try {
    const d = new Date(n);
    const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(d);
    const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(d).toUpperCase();
    return `${date}, ${time} IST`;
  } catch {
    return null;
  }
}

const nf = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString() : null);

function phenotypeSummary(meta) {
  const m = meta || {};
  const text = [m.phenotype_disease, m.phenotype_findings, m.phenotype, m.phenotype_note_clean]
    .map((v) => String(v || '').trim())
    .find(Boolean);
  const hpo = Array.isArray(m.phenotype_hpo?.confirmed_ids)
    ? m.phenotype_hpo.confirmed_ids.filter((id) => String(id || '').startsWith('HP:')).length
    : 0;
  const bits = [];
  if (text) bits.push(text.length > 90 ? `${text.slice(0, 88)}…` : text);
  if (hpo) bits.push(`${hpo} HPO term${hpo === 1 ? '' : 's'}`);
  return bits.join(' · ') || null;
}

const STATE_WORD = { done: 'Done', running: 'Running', failed: 'Failed', pending: 'Not yet' };

function ActionPill({ action }) {
  if (!action) return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={action.onClick} className="shrink-0 gap-1.5">
      {action.label}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

function CheckRow({ item }) {
  const word = item.word || STATE_WORD[item.state];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-px flex size-6 shrink-0 items-center justify-center"><StageMark state={item.state} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className={cn('text-[13px] font-medium', item.state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{item.label}</span>
          <span className="wb-status" data-state={item.state}>{word}</span>
        </div>
        {item.detail ? <p className="mt-1 text-xs leading-5 tabular-nums text-muted-foreground">{item.detail}</p> : null}
        {item.timer ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            <RunTimer running elapsedMs={item.timer.elapsedMs} startMs={item.timer.startMs} />
          </p>
        ) : null}
        {item.action ? <div className="mt-2"><ActionPill action={item.action} /></div> : null}
      </div>
    </li>
  );
}

/**
 * Report: the workbench home of the clinical report (it replaces the old modal).
 *
 *   identity header  ->  readiness checklist  ->  choose variants  ->  what the PDF will hold + last result
 *   sticky footer: Generate report
 *
 * Same API calls as the modal, unchanged: GET .../clinical-report/candidates, POST .../clinical-report
 * (which returns and downloads the PDF; there is no separate "assign" call and no stored report) and the
 * GA ranking TSV. Picks stay in this tab until Generate posts them.
 */
export default function ReportTab({
  conversationId,
  active = true,
  fileName,
  metaChips = [],
  totalVariants,
  inScope,
  sampleMetadata,
  annotation,
  gaStatus = '',
  gaUpdatedAt = null,
  reportGate,
  automaticMode = false,
  triageAvailable = false,
  onOpenTab,
  onEditSample,
  className,
}) {
  const blocked = Boolean(reportGate?.blocked);
  const gaInFlight = Boolean(reportGate?.gaInFlight);
  const ga = String(gaStatus || '').toLowerCase();

  // ---- candidates ------------------------------------------------------------------------------
  const [load, setLoad] = useState('idle'); // idle | loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [touched, setTouched] = useState(null);
  const startedFor = useRef(null);
  const reqId = useRef(0);
  const [filter, setFilter] = useState(null); // null = pick a default once rows arrive
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [gen, setGen] = useState({ state: 'idle', source: null }); // idle | running | done | error
  const [genError, setGenError] = useState(null);
  const [last, setLast] = useState(() => readJson('localStorage', lastKey(conversationId)) || { ok: null, fail: null });
  const [tsv, setTsv] = useState('idle');

  const fetchCandidates = useCallback(async () => {
    if (!conversationId) return;
    const id = ++reqId.current;
    setLoad('loading');
    setLoadError(null);
    try {
      const data = await fetchClinicalReportCandidates(conversationId);
      if (id !== reqId.current) return;
      const rows = Array.isArray(data.candidates) ? data.candidates : [];
      const saved = readJson('sessionStorage', picksKey(conversationId));
      const known = new Set(rows.map((r, i) => rowKeyOf(r, i)));
      let picks;
      if (saved && typeof saved === 'object') {
        picks = Object.fromEntries(Object.entries(saved).filter(([k, v]) => known.has(k) && (v === INCLUDE || v === ADDITIONAL)));
      } else {
        picks = assignmentsFromSuggestions(rows);
      }
      setMeta(data);
      setCandidates(rows);
      setAssignments(picks);
      setLoad('ready');
    } catch (err) {
      if (id !== reqId.current) return;
      setLoadError(err?.message || 'Could not load the candidates');
      setLoad('error');
    }
  }, [conversationId]);

  // A different conversation starts clean (declared first so the fetch effect below wins on the same commit).
  const firstConv = useRef(true);
  useEffect(() => {
    if (firstConv.current) { firstConv.current = false; return; }
    startedFor.current = null;
    reqId.current += 1;
    setLoad('idle');
    setCandidates([]);
    setMeta(null);
    setAssignments({});
    setTouched(null);
    setLoadError(null);
    setGen({ state: 'idle', source: null });
    setGenError(null);
    setFilter(null);
    setQuery('');
    setShown(PAGE);
    setLast(readJson('localStorage', lastKey(conversationId)) || { ok: null, fail: null });
  }, [conversationId]);

  // Lazy: the tab can be restored open from storage, so do not fetch until it is on screen and unlocked.
  useEffect(() => {
    if (!active || blocked || !conversationId) return;
    if (startedFor.current === conversationId) return;
    startedFor.current = conversationId;
    fetchCandidates();
  }, [active, blocked, conversationId, fetchCandidates]);

  useEffect(() => {
    if (load === 'ready' && conversationId) writeJson('sessionStorage', picksKey(conversationId), assignments);
  }, [assignments, load, conversationId]);

  const selected = useMemo(() => selectedIdsFrom(candidates, assignments), [candidates, assignments]);
  const includeCount = selected.clinical.length;
  const additionalCount = selected.additional.length;

  const pfra = meta?.pfra || null;
  const pfraAvailable = Boolean(pfra?.suggestions_available);
  const suggestionCount = Number(pfra?.suggestion_count ?? 0);
  const gaReady = Boolean(pfra?.ga_top_used && pfraAvailable);
  const pfraGateMessage = pfra?.gate?.message || (!pfraAvailable ? 'Ranking is unavailable, so assign Include by hand.' : null);

  // ---- list view -------------------------------------------------------------------------------
  const effectiveFilter = filter || (suggestionCount > 0 ? 'picks' : 'all');

  const rows = useMemo(() => {
    const withIdx = candidates.map((row, index) => ({ row, index, key: rowKeyOf(row, index) }));
    return automaticMode
      ? [...withIdx.filter((r) => r.row.suggested_section), ...withIdx.filter((r) => !r.row.suggested_section)]
      : withIdx;
  }, [candidates, automaticMode]);

  const counts = useMemo(() => {
    const c = { all: rows.length, picks: 0, include: 0, additional: 0, none: 0 };
    rows.forEach((r) => {
      if (r.row.suggested_section) c.picks += 1;
      const a = assignments[r.key];
      if (a === INCLUDE) c.include += 1;
      else if (a === ADDITIONAL) c.additional += 1;
      else c.none += 1;
    });
    return c;
  }, [rows, assignments]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const a = assignments[r.key];
      if (effectiveFilter === 'picks' && !r.row.suggested_section) return false;
      if (effectiveFilter === 'include' && a !== INCLUDE) return false;
      if (effectiveFilter === 'additional' && a !== ADDITIONAL) return false;
      if (effectiveFilter === 'none' && a) return false;
      if (q && !`${rowLabel(r.row) || ''} ${r.row.gene || ''} ${r.row.badge || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, assignments, effectiveFilter, query]);

  const setBucket = (key, bucket) => {
    setTouched(key);
    setAssignments((prev) => {
      if (prev[key] === bucket) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: bucket };
    });
  };

  // Bulk changes apply at once and can be undone; a single pill click is its own undo (click it again).
  const bulk = (message, next) => {
    const prev = assignments;
    setAssignments(next);
    setTouched(null);
    undoToast(message, () => setAssignments(prev));
  };
  const useRankingPicks = () => {
    const next = assignmentsFromSuggestions(candidates);
    bulk(`Reset to the ${Object.keys(next).length} ranking pick${Object.keys(next).length === 1 ? '' : 's'}`, next);
  };
  const clearAll = () => bulk('Cleared every pick', {});

  // ---- generate / download ---------------------------------------------------------------------
  const resetTimer = useRef(null);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const busy = gen.state === 'running';
  const canGenerate = !blocked && load === 'ready' && includeCount >= 1 && !busy;

  const run = async (source) => {
    if (!canGenerate || !conversationId) return;
    clearTimeout(resetTimer.current);
    setGen({ state: 'running', source });
    setGenError(null);
    const body = { clinical_result_variant_ids: selected.clinical, additional_finding_variant_ids: selected.additional };
    try {
      await generateClinicalReport(conversationId, body);
      const rec = { ok: { at: Date.now(), include: includeCount, additional: additionalCount }, fail: null };
      setLast(rec);
      writeJson('localStorage', lastKey(conversationId), rec);
      setGen({ state: 'done', source });
      resetTimer.current = setTimeout(() => setGen({ state: 'idle', source: null }), 2800);
    } catch (err) {
      const message = err?.message || 'Report generation failed';
      const rec = { ok: last.ok, fail: { at: Date.now(), message } };
      setLast(rec);
      writeJson('localStorage', lastKey(conversationId), rec);
      setGenError(message);
      setGen({ state: 'error', source });
    }
  };

  const downloadTsv = async () => {
    if (!conversationId || tsv === 'running') return;
    setTsv('running');
    try {
      await downloadGaTriageArtifact(conversationId, 'tsv');
      setTsv('done');
      setTimeout(() => setTsv('idle'), 2200);
    } catch (err) {
      setTsv('error');
      setGenError(err?.message || 'Ranking table download failed');
    }
  };

  // ---- readiness -------------------------------------------------------------------------------
  const gaTimer = useRunTimer(conversationId ? `${conversationId}:report-ga` : null, gaInFlight, gaInFlight ? { startedAt: gaUpdatedAt } : {});
  const phenotype = phenotypeSummary(sampleMetadata);
  const annState = annotation?.state || 'pending';

  const checklist = [
    {
      id: 'annotation',
      label: 'Annotation',
      state: annState,
      detail:
        annState === 'done' ? annotation?.detail || 'Clinical and population data are in the file'
          : annState === 'running' ? 'Adding clinical and population data'
            : annState === 'failed' ? 'Annotation did not finish. Re-run it from Summary.'
              : annotation?.detail || 'Needed for ACMG and phenotype ranking.',
      action: annState === 'done' || annState === 'running' ? null : { label: 'Open Summary', onClick: () => onOpenTab?.('summary') },
    },
    {
      id: 'phenotype',
      label: 'Phenotype',
      state: phenotype ? 'done' : 'pending',
      word: phenotype ? 'Done' : 'Recommended',
      detail: phenotype || 'Ranking and the report use it to judge phenotype fit. You can still generate without it.',
      action: phenotype || !onEditSample ? null : { label: 'Add phenotype', onClick: onEditSample },
    },
    {
      id: 'ranking',
      label: 'Variants ranked',
      state: ga === 'completed' ? 'done' : gaInFlight || ga === 'running' || ga === 'queued' || ga === 'pending' ? 'running' : ga === 'failed' ? 'failed' : 'pending',
      detail:
        ga === 'completed' ? (suggestionCount ? `${nf(suggestionCount)} ranking pick${suggestionCount === 1 ? '' : 's'} are pre-checked` : 'Ranking finished')
          : ga === 'failed' ? 'Ranking failed. You can still choose variants yourself.'
            : gaInFlight || ga === 'running' || ga === 'queued' || ga === 'pending' ? 'Ranking runs before review, so the picks match the finished ranking.'
              : 'No ranking yet. Apply a filter in Variants to start one.',
      timer: gaInFlight ? gaTimer : null,
      action: ga === 'completed' || gaInFlight
        ? null
        : triageAvailable && ga === 'failed'
          ? { label: 'Open Triage', onClick: () => onOpenTab?.('triage') }
          : { label: 'Open Variants', onClick: () => onOpenTab?.('variants') },
    },
    {
      id: 'chosen',
      label: 'Variants chosen',
      state: includeCount >= 1 ? 'done' : 'pending',
      detail: blocked
        ? 'Choose them once the report unlocks.'
        : load !== 'ready' ? 'Loading the candidates'
          : includeCount >= 1 ? `${includeCount} Include · ${additionalCount} Additional`
            : 'Mark at least one variant as Include.',
      action: null,
    },
  ];

  const headState = blocked ? 'pending' : load === 'loading' ? 'running' : load === 'error' ? 'failed' : last.ok && gen.state !== 'error' && includeCount >= 1 ? 'done' : includeCount >= 1 ? 'done' : 'pending';
  const headWord = blocked ? 'Locked' : load === 'loading' ? 'Checking' : load === 'error' ? 'Could not load' : includeCount >= 1 ? 'Ready' : 'Needs picks';

  const outlineLabels = useMemo(() => {
    const byId = new Map();
    candidates.forEach((r) => { if (r.id) byId.set(r.id, rowLabel(r)); });
    return { clinical: selected.clinical.map((id) => byId.get(id) || id), additional: selected.additional.map((id) => byId.get(id) || id) };
  }, [candidates, selected]);

  const filters = [
    { id: 'picks', label: 'Ranking picks', n: counts.picks, hide: suggestionCount === 0 && counts.picks === 0 },
    { id: 'all', label: 'All', n: counts.all },
    { id: 'include', label: 'Include', n: counts.include },
    { id: 'additional', label: 'Additional', n: counts.additional },
    { id: 'none', label: 'Unassigned', n: counts.none },
  ].filter((f) => !f.hide);

  const genStateForFooter = gen.state;
  const primaryLabels = { idle: 'Generate report', running: 'Generating report', done: 'Report downloaded', error: 'Try again' };

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-1">
        {/* ---- identity ---------------------------------------------------------------------- */}
        <section
          className="wb-card wb-rise tx tx--ticks overflow-hidden p-4 pb-9"
          style={{ '--tx-opacity': 0.2, '--tx-opacity-dark': 0.14, '--tx-fade': '90% 80%', '--tx-at': '50% 100%' }}
          aria-label="Case"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="wb-card-title">Clinical report</p>
                  <h2 className="truncate text-[15px] font-medium text-foreground" title={fileName}>{fileName || 'Untitled file'}</h2>
                </div>
                <span className="wb-status mt-0.5 shrink-0" data-state={headState} role="status">{headWord}</span>
              </div>
              {(metaChips.length > 0 || meta?.workflow_display_name) ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {metaChips.map((c) => <span key={c} className="wb-chip">{c}</span>)}
                  {meta?.workflow_display_name ? <span className="wb-chip" data-tone="brand">{meta.workflow_display_name}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="In scope" value={Number.isFinite(Number(inScope)) ? Number(inScope) : null} hint={Number.isFinite(Number(totalVariants)) ? `of ${nf(totalVariants)}` : null} />
            <Stat label="Include" value={includeCount} tone={includeCount > 0 ? 'brand' : null} hint="clinical result" />
            <Stat label="Additional" value={additionalCount} hint="findings" />
          </dl>
        </section>

        {/* ---- readiness --------------------------------------------------------------------- */}
        <section className="wb-card wb-rise px-4 py-3" style={{ animationDelay: '50ms' }} aria-label="Readiness">
          <h3 className="wb-card-title mb-1">Before you generate</h3>
          <ol className="divide-y divide-[hsl(var(--wb-line))]">
            {checklist.map((item) => <CheckRow key={item.id} item={item} />)}
          </ol>
        </section>

        {/* ---- choose variants --------------------------------------------------------------- */}
        <section className="wb-card wb-rise overflow-hidden" style={{ animationDelay: '100ms' }} aria-label="Choose variants" id="report-choose">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-3">
            <h3 className="wb-card-title">Choose variants</h3>
            {load === 'ready' ? (
              <div className="flex flex-wrap items-center gap-1">
                {gaReady ? (
                  <StateButton
                    variant="ghost"
                    size="sm"
                    state={tsv === 'idle' ? 'idle' : tsv}
                    icon={Download}
                    labels={{ idle: 'Ranking table', running: 'Downloading', done: 'Downloaded', error: 'Try again' }}
                    onClick={downloadTsv}
                  />
                ) : null}
                {gaReady ? (
                  <Button type="button" variant="ghost" size="sm" onClick={useRankingPicks} disabled={suggestionCount === 0} title={`Reset to the ${suggestionCount} Include pick${suggestionCount === 1 ? '' : 's'} (Primary and Strong)`}>
                    Use ranking picks
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={includeCount + additionalCount === 0}>Clear all</Button>
              </div>
            ) : null}
          </div>

          {blocked ? (
            <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-4 text-center" role="status">
              <span className="flex size-9 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] text-muted-foreground" aria-hidden="true"><Lock className="size-4" /></span>
              <p className="text-[13px] font-medium text-foreground">Choosing variants is locked for now</p>
              <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">{reportGate?.title || 'The report unlocks once the file is ready for review.'}</p>
              {!gaInFlight ? <ActionPill action={{ label: 'Open Variants', onClick: () => onOpenTab?.('variants') }} /> : null}
            </div>
          ) : load === 'loading' || load === 'idle' ? (
            <ul className="m-0 list-none space-y-1.5 p-3" aria-busy="true" aria-label="Loading candidates">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="wb-shimmer h-4 w-40 rounded-full" />
                  <span className="wb-shimmer ml-auto h-7 w-36 rounded-full" />
                </li>
              ))}
            </ul>
          ) : load === 'error' ? (
            <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-3 text-center" role="alert">
              <StageMark state="failed" size={26} />
              <p className="text-[13px] font-medium text-foreground">Could not load the candidates</p>
              <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">{loadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={fetchCandidates} className="mt-1 gap-1.5"><RotateCw className="size-3.5" aria-hidden="true" />Try again</Button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="px-6 pb-6 pt-3 text-center text-[13px] leading-5 text-muted-foreground">No variants are in the current working set. Apply a filter in Variants, then come back.</p>
          ) : (
            <>
              {pfraGateMessage && !pfraAvailable ? <p className="px-4 pb-1 text-xs leading-5 text-muted-foreground">{pfraGateMessage}</p> : null}
              <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 pt-1">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={effectiveFilter === f.id}
                    onClick={() => { setFilter(f.id); setShown(PAGE); }}
                    className={cn('wb-chip cursor-pointer tabular-nums transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] motion-reduce:transition-none', FOCUS)}
                    data-tone={effectiveFilter === f.id ? 'brand' : undefined}
                  >
                    {f.label}<span className="text-muted-foreground">{nf(f.n)}</span>
                  </button>
                ))}
                <label className="relative ml-auto min-w-[8rem] flex-1 basis-36">
                  <span className="sr-only">Search variants</span>
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
                    placeholder="Search gene or variant"
                    className="h-7 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-8 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)]"
                  />
                </label>
              </div>

              {visible.length === 0 ? (
                <p className="px-6 pb-5 pt-2 text-center text-[13px] text-muted-foreground">Nothing matches this view.</p>
              ) : (
                <ul className="m-0 list-none space-y-0.5 px-2 pb-2" aria-label="Candidate variants">
                  {visible.slice(0, shown).map(({ row, key }) => {
                    const sel = assignments[key];
                    const badge = (row.badge || '').trim();
                    const suggested = Boolean(row.suggested_section);
                    const why = whyText(row);
                    const label = rowLabel(row);
                    return (
                      <li
                        key={key}
                        className={cn(
                          'relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border px-3 py-2 transition-colors duration-150 motion-reduce:transition-none',
                          sel ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))]' : 'border-transparent hover:bg-[hsl(var(--wb-pill))]'
                        )}
                      >
                        {touched === key ? <SelectionMarker group="report-row" /> : null}
                        <div className="relative min-w-0 flex-1 basis-44">
                          <p className="truncate font-mono text-xs text-foreground" title={why}>
                            {label}
                            {Array.isArray(row.pfra_caveats) && row.pfra_caveats.includes('VUS_CANDIDATE_NOT_ACTIONABLE') ? (
                              <span className="ml-1.5 font-sans text-xs text-muted-foreground">VUS candidate</span>
                            ) : null}
                          </p>
                          {(suggested || badge) ? (
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              {suggested ? <span className="font-medium text-[hsl(var(--brand-700))]">Include pick</span> : null}
                              {badge ? <span className="tabular-nums">{badge}</span> : null}
                            </p>
                          ) : null}
                          {suggested && why ? (
                            <details className="text-xs text-muted-foreground">
                              <summary className="inline-block cursor-pointer select-none rounded-full outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]">Why</summary>
                              <p className="mt-0.5 whitespace-pre-line">{why}</p>
                            </details>
                          ) : null}
                        </div>
                        <SegmentedPill
                          className="relative shrink-0"
                          ariaLabel={`Assign ${label}`}
                          value={sel}
                          onChange={(next) => setBucket(key, next)}
                          options={ROW_OPTIONS}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              {visible.length > shown ? (
                <div className="flex items-center justify-between gap-2 border-t border-[hsl(var(--wb-line))] px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="tabular-nums">Showing {nf(Math.min(shown, visible.length))} of {nf(visible.length)}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more</Button>
                </div>
              ) : null}
              <p className="px-4 pb-3 text-xs leading-5 text-muted-foreground">Picking the same option again clears it. Unmarked variants stay out of the PDF. Picks stay here until you generate.</p>
            </>
          )}
        </section>

        {/* ---- what the PDF holds + last result ---------------------------------------------- */}
        <section className="wb-card wb-rise px-4 py-3" style={{ animationDelay: '150ms' }} aria-label="Report preview">
          <div className="flex items-center justify-between gap-2">
            <h3 className="wb-card-title">In the PDF</h3>
            {last.ok ? <span className="wb-status" data-state="done">Generated</span> : <span className="wb-status" data-state="pending">Not generated</span>}
          </div>
          {load === 'ready' && includeCount + additionalCount > 0 ? (
            <div className="mt-2.5 space-y-2.5">
              <Outline title="Clinical result summary" labels={outlineLabels.clinical} />
              <Outline title="Additional findings" labels={outlineLabels.additional} />
            </div>
          ) : (
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
              {blocked ? 'Nothing to show while the report is locked.' : 'Your picks appear here as the sections of the PDF.'}
            </p>
          )}
          <div className="mt-3 border-t border-[hsl(var(--wb-line))] pt-3">
            {busy ? (
              <div className="flex items-center gap-2" role="status">
                <span className="wb-shimmer h-4 w-44 rounded-full" />
                <span className="text-xs text-muted-foreground">Building the PDF</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {last.ok ? (
                  <p className="flex items-start gap-2 text-[13px] leading-5 text-foreground">
                    <span className="mt-0.5 shrink-0"><StageMark state="done" size={18} /></span>
                    <span>
                      Generated {formatIST(last.ok.at)}
                      <span className="block text-xs text-muted-foreground tabular-nums">{last.ok.include} Include · {last.ok.additional} Additional</span>
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] leading-5 text-muted-foreground">No report generated yet from this browser.</p>
                )}
                {last.fail && !genError ? (
                  <p className="flex items-start gap-2 text-[13px] leading-5 text-[var(--error)]" role="status">
                    <span className="mt-0.5 shrink-0"><StageMark state="failed" size={18} /></span>
                    <span>Last attempt failed {formatIST(last.fail.at)}<span className="block text-xs text-muted-foreground">{last.fail.message}</span></span>
                  </p>
                ) : null}
                <p className="text-xs leading-5 text-muted-foreground">PDFs are built when you ask and are not stored. Download rebuilds the report from your current picks.</p>
                {last.ok ? (
                  <StateButton
                    variant="outline"
                    size="sm"
                    state={gen.source === 'download' ? gen.state : 'idle'}
                    icon={Download}
                    labels={{ idle: 'Download PDF', running: 'Building PDF', done: 'PDF downloaded', error: 'Try again' }}
                    disabled={!canGenerate && gen.state !== 'error'}
                    onClick={() => run('download')}
                    className="mt-1"
                  />
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ---- footer: one primary ----------------------------------------------------------- */}
      <div className="shrink-0 space-y-2 border-t border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] px-4 py-3">
        {genError ? (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-[var(--error)]/40 bg-[var(--error)]/[0.06] px-3 py-2 text-[13px] leading-5">
            <span className="mt-0.5 shrink-0"><StageMark state="failed" size={18} /></span>
            <span className="min-w-0 text-foreground">
              <span className="font-medium">The report was not generated.</span> {genError}
              <span className="block text-xs text-muted-foreground">Your picks are kept. Try again, or change them first.</span>
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 basis-40 text-xs leading-5 text-muted-foreground tabular-nums" role="status">
            {blocked
              ? 'Locked. See the reason above.'
              : load !== 'ready' ? 'Waiting for the candidates'
                : includeCount < 1 ? 'Mark at least one variant as Include.'
                  : <><CountUp value={includeCount} duration={0.3} /> Include · <CountUp value={additionalCount} duration={0.3} /> Additional</>}
          </p>
          <StateButton
            size="lg"
            state={gen.source === 'download' ? 'idle' : genStateForFooter}
            icon={FileText}
            labels={primaryLabels}
            disabled={!canGenerate && gen.state !== 'error'}
            onClick={() => run('generate')}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5', tone === 'brand' ? 'bg-[hsl(var(--brand-50))]' : 'bg-[hsl(var(--wb-pill))]')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-[22px] font-medium leading-none tabular-nums tracking-tight', tone === 'brand' ? 'text-[hsl(var(--brand-700))]' : 'text-foreground')}>
        {value == null ? <span aria-label="unknown">–</span> : <CountUp value={value} duration={0.5} />}
      </dd>
      {hint ? <dd className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{hint}</dd> : null}
    </div>
  );
}

function Outline({ title, labels }) {
  return (
    <div>
      <p className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
        <span>{title}</span>
        <span className="font-normal tabular-nums text-muted-foreground">{labels.length}</span>
      </p>
      {labels.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <ChipList>
            {labels.slice(0, 8).map((l, i) => (
              <PopIn key={`${l}-${i}`}><span className="wb-chip font-mono text-[11px]">{l}</span></PopIn>
            ))}
          </ChipList>
          {labels.length > 8 ? <span className="wb-chip">+{labels.length - 8} more</span> : null}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">None chosen. This section is left out.</p>
      )}
    </div>
  );
}
