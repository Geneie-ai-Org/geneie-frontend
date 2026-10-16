import React, { useState, useEffect, useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ChevronRight, CircleCheck, CircleX, ClipboardCheck, FileText, Filter, Info, RefreshCw, Tags, Trash2, TriangleAlert, Wrench, X } from 'lucide-react';
import { usePopOnChange } from '@/components/PipelineJobCard';
import { Collapse, CountUp, HoldButton, StateButton, Turn } from '@/components/motion';
import PhenotypeAiLabel from '@/components/PhenotypeAiLabel';
import { formatAcmgPhenotypeMeterLabel } from '@/lib/filterDisplayNames';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Semantic tokens only (src/design/tokens.css). Status colours carry meaning, never decoration. */
const C = {
  surface: 'var(--bg-surface-raised)',
  surfaceCard: 'var(--bg-surface)',
  surfaceHover: 'var(--bg-surface-hover)',
  border: 'var(--border-default)',
  borderStrong: 'var(--border-strong)',
  text: 'var(--text-primary)',
  textMuted: 'var(--text-secondary)',
  textDim: 'var(--text-tertiary)',
  success: 'var(--success)',
  successSoft: 'var(--success-soft)',
  warning: 'var(--warning)',
  warningSoft: 'var(--warning-soft)',
  warningText: 'var(--warning)',
  info: 'var(--info)',
  infoSoft: 'var(--info-soft)',
  teal: 'hsl(var(--primary))',
  onAccent: 'var(--accent-teal-contrast)',
  tealSoft: 'var(--accent-teal-soft)',
  error: 'var(--error)',
  errorSoft: 'var(--error-soft)',
  track: 'var(--segment-track)',
};

// Tokens are CSS variables, so a hex alpha suffix (tint(C.success, 40)) is invalid CSS and the
// browser drops it. Mix with transparent instead.
const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

const LINE = 'hsl(var(--wb-line))';

const CHIP_TONES = {
  success: [C.successSoft, C.success],
  info: [C.infoSoft, C.info],
  warning: [C.warningSoft, C.warning],
  error: [C.errorSoft, C.error],
  neutral: [C.track, C.textMuted],
};

// Tone -> the shared status-pill state (done = brand teal, failed = red, pending = neutral).
const TONE_STATE = { success: 'done', error: 'failed', info: 'pending', neutral: 'pending' };

/** Status as a word plus a small dot, in the shared pill shape. */
function Chip({ tone = 'neutral', children }) {
  const state = TONE_STATE[tone];
  const sig = `${tone}|${typeof children === 'string' ? children : ''}`;
  const pop = usePopOnChange(sig);
  return (
    <span
      key={sig}
      className={`wb-status max-w-full shrink-0 ${pop}`}
      data-state={state}
      style={tone === 'warning' ? { background: C.warningSoft, color: C.warning, borderColor: 'transparent' } : undefined}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Inline notice: a soft status card with a hairline in the status colour and readable text. */
function Notice({ tone = 'info', icon: Icon = Info, children }) {
  const [bg, fg] = CHIP_TONES[tone] || CHIP_TONES.info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-5"
      style={{ background: bg, color: C.text, borderColor: tint(fg, 22) }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: fg }} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** False on the first paint, true a frame later: lets bars and counters play from empty on open. */
function useSettled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** Counter that rolls up from zero the first time it shows, then follows its value. */
function RollUp({ value }) {
  const settled = useSettled();
  return <CountUp value={settled ? value : 0} />;
}

/** Found/missing counts for one step's column groups: only what the step needs counts as missing. */
function summarizeStep(step) {
  let found = 0;
  let missing = 0;
  if (!step || step.not_implemented) return { found, missing };
  const count = (cols) => Object.values(cols || {}).filter((c) => c?.found).length;
  const req = step.required_columns || {};
  found += count(req);
  missing += Object.keys(req).length - count(req);
  const groups = [
    [step.pathogenicity_predictor_group, 2],
    [step.sample_genotype_group, 1],
    [step.pathogenicity_score_group, 1],
  ];
  for (const [group, need] of groups) {
    if (!group) continue;
    const n = count(group);
    found += n;
    missing += Math.max(0, need - n);
  }
  for (const col of Object.values(step.conditional_columns || {})) {
    if (col?.found) found += 1;
    else if (col?.required) missing += 1;
  }
  return { found, missing };
}

/** One column per row: the role we need, the column it was matched to in the file (a mono pill), and a status pill. */
function ColumnRow({ role, matched, tone = 'success', word, note, rid, flash = false }) {
  const reduce = useReducedMotion();
  return (
    <li
      id={rid}
      tabIndex={-1}
      className={`flex min-h-10 items-center gap-2 border-t px-3 py-1.5 text-[13px] outline-none transition-colors duration-500 first:border-t-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 ${flash ? 'bg-[hsl(var(--brand-100))]' : ''}`}
      style={{ borderColor: LINE }}
    >
      <span className="min-w-0 flex-1 truncate" style={{ color: C.text }} title={note || role}>
        {role}
      </span>
      {matched ? (
        <>
          {/* The mapping slides in from the left when a column gets matched. */}
          <motion.span
            className="flex min-w-0 max-w-[48%] shrink items-center gap-2"
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {matched !== role ? <ArrowRight className="size-3 shrink-0" style={{ color: C.textDim }} aria-hidden /> : null}
            <span className="wb-chip min-w-0 shrink font-mono text-[12px]" title={`Column in your file: ${matched}`}>
              <span className="truncate">{matched}</span>
            </span>
          </motion.span>
        </>
      ) : null}
      <span className="wb-status shrink-0" data-state={TONE_STATE[tone] || 'pending'}>
        {word}
      </span>
    </li>
  );
}

/** Disclosure group: a pill-cornered block whose header carries the found / missing counts. */
function ColumnGroup({ label, found, missing, open, onToggle, children }) {
  const panelId = useId();
  return (
    <section className="overflow-hidden rounded-2xl border" style={{ borderColor: LINE }}>
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex min-h-10 w-full items-center gap-2 bg-[hsl(var(--wb-pill))] px-3 py-1.5 text-left text-[13px] font-medium transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 ${FOCUS} focus-visible:-outline-offset-2`}
        >
          <Turn open={open} className="shrink-0">
            <ChevronRight className="size-3.5" style={{ color: C.textDim }} aria-hidden />
          </Turn>
          <span className="min-w-0 flex-1 truncate" style={{ color: C.text }}>{label}</span>
          <span className="wb-status shrink-0 tabular-nums" data-state="done">{found} found</span>
          {missing > 0 ? <span className="wb-status shrink-0 tabular-nums" data-state="failed">{missing} missing</span> : null}
        </button>
      </h4>
      <Collapse open={open} id={panelId}>
        <ul className="m-0 list-none border-t p-0" style={{ borderColor: LINE }}>
          {children}
        </ul>
      </Collapse>
    </section>
  );
}

/** Severity of a finding. Colour is paired with a distinct glyph and a word, never alone. */
const SEV = {
  blocking: { word: 'Blocking', icon: CircleX, fg: C.error, bg: C.errorSoft },
  warning: { word: 'Warning', icon: TriangleAlert, fg: C.warning, bg: C.warningSoft },
  note: { word: 'Note', icon: Info, fg: C.info, bg: C.infoSoft },
  pass: { word: 'Passed', icon: CircleCheck, fg: C.success, bg: C.successSoft },
};

function SeverityBadge({ sev }) {
  const s = SEV[sev];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] font-medium"
      style={{ background: s.bg, color: s.fg, borderColor: tint(s.fg, 24) }}
    >
      <Icon aria-hidden className="size-3" />
      {s.word}
    </span>
  );
}

const missingNames = (cols) => Object.entries(cols || {}).filter(([, c]) => !c?.found).map(([n]) => n);
const allNames = (cols) => Object.keys(cols || {});

/** One finding: severity, what is wrong, what to do, the affected columns as jump chips, and the column list. */
function IssueCard({ issue, open, onToggle, onJump }) {
  const s = SEV[issue.sev];
  const Icon = s.icon;
  const panelId = `fc-issue-panel-${issue.id}`;
  return (
    <li id={`fc-issue-${issue.id}`} className="wb-card overflow-hidden">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border"
          style={{ background: s.bg, color: s.fg, borderColor: tint(s.fg, 24) }}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="m-0 text-[14px] font-medium leading-5" style={{ color: C.text }}>{issue.title}</h4>
            <SeverityBadge sev={issue.sev} />
          </div>
          {issue.body ? <p className="m-0 text-[13px] leading-5" style={{ color: C.textMuted }}>{issue.body}</p> : null}
          {issue.cols?.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Affected columns">
              {issue.cols.map((c) => (
                <li key={`${c.sectionKey}-${c.name}`}>
                  <button
                    type="button"
                    onClick={() => onJump(issue.id, c)}
                    title={`Show ${c.name} in the column list`}
                    className={`inline-flex h-6 max-w-full items-center rounded-full border px-2.5 font-mono text-[12px] transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] motion-reduce:transition-none [@media(pointer:coarse)]:h-9 ${FOCUS}`}
                    style={{ borderColor: tint(s.fg, 30), color: C.text, background: 'hsl(var(--wb-card))' }}
                  >
                    <span className="truncate">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {issue.hint ? (
            <p className="m-0 flex items-start gap-1.5 text-[13px] leading-5" style={{ color: C.text }}>
              <Wrench aria-hidden className="mt-[3px] size-3.5 shrink-0" style={{ color: 'hsl(var(--brand-700))' }} />
              <span><span className="font-medium">How to fix: </span>{issue.hint}</span>
            </p>
          ) : null}
          {issue.actions || issue.detail ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {issue.actions}
              {issue.detail ? (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={onToggle}
                  className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] motion-reduce:transition-none [@media(pointer:coarse)]:h-11 ${FOCUS}`}
                  style={{ color: 'hsl(var(--brand-700))' }}
                >
                  <Turn open={open}><ChevronRight aria-hidden className="size-3.5" /></Turn>
                  {open ? 'Hide column list' : 'Show column list'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {issue.detail ? (
        <Collapse open={open} id={panelId}>
          <div className="space-y-2 border-t bg-[hsl(var(--wb-pill)/0.5)] px-3 py-3" style={{ borderColor: LINE }}>
            {issue.detail}
          </div>
        </Collapse>
      ) : null}
    </li>
  );
}

const ColumnInterpretationResults = ({
  interpretationResult,
  onClose,
  onAnnovarClick,
  annovarGate,
  acmgExomiserGate,
  // "2 base + 5 top-up · resets 1 Sep" for pro/super_pro; null on other tiers.
  annovarMeterDetail,
  acmgMeterDetail,
  onProprietaryFilterClick,
  onOpenExomiser,
  isApplyingProprietaryFilter = false,
  acmgFilterActive = false,
  acmgFilterCanApply = false,
  exomiserCanApply = false,
  phenotypeMissing = false,
  showVcfTabHighlight,
  onDeleteDocument,
  onTryVcfUpload,
  onUploadRawSequencing,
  onConvertToVcf,
  isConvertingToVcf = false,
  isVcfFile = false,
  chatAllowed = true,
  chatBlockedMessage,
  onChatBlocked,
  isRunningAnnovar = false,
  hasAnnotatedFile = false,
  initialStep = null,
  // Workspace mode: render as plain panel content (no overlay, no close button, no Escape).
  // Default false keeps today's modal mount in ChatPage working.
  embedded = false,
  // Optional states for a host that tracks the check itself (not wired by ChatPage yet).
  checking = false,
  checkError = null,
  onRetryCheck,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Explicit remove-file confirmation only
  const [showAnnovarConfirm, setShowAnnovarConfirm] = useState(false); // Confirm Annotation when all columns present
  const [openGroups, setOpenGroups] = useState({}); // sectionKey -> open (unset = open only when something is missing)
  const [openIssues, setOpenIssues] = useState(() => (initialStep ? { [`cols${initialStep}`]: true } : {}));
  const [showPassed, setShowPassed] = useState(false);
  const [flashId, setFlashId] = useState(null);
  const settled = useSettled(); // bars start empty on open and glide to their value
  const reduceMotion = useReducedMotion();

  // Close on ESC (modal mode only). A nested confirm takes precedence over closing the whole view.
  useEffect(() => {
    if (embedded) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (showDeleteConfirm || showAnnovarConfirm) return;
      onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [embedded, showDeleteConfirm, showAnnovarConfirm, onClose]);

  useEffect(() => {
    if (!flashId) return undefined;
    const t = setTimeout(() => setFlashId(null), 1800);
    return () => clearTimeout(t);
  }, [flashId]);

  /** Chip click: open the finding's column list, open the right group, scroll to the row and flash it. */
  const jumpToColumn = (issueId, col) => {
    const rid = `fc-col-${col.sectionKey}-${col.name}`;
    setOpenIssues((prev) => ({ ...prev, [issueId]: true }));
    setOpenGroups((prev) => ({ ...prev, [col.sectionKey]: true }));
    setFlashId(rid);
    // Wait for the list to open, then bring the row into view and move focus to it.
    setTimeout(() => {
      const el = document.getElementById(rid);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
    }, reduceMotion ? 30 : 280);
  };

  const backgroundJobActive = isRunningAnnovar || isApplyingProprietaryFilter;
  const genomeMismatch = interpretationResult?.genome_build_check?.status === 'mismatch';

  if (checking || checkError || !interpretationResult) {
    // Modal mode renders nothing without a result; the workspace tab explains itself instead.
    if (!embedded) return null;
    if (checking) {
      return (
        <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4 pt-1" role="status" aria-busy="true" aria-label="Checking your file">
          <div className="wb-card space-y-3 p-4">
            <div className="flex items-center gap-3">
              <span className="wb-shimmer size-9 rounded-full" />
              <span className="flex-1 space-y-2"><span className="wb-shimmer block h-3.5 w-28 rounded-full" /><span className="wb-shimmer block h-3 w-48 rounded-full" /></span>
            </div>
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <span key={i} className="wb-shimmer h-14 rounded-2xl" />)}</div>
          </div>
          {[0, 1].map((i) => <div key={i} className="wb-card space-y-2 p-4"><span className="wb-shimmer block h-3.5 w-40 rounded-full" /><span className="wb-shimmer block h-3 w-3/4 rounded-full" /></div>)}
          <p className="px-1 text-[13px]" style={{ color: C.textMuted }}>Checking the columns of your file. This usually takes a few seconds.</p>
        </div>
      );
    }
    if (checkError) {
      return (
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-1">
          <div className="wb-card flex flex-col items-center gap-2 px-6 py-10 text-center" role="alert">
            <span className="mb-1 flex size-11 items-center justify-center rounded-full border" style={{ background: C.errorSoft, color: C.error, borderColor: tint(C.error, 22) }} aria-hidden="true">
              <CircleX className="size-5" />
            </span>
            <p className="text-[15px] font-medium" style={{ color: C.text }}>The file check did not finish</p>
            <p className="max-w-xs text-[13px] leading-5" style={{ color: C.textMuted }}>{String(checkError)}</p>
            {onRetryCheck ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetryCheck} className="mt-1.5 [@media(pointer:coarse)]:h-11"><RefreshCw aria-hidden /> Check again</Button>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 px-8 text-center text-foreground">
        <span className="mb-1 flex size-10 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
          <ClipboardCheck className="size-5" />
        </span>
        <p className="text-[15px] font-medium">No file check yet</p>
        <p className="max-w-xs text-[13px] leading-5" style={{ color: C.textMuted }}>
          Geneie checks the columns of a variants file as soon as you add one. The result appears here.
        </p>
      </div>
    );
  }

  const { step1, step2, step3, recommendations } = interpretationResult;
  const annovarQuotaBlocked = annovarGate?.allowed === false;
  const annovarEnabled = Boolean(step1?.passed) && !genomeMismatch && !annovarQuotaBlocked;
  const annovarMeter = annovarGate?.meter;
  const annovarMeterLabel = annovarMeter?.tracked && !annovarMeter.unlimited && annovarMeter.remaining != null
    ? `${annovarMeter.remaining} of ${annovarMeter.limit} annotation runs left`
    : null;
  const acmgQuotaBlocked = acmgExomiserGate?.allowed === false;
  const acmgMeter = acmgExomiserGate?.meter;
  const acmgMeterLabel = acmgMeter?.tracked && !acmgMeter.unlimited && acmgMeter.remaining != null
    ? formatAcmgPhenotypeMeterLabel(acmgMeter.remaining, acmgMeter.limit)
    : null;
  const annovarAlreadyRun = hasAnnotatedFile || Boolean(step2?.passed);

  // Recommendations come from the backend, which still names the ANNOVAR tool.
  // The UI only ever says "Annotation", so strip the tool name before display.
  const allRecommendations = (recommendations || []).map((r) =>
    typeof r === 'string'
      ? r
          .replace(/\bANNOVAR annotation\b/gi, 'annotation')
          .replace(/\bRun ANNOVAR\b/g, 'Run annotation')
          .replace(/\bANNOVAR\b/g, 'Annotation')
      : r
  );
  const primaryRecommendation = allRecommendations.length > 0 ? allRecommendations[0] : null;

  const rowsFlagged = (() => {
    const r = interpretationResult || {};
    return (
      (r.variants_skipped_invalid_alleles || 0) +
      (r.variants_skipped_invalid_predictors || 0) +
      (r.variants_skipped_invalid_genotype || 0) +
      (r.variants_skipped_invalid_mandatory_annotation || 0)
    );
  })();
  const gbc = interpretationResult?.genome_build_check;

  const columnTotals = [step1, step2, step3].map(summarizeStep).reduce(
    (acc, t) => ({ found: acc.found + t.found, missing: acc.missing + t.missing }),
    { found: 0, missing: 0 }
  );
  const totalColumns = columnTotals.found + columnTotals.missing;
  const foundPct = totalColumns > 0 ? Math.round((columnTotals.found / totalColumns) * 100) : 0;

  /** One group of columns as a list. Groups with nothing missing start collapsed; groups with a problem start open. */
  const renderColumnGroup = (sectionKey, label, columns, columnsNoValidValues = [], opts = {}) => {
    const entries = Object.entries(columns);
    if (!entries.length) return null;

    const found = entries.filter(([, c]) => c.found);
    const issues = entries.filter(([, c]) => !c.found);
    // For "any N of these" groups (`minFound`) a missing column only counts until enough are found.
    const needed = opts.minFound != null ? opts.minFound : entries.length;
    const groupSatisfied = found.length >= needed;
    const missingCount = opts.optional ? 0 : Math.max(0, needed - found.length);
    const missingTone = opts.optional || groupSatisfied ? 'neutral' : 'error';
    const defaultOpen = issues.length > 0 && !groupSatisfied && !opts.optional;
    const open = openGroups[sectionKey] ?? defaultOpen;
    const rid = (name) => `fc-col-${sectionKey}-${name}`;

    return (
      <ColumnGroup
        label={label}
        found={found.length}
        missing={missingCount}
        open={open}
        onToggle={() => setOpenGroups((prev) => ({ ...prev, [sectionKey]: !open }))}
      >
        {issues.map(([colName]) => (
          <ColumnRow
            key={colName}
            rid={rid(colName)}
            flash={flashId === rid(colName)}
            role={colName}
            tone={missingTone}
            word={columnsNoValidValues.includes(colName) ? 'No values' : opts.missingLabel || 'Missing'}
          />
        ))}
        {found.map(([colName, colInfo]) => (
          <ColumnRow
            key={colName}
            rid={rid(colName)}
            flash={flashId === rid(colName)}
            role={colName}
            matched={colInfo.matched_column && colInfo.matched_column !== colName ? colInfo.matched_column : colName}
            tone="success"
            word="Found"
          />
        ))}
      </ColumnGroup>
    );
  };

  /** Conditional columns: required ones count as missing, optional ones are only noted. */
  const renderConditionalGroup = (sectionKey, label, columns) => {
    const entries = Object.entries(columns);
    if (!entries.length) return null;

    const found = entries.filter(([, c]) => c.found);
    const issues = entries.filter(([, c]) => !c.found);
    const missingCount = issues.filter(([, c]) => c.required).length;
    const open = openGroups[sectionKey] ?? missingCount > 0;
    const rid = (name) => `fc-col-${sectionKey}-${name}`;

    return (
      <ColumnGroup
        label={label}
        found={found.length}
        missing={missingCount}
        open={open}
        onToggle={() => setOpenGroups((prev) => ({ ...prev, [sectionKey]: !open }))}
      >
        {issues.map(([colName, colInfo]) => (
          <ColumnRow
            key={colName}
            rid={rid(colName)}
            flash={flashId === rid(colName)}
            role={colName}
            tone={colInfo.required ? 'error' : 'neutral'}
            word={colInfo.required ? 'Missing' : 'Optional'}
          />
        ))}
        {found.map(([colName, colInfo]) => (
          <ColumnRow
            key={colName}
            rid={rid(colName)}
            flash={flashId === rid(colName)}
            role={colName}
            matched={colInfo.matched_column && colInfo.matched_column !== colName ? colInfo.matched_column : colName}
            tone="success"
            word="Found"
            note={colInfo.required ? `${colName} (Required)` : undefined}
          />
        ))}
      </ColumnGroup>
    );
  };

  /** The column lists behind a finding, one step at a time. */
  const renderStepDetailsFor = (stepNumber, stepData) => {
    if (!stepData || stepData.not_implemented) return null;
    const columnsNoValidValues = stepData.columns_no_valid_values || [];
    if (stepNumber === 1) {
      return <div className="space-y-2">{renderColumnGroup('step1_required', 'Required columns', stepData.required_columns || {}, columnsNoValidValues)}</div>;
    }
    if (stepNumber === 2) {
      const missing_groups = stepData.missing_groups || [];
      return (
        <div className="space-y-2">
          {renderColumnGroup('step2_required', 'Required columns', stepData.required_columns || {}, columnsNoValidValues)}
          {renderColumnGroup('step2_pathogenicity', 'Pathogenicity predictors (at least 2 required)', stepData.pathogenicity_predictor_group || {}, columnsNoValidValues, { missingLabel: 'Not found', minFound: 2 })}
          {missing_groups.length > 0 && (
            <Notice tone="error" icon={TriangleAlert}>
              <p className="font-medium">Missing groups</p>
              <ul className="mt-1 list-inside list-disc">
                {missing_groups.map((group, idx) => <li key={idx}>{group}</li>)}
              </ul>
            </Notice>
          )}
        </div>
      );
    }
    const missing_groups = stepData.missing_groups || [];
    return (
      <div className="space-y-2">
        {renderColumnGroup('step3_required', 'Required columns', stepData.required_columns || {}, columnsNoValidValues)}
        {renderColumnGroup('step3_genotype', 'Sample genotype (any one required)', stepData.sample_genotype_group || {}, columnsNoValidValues, { missingLabel: 'Not found', minFound: 1 })}
        {renderColumnGroup('step3_pathscore', 'Pathogenicity scores (any one required)', stepData.pathogenicity_score_group || {}, columnsNoValidValues, { missingLabel: 'Not found', minFound: 1 })}
        {renderConditionalGroup('step3_conditional', 'Conditional columns', stepData.conditional_columns || {})}
        {missing_groups.length > 0 && (
          <Notice tone="warning" icon={TriangleAlert}>
            <p className="font-medium">Missing column groups</p>
            <ul className="mt-1 list-inside list-disc">
              {missing_groups.map((group, idx) => <li key={idx}>{group}</li>)}
            </ul>
          </Notice>
        )}
      </div>
    );
  };

  // ---- Findings, derived from the check result
  const issues = [];
  const passes = [];

  // What the user can do about a missing-columns problem on step 1.
  const canFixByUpload = showVcfTabHighlight && (isVcfFile ? onUploadRawSequencing : onTryVcfUpload);
  const fixUploadLabel = isVcfFile ? 'Upload raw sequencing data' : 'Try VCF upload';
  const runFixUpload = () => (isVcfFile ? onUploadRawSequencing?.() : onTryVcfUpload?.());

  if (genomeMismatch) {
    issues.push({
      id: 'genome',
      sev: 'blocking',
      title: 'Genome build mismatch',
      body: gbc.message || `You selected ${(gbc.declared || '').toUpperCase()}, but the coordinates match ${(gbc.likely || '').toUpperCase()}.`,
      hint: 'Update the genome in sample information, or re-upload the file. Annotation and phenotype prioritization stay off until then.',
    });
  } else if (gbc?.status === 'inconclusive') {
    issues.push({
      id: 'genome',
      sev: 'warning',
      title: 'Genome build not verified',
      body: gbc.message || 'Geneie could not confirm which genome build the coordinates use.',
      hint: 'Double-check the genome in sample information before running annotation.',
    });
  } else if (gbc?.status === 'match') {
    passes.push(`Genome build verified: ${(gbc.declared || '').toUpperCase()}`);
  }

  if (step1 && !step1.passed) {
    const miss = [...new Set([...missingNames(step1.required_columns), ...(step1.columns_no_valid_values || [])])];
    const total = allNames(step1.required_columns).length;
    issues.push({
      id: 'cols1',
      sev: 'blocking',
      title: 'Required columns missing',
      body: miss.length
        ? `${miss.length}${total ? ` of ${total}` : ''} required ${miss.length === 1 ? 'column is' : 'columns are'} missing or empty. Annotation cannot run without them.`
        : 'Some required columns are missing or empty. Annotation cannot run without them.',
      cols: miss.map((name) => ({ name, sectionKey: 'step1_required' })),
      hint: isVcfFile
        ? 'Essential VCF columns are missing. Upload raw sequencing data when it is available.'
        : 'Upload a VCF for better results, or convert this file to VCF.',
      actions: canFixByUpload || (!isVcfFile && onConvertToVcf) ? (
        !isVcfFile && onConvertToVcf ? (
          <StateButton
            state={isConvertingToVcf ? 'running' : 'idle'}
            labels={{ idle: 'Convert file to VCF', running: 'Converting' }}
            icon={FileText}
            variant="outline"
            size="sm"
            onClick={() => onConvertToVcf()}
            disabled={isConvertingToVcf || backgroundJobActive}
            className="[@media(pointer:coarse)]:h-11"
          />
        ) : null
      ) : null,
      detail: renderStepDetailsFor(1, step1),
    });
  } else if (step1) {
    passes.push(`Required columns present (${allNames(step1.required_columns).length})`);
  }

  if (step2 && !step2.not_implemented && !step2.passed) {
    const reqMiss = missingNames(step2.required_columns);
    const predMiss = missingNames(step2.pathogenicity_predictor_group);
    const predFound = allNames(step2.pathogenicity_predictor_group).length - predMiss.length;
    const predShort = step2.pathogenicity_predictor_group && predFound < 2;
    const cols = [
      ...reqMiss.map((name) => ({ name, sectionKey: 'step2_required' })),
      ...(predShort ? predMiss.map((name) => ({ name, sectionKey: 'step2_pathogenicity' })) : []),
    ];
    const bits = [];
    if (reqMiss.length) bits.push(`${reqMiss.length} required annotation ${reqMiss.length === 1 ? 'column' : 'columns'} missing`);
    if (predShort) bits.push(`${predFound} of 2 pathogenicity predictors found`);
    issues.push({
      id: 'cols2',
      sev: 'warning',
      title: 'Annotation columns incomplete',
      body: bits.length ? `${bits.join('; ')}. The ACMG filter and phenotype ranking need them.` : 'Some annotation columns are missing. The ACMG filter and phenotype ranking need them.',
      cols,
      hint: step1?.passed
        ? (primaryRecommendation && /annotation/i.test(primaryRecommendation) ? primaryRecommendation : 'Run annotation to add the missing columns.')
        : 'Fix the required columns first. Annotation cannot run until then.',
      detail: renderStepDetailsFor(2, step2),
    });
  } else if (step2 && !step2.not_implemented) {
    passes.push('Annotation columns present');
  }
  if (step2?.pathogenicity_predictor_limitation) {
    issues.push({
      id: 'predictors',
      sev: 'note',
      title: 'Fewer pathogenicity predictors',
      body: 'Not all predictor columns are present. Filtering works with the predictors you have (for example SIFT, PolyPhen), so results may be more limited.',
    });
  }

  if (step3 && !step3.not_implemented && !step3.passed) {
    const reqMiss = missingNames(step3.required_columns);
    const gtGroup = step3.sample_genotype_group || {};
    const psGroup = step3.pathogenicity_score_group || {};
    const gtMiss = Object.keys(gtGroup).length > 0 && !Object.values(gtGroup).some((c) => c.found) ? allNames(gtGroup) : [];
    const psMiss = Object.keys(psGroup).length > 0 && !Object.values(psGroup).some((c) => c.found) ? allNames(psGroup) : [];
    const condMiss = Object.entries(step3.conditional_columns || {}).filter(([, c]) => c.required && !c.found).map(([n]) => n);
    const cols = [
      ...reqMiss.map((name) => ({ name, sectionKey: 'step3_required' })),
      ...gtMiss.map((name) => ({ name, sectionKey: 'step3_genotype' })),
      ...psMiss.map((name) => ({ name, sectionKey: 'step3_pathscore' })),
      ...condMiss.map((name) => ({ name, sectionKey: 'step3_conditional' })),
    ];
    const bits = [];
    if (reqMiss.length) bits.push(`${reqMiss.length} required ${reqMiss.length === 1 ? 'column' : 'columns'} missing`);
    if (gtMiss.length) bits.push('no sample genotype column');
    if (psMiss.length) bits.push('no pathogenicity score column');
    if (condMiss.length) bits.push(`${condMiss.length} conditional ${condMiss.length === 1 ? 'column' : 'columns'} required`);
    issues.push({
      id: 'cols3',
      sev: 'warning',
      title: 'Clinical decision columns missing',
      body: bits.length ? `${bits.join('; ')}.` : 'Some columns for the clinical decision step are missing.',
      cols,
      hint: 'Add these columns to your file. Annotation can supply some of them.',
      detail: renderStepDetailsFor(3, step3),
    });
  } else if (step3 && !step3.not_implemented) {
    passes.push('Clinical decision columns present');
  }

  if (rowsFlagged > 0) {
    issues.push({
      id: 'flagged',
      sev: 'warning',
      title: `${rowsFlagged.toLocaleString()} ${rowsFlagged === 1 ? 'row' : 'rows'} flagged for quality review`,
      body: 'Values in these rows did not look valid (alleles, predictors, genotype or mandatory annotation). Every row is stored; none were removed.',
    });
  }

  const optMiss = missingNames(step3?.optional_columns);
  if (optMiss.length) {
    issues.push({
      id: 'optional',
      sev: 'note',
      title: 'Optional columns not found',
      body: 'Nothing is blocked by these. They add extra evidence when present.',
      cols: optMiss.map((name) => ({ name, sectionKey: 'step3_optional' })),
      detail: renderColumnGroup('step3_optional', 'Optional columns', step3.optional_columns || {}, [], { missingLabel: 'Not found', optional: true }),
    });
  }

  const sevOrder = { blocking: 0, warning: 1, note: 2 };
  issues.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);
  const counts = {
    blocking: issues.filter((i) => i.sev === 'blocking').length,
    warning: issues.filter((i) => i.sev === 'warning').length,
    note: issues.filter((i) => i.sev === 'note').length,
  };
  const verdict = counts.blocking > 0 ? 'blocked' : counts.warning > 0 || interpretationResult.overall_status !== 'passed' ? 'warn' : 'pass';

  // ---- The decision: what to do first, and the way past it --------------------------------------
  const annotateFixes = step1?.passed && !genomeMismatch && (step2 && !step2.not_implemented && !step2.passed) && !annovarAlreadyRun;
  const handleDismiss = () => onClose?.();
  const continueLabel = backgroundJobActive ? 'Continue in background' : chatAllowed ? 'Continue' : 'Continue to chat';
  const annotateRun = () => {
    const allComplete = step1?.passed && step2?.passed && step3?.passed;
    if (allComplete) setShowAnnovarConfirm(true);
    else onAnnovarClick?.();
  };
  const annotateState = isRunningAnnovar ? 'running' : annovarAlreadyRun ? 'done' : 'idle';
  const annotateReason = genomeMismatch
    ? 'Annotation and phenotype prioritization need a matching genome build. Fix the mismatch first.'
    : !step1?.passed
      ? isVcfFile
        ? 'Essential VCF columns are missing. Upload raw data when available.'
        : 'Upload a VCF to enable annotation.'
      : annovarQuotaBlocked
        ? annovarGate.reason
        : annovarAlreadyRun
          ? 'Already run on this file.'
          : null;

  const verdictCopy = {
    blocked: {
      word: 'Blocking',
      title: 'Fix this before annotating',
      body: `${counts.blocking} blocking ${counts.blocking === 1 ? 'problem keeps' : 'problems keep'} annotation off. You can still continue to chat without it.`,
    },
    warn: {
      word: 'Warnings',
      title: 'Ready, with limits',
      body: counts.warning > 0
        ? `${counts.warning} ${counts.warning === 1 ? 'warning limits' : 'warnings limit'} what you can run. Nothing is blocked.`
        : 'Some features may be limited. Nothing is blocked.',
    },
    pass: { word: 'Passed', title: 'Ready for analysis', body: 'Every check passed. You can annotate, filter and chat.' },
  }[verdict];
  const VerdictIcon = verdict === 'blocked' ? CircleX : verdict === 'warn' ? TriangleAlert : CircleCheck;
  const vSev = verdict === 'blocked' ? 'blocking' : verdict === 'warn' ? 'warning' : 'pass';
  const vS = SEV[vSev];

  const tiles = [
    { key: 'blocking', value: counts.blocking, label: 'Blocking' },
    { key: 'warning', value: counts.warning, label: counts.warning === 1 ? 'Warning' : 'Warnings' },
    { key: 'pass', value: passes.length, label: 'Passed' },
  ];

  const verdictCard = (
    <section className="wb-card p-4" aria-labelledby="file-check-verdict-title" data-verdict={verdict}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border"
          style={{ background: vS.bg, color: vS.fg, borderColor: tint(vS.fg, 24) }}
        >
          <VerdictIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 id="file-check-verdict-title" className="m-0 text-[15px] font-medium leading-6" style={{ color: C.text }}>
              {verdictCopy.title}
            </h2>
            <SeverityBadge sev={vSev} />
          </div>
          <p className="m-0 mt-0.5 text-[13px] leading-5" style={{ color: C.textMuted }}>{verdictCopy.body}</p>
        </div>
      </div>

      <ul className="m-0 mt-3.5 grid list-none grid-cols-3 gap-2 p-0" aria-label="Check results">
        {tiles.map((t) => {
          const s = SEV[t.key];
          const Icon = s.icon;
          const live = t.value > 0;
          return (
            <li
              key={t.key}
              className="flex flex-col gap-1 rounded-2xl border px-3 py-2"
              style={live ? { background: s.bg, borderColor: tint(s.fg, 22) } : { borderColor: LINE }}
            >
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: live ? s.fg : C.textMuted }}>
                <Icon aria-hidden className="size-3.5" />
                {t.label}
              </span>
              <span className="text-[22px] font-medium leading-none tabular-nums" style={{ color: live ? C.text : C.textMuted }}>
                <RollUp value={t.value} />
              </span>
            </li>
          );
        })}
      </ul>

      {totalColumns > 0 ? (
        <div className="mt-3.5">
          <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums" style={{ color: C.textMuted }}>
            <span><span className="font-medium" style={{ color: C.text }}>{columnTotals.found}</span> of {totalColumns} columns recognised</span>
            {columnTotals.missing > 0 ? <span><span className="font-medium" style={{ color: C.error }}>{columnTotals.missing}</span> to look at</span> : <span>All found</span>}
          </div>
          <div
            className="wb-track mt-1.5"
            role="progressbar"
            aria-label="Columns recognised"
            aria-valuemin={0}
            aria-valuemax={totalColumns}
            aria-valuenow={columnTotals.found}
          >
            <div className="wb-fill" style={{ width: `${settled ? Math.max(foundPct, 2) : 0}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );

  const header = (
    <div className="flex-shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="file-analysis-title" className="text-sm font-semibold" style={{ color: C.text }}>File check</h2>
          <p className="mt-0.5 text-[13px]" style={{ color: C.textMuted }}>{verdictCopy.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SeverityBadge sev={vSev} />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onClose?.()} aria-label="Close" className="-mr-1.5 [@media(pointer:coarse)]:size-11">
            <X aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );

  const groups = [
    ['blocking', 'Blocking'],
    ['warning', 'Warnings'],
    ['note', 'Notes'],
  ];

  const issuesList = issues.length > 0 ? (
    <div className="space-y-4">
      {groups.map(([sev, title]) => {
        const list = issues.filter((i) => i.sev === sev);
        if (!list.length) return null;
        return (
          <section key={sev} aria-label={title} className="space-y-2">
            <h3 className="m-0 flex items-center gap-2 px-1 text-[12px] font-medium uppercase tracking-wide" style={{ color: SEV[sev].fg }}>
              {title}
              <span className="rounded-full px-1.5 text-[11px] tabular-nums" style={{ background: SEV[sev].bg }}>{list.length}</span>
            </h3>
            <ul className="m-0 list-none space-y-2 p-0">
              {list.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  open={Boolean(openIssues[issue.id])}
                  onToggle={() => setOpenIssues((prev) => ({ ...prev, [issue.id]: !prev[issue.id] }))}
                  onJump={jumpToColumn}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  ) : null;

  const passedBlock = passes.length > 0 ? (
    <section className="wb-card overflow-hidden" aria-label="Passed checks">
      <button
        type="button"
        aria-expanded={showPassed}
        aria-controls="fc-passed"
        onClick={() => setShowPassed((v) => !v)}
        className={`flex min-h-10 w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 ${FOCUS} focus-visible:-outline-offset-2`}
      >
        <Turn open={showPassed}><ChevronRight aria-hidden className="size-3.5" style={{ color: C.textDim }} /></Turn>
        <CircleCheck aria-hidden className="size-3.5" style={{ color: C.success }} />
        <span className="flex-1" style={{ color: C.text }}>Passed checks</span>
        <span className="text-xs tabular-nums" style={{ color: C.textMuted }}>{passes.length}</span>
      </button>
      <Collapse open={showPassed} id="fc-passed">
        <ul className="m-0 list-none border-t p-0" style={{ borderColor: LINE }}>
          {passes.map((p) => (
            <li key={p} className="flex items-center gap-2 border-t px-3.5 py-2 text-[13px] first:border-t-0" style={{ borderColor: LINE, color: C.text }}>
              <CircleCheck aria-hidden className="size-3.5 shrink-0" style={{ color: C.success }} />
              {p}
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  ) : null;

  // What comes after the check: the tools that need a clean file. Hidden while the file is blocked.
  const nextTools = verdict !== 'blocked' ? (
    <section className="wb-card space-y-3 p-4" aria-label="After the check">
      <p className="wb-card-title m-0">After the check</p>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        {!annotateFixes ? (
          <div className="max-w-xs space-y-1">
            <StateButton
              state={annotateState}
              labels={{ idle: 'Run annotation', running: 'Running annotation', done: 'Annotation done' }}
              icon={Tags}
              variant="outline"
              onClick={annovarEnabled && !annovarAlreadyRun ? annotateRun : undefined}
              disabled={!(annovarEnabled && !annovarAlreadyRun) && !isRunningAnnovar}
              className="[@media(pointer:coarse)]:h-11"
            />
            {annotateReason ? <p className="text-xs" style={{ color: annovarQuotaBlocked ? C.error : C.textMuted }}>{annotateReason}</p> : null}
            {annovarMeterLabel && !annovarQuotaBlocked ? (
              <p className="text-[12px] tabular-nums" style={{ color: C.textMuted }}>
                {annovarMeterLabel}{annovarMeterDetail && <span> · {annovarMeterDetail}</span>}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="max-w-xs space-y-1">
          <StateButton
            state={isApplyingProprietaryFilter ? 'running' : acmgFilterActive ? 'done' : 'idle'}
            labels={{ idle: 'ACMG', running: 'Applying', done: 'ACMG applied' }}
            icon={Filter}
            variant="outline"
            onClick={() => onProprietaryFilterClick?.('filter_1')}
            disabled={!acmgFilterCanApply || isApplyingProprietaryFilter || acmgFilterActive}
            className="[@media(pointer:coarse)]:h-11"
            style={acmgFilterActive ? { borderColor: 'hsl(var(--brand-300))', background: 'hsl(var(--brand-100))', color: 'hsl(var(--brand-700))' } : undefined}
          />
          {/* Quota and readiness are different problems, so they get different copy. */}
          {!acmgFilterCanApply && !acmgFilterActive && step1?.passed && !acmgQuotaBlocked ? (
            <p className="text-xs" style={{ color: C.textMuted }}>Run annotation first. The ACMG filter needs ClinVar or InterVar annotations and gnomAD frequency.</p>
          ) : null}
          {(acmgMeterLabel || acmgQuotaBlocked) && !acmgFilterActive ? (
            <p className="text-[12px] tabular-nums" style={{ color: acmgQuotaBlocked ? C.error : C.textMuted }}>
              {acmgQuotaBlocked ? acmgExomiserGate.reason : acmgMeterLabel}
              {!acmgQuotaBlocked && acmgMeterDetail && <span> · {acmgMeterDetail}</span>}
            </p>
          ) : null}
        </div>

        {onOpenExomiser ? (() => {
          // Exomiser applies draw on the same metered budget as ACMG.
          const exomiserEnabled = exomiserCanApply && !genomeMismatch && !acmgQuotaBlocked && !phenotypeMissing;
          const reason = genomeMismatch
            ? 'Annotation and phenotype prioritization need a matching genome build. Fix the mismatch first.'
            : phenotypeMissing
              ? 'Add a phenotype description in sample info to enable phenotype-driven prioritization. Everything else runs without one.'
              : 'Run annotation first. Phenotype prioritization needs an annotated file.';
          return (
            <div className="max-w-xs space-y-1">
              <Button type="button" variant="outline" onClick={() => onOpenExomiser()} disabled={!exomiserEnabled} className="[@media(pointer:coarse)]:h-11">
                <PhenotypeAiLabel variant="inline" />
              </Button>
              {!exomiserEnabled && step1?.passed ? (
                <p className="text-xs" style={{ color: genomeMismatch ? C.error : C.textMuted }}>{reason}</p>
              ) : null}
            </div>
          );
        })() : null}
      </div>
      <p className="m-0 text-xs" style={{ color: C.textMuted }}>You can also skip filters and chat directly.</p>
    </section>
  ) : null;

  const content = (
    <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${embedded ? 'px-4 pb-4 pt-1' : 'px-4 py-4 sm:px-6'}`}>
      {verdictCard}

      {backgroundJobActive && (
        <Notice tone="info" icon={Info}>
          {isRunningAnnovar
            ? 'Annotation is running in the background. You can leave this view and continue in chat. Progress shows in the Pipeline tab.'
            : 'The ACMG filter is running in the background. You can leave this view and continue in chat.'}
        </Notice>
      )}

      {issuesList}
      {passedBlock}
      {nextTools}
    </div>
  );

  // The decision bar: one primary action that follows the verdict, and the way past it.
  const fixPrimary = verdict === 'blocked'
    ? (canFixByUpload ? { label: fixUploadLabel, run: runFixUpload } : null)
    : annotateFixes
      ? { annotate: true }
      : null;
  const decisionNote = verdict === 'blocked'
    ? 'Recommended: fix it first. If you proceed anyway, annotation and the filters that need these columns will not run.'
    : annotateFixes
      ? 'Annotation adds the missing columns. Proceeding without it keeps those features limited.'
      : verdict === 'warn'
        ? 'Nothing here stops you. The warnings only limit some features.'
        : null;

  const footer = (
    <div
      className={`flex flex-shrink-0 flex-col gap-2 border-t px-4 pt-3 pb-[max(0.75rem,var(--mtabs-safe-b,env(safe-area-inset-bottom)))] ${embedded ? '' : 'bg-background sm:px-6'}`}
      style={{ borderColor: LINE }}
    >
      {decisionNote ? <p className="m-0 text-xs leading-5" style={{ color: C.textMuted }}>{decisionNote}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {verdict === 'pass' || (!fixPrimary && verdict !== 'blocked') ? (
          <Button type="button" onClick={handleDismiss} className="[@media(pointer:coarse)]:h-11">{continueLabel}</Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={handleDismiss} className="[@media(pointer:coarse)]:h-11">
              {backgroundJobActive ? 'Continue in background' : 'Proceed anyway'}
            </Button>
            {fixPrimary?.annotate ? (
              <StateButton
                state={annotateState}
                labels={{ idle: 'Run annotation', running: 'Running annotation', done: 'Annotation done' }}
                icon={Tags}
                onClick={annovarEnabled ? annotateRun : undefined}
                disabled={!annovarEnabled && !isRunningAnnovar}
                className="[@media(pointer:coarse)]:h-11"
              />
            ) : fixPrimary ? (
              <Button type="button" onClick={fixPrimary.run} className="[@media(pointer:coarse)]:h-11">{fixPrimary.label}</Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove file?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the uploaded file from this conversation. Annotation and filters in progress will stop.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep file</AlertDialogCancel>
            <HoldButton
              tone="danger"
              icon={Trash2}
              doneLabel="Removing"
              onConfirm={async () => {
                if (onDeleteDocument) await onDeleteDocument();
                setShowDeleteConfirm(false);
                onClose?.();
              }}
            >
              Hold to delete file
            </HoldButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Annotation confirmation: all required columns are already present */}
      <AlertDialog open={showAnnovarConfirm} onOpenChange={setShowAnnovarConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run annotation on this file?</AlertDialogTitle>
            <AlertDialogDescription>
              All required columns are already in your file. Running annotation adds more information to some
              columns and makes the analysis more streamlined.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                setShowAnnovarConfirm(false);
                onAnnovarClick?.();
              }}
            >
              Run annotation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {embedded ? (
        // Workspace mode: plain content that fills the panel the lead mounts it in.
        <div className="flex h-full min-h-0 flex-col text-foreground">
          {content}
          {footer}
        </div>
      ) : (
        // Modal mode (kept for hosts that still mount it as a dialog). The backdrop does not close, which avoids
        // stacked-modal mis-clicks; use the close button or Continue.
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 supports-backdrop-filter:backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-analysis-title"
            className="flex max-h-[min(90vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10"
            onClick={(e) => e.stopPropagation()}
          >
            {header}
            {content}
            {footer}
          </div>
        </div>
      )}
    </>
  );
};

export default ColumnInterpretationResults;
