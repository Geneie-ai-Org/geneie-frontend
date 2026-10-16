import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, RotateCcw, Upload, Trash2, Info, Search, PencilLine, ChevronRight, Check, Lock, Plus, Tags, ListFilter, Play } from 'lucide-react';
import { getDeviceId } from '@/lib/deviceId';
import { doc, getDoc } from 'firebase/firestore';
import { optionalIdToken } from '@/lib/safeAuth';
import DocumentUpload from './DocumentUpload';
import ExportVariantsButton from './ExportVariantsButton';
import CaseReportDownloadButton from './CaseReportDownloadButton';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiUrl, getApiOrigin } from '@/config/api';
import { toast } from 'sonner';
import { apiErrorDetailToMessage as sharedApiErrorDetailToMessage, humanizeError } from '@/lib/humanizeError';
import { groupColumns, OTHER_GROUP } from '@/lib/variantColumnGroups';
import PhenotypeAiLabel from '@/components/PhenotypeAiLabel';
import AcmgModePanel from '@/components/tabs/AcmgModePanel';
import { PhenotypeLockedPreview, PhenotypeNext, PhenotypeSummary } from '@/components/tabs/PhenotypeModePanel';
import { Collapse, Turn, SelectionMarker, StateButton, Dismissible, undoToast, SPRING } from '@/components/motion';
import { useDoneFlash } from '@/components/motion/useDoneFlash';
import { sampleHasPhenotype } from '@/components/PhenotypeInputPanel';
import AddFilterCommand, { KindGlyph } from '@/components/variants/AddFilterCommand';
import FilterBar from '@/components/variants/FilterBar';
import { usePanelWidth } from '@/hooks/useWorkbenchWidth';
import ApplyStatus, { describeDiff } from '@/components/variants/ApplyStatus';
import { RangeHistogram } from '@/components/variants/Histogram';
import { useVariantSample, sampleCaption } from '@/components/variants/useVariantSample';
import {
  PHENOTYPE_FILTER_DISPLAY_NAME,
  PHENOTYPE_FILTER_DESCRIPTION,
  formatAcmgPhenotypeMeterLabel,
  PHENOTYPE_STARTING_MESSAGE,
  PHENOTYPE_FAILED_TITLE,
  PHENOTYPE_FAILED_FALLBACK,
  sanitizePhenotypeStatusMessage,
} from '@/lib/filterDisplayNames';

/**
 * Backwards-compatible replacement for the old in-panel notification overlay.
 * Accepts the same {message, type} shape but routes through the global sonner
 * <Toaster /> mounted in main.jsx so toasts never collide with panel content.
 */
function notify(payload) {
  if (!payload) return;
  const raw = payload.message;
  let msg;
  if (typeof raw === 'string') msg = raw;
  else if (raw && typeof raw === 'object' && typeof raw.message === 'string') msg = raw.message;
  else if (raw != null) { try { msg = JSON.stringify(raw); } catch (_) { msg = String(raw); } }
  else msg = '';
  if (!msg) return;
  const type = payload.type || 'info';
  if (type === 'error') toast.error(msg);
  else if (type === 'success') toast.success(msg);
  else if (type === 'warning') toast.warning?.(msg) || toast(msg);
  else toast(msg);
}

// Proprietary filter descriptions (for tooltips - no exact parameters)
export const ACMG_FILTER_DISPLAY_NAME = 'ACMG filter';
export { PHENOTYPE_FILTER_DISPLAY_NAME };

const PROPRIETARY_FILTER_1_DESCRIPTION = "ClinVar and/or InterVar pathogenic classes, with rare gnomAD frequency (<1%) or missing frequency retained.";

const apiErrorDetailToMessage = sharedApiErrorDetailToMessage;

async function pollFilterJobStatus(conversationId, token, apiBase) {
  const maxPollMs = 14 * 24 * 60 * 60 * 1000;
  const started = Date.now();
  const pollOnce = async () => {
    const headers = { 'X-Device-Id': getDeviceId() };
    if (token) headers.Authorization = `Bearer ${token}`;
    const statusRes = await fetch(`${apiBase}/api/filter-status/${conversationId}`, {
      headers,
    });
    if (!statusRes.ok) return null;
    const statusData = await statusRes.json().catch(() => ({}));
    const job = statusData.filter_job || {};
    const msg = job.message || statusData.message || 'Applying ACMG filter…';
    if (job.status === 'completed' || statusData.status === 'completed') {
      return { filtered_count: job.filtered_count ?? statusData.filtered_count ?? 0 };
    }
    if (job.status === 'failed' || statusData.status === 'failed') {
      throw new Error(msg || job.error || 'ACMG filter failed');
    }
    return null;
  };

  const first = await pollOnce();
  if (first) return first;

  while (Date.now() - started < maxPollMs) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const result = await pollOnce();
    if (result) return result;
  }
  throw new Error('ACMG filter is still running. Check back later.');
}

/** Same shape as POST /api/filter-variants `filters` body (must stay in sync with applyFilters). */
function mergeParameterRangesIntoFilters(prevFilters, parameterRanges) {
  if (!parameterRanges || typeof parameterRanges !== 'object') return prevFilters;
  const next = { ...prevFilters };
  for (const param of Object.keys(parameterRanges)) {
    const range = parameterRanges[param];
    if (!range || typeof range !== 'object') continue;
    const existing = next[param] || {};
    next[param] = {
      min: range.min,
      max: range.max,
      currentMin: existing.currentMin ?? null,
      currentMax: existing.currentMax ?? null,
    };
  }
  return next;
}

function buildFilterPayloadFromState(filters, categoricalFilters) {
  const filterObject = {};
  for (const param in filters) {
    const filter = filters[param];
    const hasMin = filter && filter.currentMin !== null && filter.currentMin !== undefined;
    const hasMax = filter && filter.currentMax !== null && filter.currentMax !== undefined;
    if (hasMin || hasMax) {
      const hasCategorical =
        categoricalFilters[param] &&
        Array.isArray(categoricalFilters[param]) &&
        categoricalFilters[param].length > 0;
      if (!hasCategorical) {
        const entry = {};
        if (hasMin) entry.min = filter.currentMin;
        if (hasMax) entry.max = filter.currentMax;
        filterObject[param] = entry;
      }
    }
  }
  for (const param in categoricalFilters) {
    const selected = categoricalFilters[param];
    if (selected && Array.isArray(selected) && selected.length > 0) {
      filterObject[param] = {
        values: [...selected].map(String).sort()
      };
    }
  }
  return filterObject;
}

function normalizeAppliedFiltersForCompare(applied) {
  if (!applied || typeof applied !== 'object') return {};
  const o = { ...applied };
  delete o._numeric_logic;
  return o;
}

function numericBoundsEqual(a, b) {
  const na = a == null || a === undefined;
  const nb = b == null || b === undefined;
  if (na && nb) return true;
  if (na || nb) return false;
  return Number(a) === Number(b);
}

/** True if the two filter payloads are the same effect (order of categorical values ignored). */
function filterPayloadsEquivalent(current, appliedRaw) {
  const applied = normalizeAppliedFiltersForCompare(appliedRaw);
  const kc = Object.keys(current).sort();
  const ka = Object.keys(applied).sort();
  if (kc.length !== ka.length) return false;
  if (kc.join('\0') !== ka.join('\0')) return false;
  for (const k of kc) {
    const c = current[k];
    const p = applied[k];
    if (!c || !p || typeof c !== 'object' || typeof p !== 'object') return false;
    if ('min' in c || 'max' in c) {
      if (!numericBoundsEqual(c.min, p.min) || !numericBoundsEqual(c.max, p.max)) return false;
    } else if ('values' in c && 'values' in p) {
      const sc = [...(c.values || [])].map(String).sort().join('\0');
      const sp = [...(p.values || [])].map(String).sort().join('\0');
      if (sc !== sp) return false;
    } else {
      return false;
    }
  }
  return true;
}

/** How a new payload differs from the applied one, by column: { added, removed, changed }. */
function diffFilterPayloads(prevRaw, next) {
  const prev = normalizeAppliedFiltersForCompare(prevRaw);
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const k of Object.keys(next)) {
    if (!(k in prev)) added += 1;
    else if (!filterPayloadsEquivalent({ [k]: next[k] }, { [k]: prev[k] })) changed += 1;
  }
  for (const k of Object.keys(prev)) if (!(k in next)) removed += 1;
  return { added, removed, changed };
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers (workspace tab "Variants")             */
/* ------------------------------------------------------------------ */

const TONE_DOT = {
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  error: 'bg-[var(--error)]',
  info: 'bg-[var(--info)]',
  muted: 'bg-[var(--text-disabled)]',
};
const TONE_TEXT = {
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
  info: 'text-[var(--info)]',
  muted: 'text-muted-foreground',
};
const TONE_SOFT = {
  success: 'bg-[var(--success-soft)]',
  warning: 'bg-[var(--warning-soft)]',
  error: 'bg-[var(--error-soft)]',
  info: 'bg-[var(--info-soft)]',
  muted: 'bg-muted',
};

/** A status is a word plus a small dot. The dot never animates next to a contradicting label. */
function StatusDot({ tone = 'muted', pulse = false, className = '' }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-1.5 shrink-0 rounded-full ${TONE_DOT[tone] || TONE_DOT.muted} ${
        pulse ? 'animate-pulse motion-reduce:animate-none' : ''
      } ${className}`}
    />
  );
}

/** Status as a pill: dot plus word, never colour alone. Reuses the shared `.wb-status` states. */
const PILL_STATE = { success: 'done', info: 'running', error: 'failed', muted: 'pending', warning: 'pending' };
function StatusPill({ tone = 'muted', children, className = '' }) {
  const warn = tone === 'warning'
    ? '!border-transparent !bg-[var(--warning-soft)] !text-[var(--warning)] before:!border-0 before:!bg-[currentColor]'
    : '';
  return (
    <span data-state={PILL_STATE[tone] || 'pending'} className={`wb-status ${warn} ${className}`}>
      {children}
    </span>
  );
}

/** Soft notice with a status fill, a plain-words title and the one next action as a pill button. */
function InlineNotice({ tone = 'warning', title, children, action = null, role }) {
  return (
    <div
      role={role}
      className={`wb-rise rounded-2xl px-3.5 py-3 text-[13px] leading-snug text-foreground ${TONE_SOFT[tone] || TONE_SOFT.muted}`}
    >
      {title && (
        <p className={`flex items-start gap-2 font-medium ${TONE_TEXT[tone] || ''}`}>
          <StatusDot tone={tone} className="mt-[7px]" />
          <span>{title}</span>
        </p>
      )}
      {children && <div className={`${title ? 'mt-1 pl-3.5' : ''} text-muted-foreground`}>{children}</div>}
      {action && <div className={`mt-2.5 ${title ? 'pl-3.5' : ''}`}>{action}</div>}
    </div>
  );
}

/** Group header used above a set of controls: a muted title with an optional right-hand slot. */
function CardHeader({ title, count = null, children = null }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <h3 className="wb-card-title flex items-center gap-1.5">
        {title}
        {count != null && <span className="tabular-nums">{count}</span>}
      </h3>
      {children}
    </div>
  );
}

function formatBound(n) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-3) return v.toExponential(2).replace('e+', 'e');
  return String(Number(v.toPrecision(4)));
}

/** One-line description of a filter payload entry, for chips and row summaries. */
function describeFilterSpec(spec) {
  if (!spec || typeof spec !== 'object') return '';
  if (Array.isArray(spec.values)) {
    const vals = spec.values.map(String);
    if (vals.length === 0) return '';
    if (vals.length <= 2) return vals.join(', ');
    return `${vals.length} values`;
  }
  const hasMin = spec.min !== null && spec.min !== undefined;
  const hasMax = spec.max !== null && spec.max !== undefined;
  if (hasMin && hasMax) return `${formatBound(spec.min)} to ${formatBound(spec.max)}`;
  if (hasMin) return `≥ ${formatBound(spec.min)}`;
  if (hasMax) return `≤ ${formatBound(spec.max)}`;
  return '';
}

const PHENOTYPE_REASON_LABELS = {
  germline_only: 'Analysis type must be Germline.',
  phenotype_required: 'Add a phenotype description to the sample metadata (edit the file pill).',
  hpo_selection_required:
    'In sample info, select at least one clinical finding (HPO term) present in this patient.',
  annovar_required: 'Run annotation first. Phenotype prioritization requires an annotated file.',
  proprietary_filter_active: 'Another proprietary filter is active. Remove it first.',
  manual_filter_active: 'Manual filters are active. Reset them first.',
  manual_filters_active: 'Manual filters are active. Reset them first.',
  variant_limit_exceeded: 'File exceeds the phenotype prioritization variant limit.',
  not_configured: 'Phenotype prioritization is not configured on the server.',
  genome_build_mismatch: 'Genome build mismatch. Resolve it in sample metadata.',
  job_running: 'Phenotype prioritization is already running on this conversation.',
};

/** Quick-pick bounds read better with four significant digits. */
const roundPreset = (n) => Number(n.toPrecision(4));

/** DOM-safe id fragment for a column name. */
const safeId = (name) => String(name).replace(/[^a-zA-Z0-9_-]/g, '_');

const BOOLISH = /^(true|false|yes|no|y|n|t|f|0|1)$/i;

const FIELD_CLASS =
  'h-9 [@media(pointer:coarse)]:h-11 w-full min-w-0 rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3.5 text-[13px] md:text-[13px] [@media(pointer:coarse)]:text-[16px] tabular-nums text-foreground placeholder:text-muted-foreground outline-none transition-[color,background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] disabled:cursor-not-allowed disabled:opacity-50';

const TEXTAREA_CLASS =
  'w-full resize-none rounded-2xl border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3.5 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)]';

/** Small round icon-only control inside a field or chip (clear, remove). */
const MINI_ICON_BTN =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:opacity-50 [@media(pointer:coarse)]:size-9';

/** Dual-handle range slider + min/max fields for numeric column filters. */
function NumericRangeSlider({ rangeMin, rangeMax, currentMin, currentMax, onMinChange, onMaxChange, disabled, onEnterApply = null, flashKey = 0, histogram = null }) {
  const uid = useId();
  const reduceMotion = useReducedMotion();
  // A quick-pick changes both fields at once: ring them in teal for a moment so the change reads.
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!flashKey) return undefined;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 650);
    return () => clearTimeout(t);
  }, [flashKey]);
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = dragging;

  /** Draft strings while an input is focused: commit on blur so typing is not overwritten each keystroke. */
  const [minDraft, setMinDraft] = useState(null);
  const [maxDraft, setMaxDraft] = useState(null);
  /** Validation runs on blur (or Enter), never per keystroke. An invalid entry stays in the field with its error below. */
  const [minError, setMinError] = useState(null);
  const [maxError, setMaxError] = useState(null);

  const span = rangeMax - rangeMin;
  const eps = span > 0 ? Math.max(1e-12, span * 1e-10) : 0;

  const displayLo = currentMin != null ? currentMin : rangeMin;
  const displayHi = currentMax != null ? currentMax : rangeMax;
  const lo = Math.min(displayLo, displayHi);
  const hi = Math.max(displayLo, displayHi);

  const loPct = span > 0 ? ((lo - rangeMin) / span) * 100 : 0;
  const hiPct = span > 0 ? ((hi - rangeMin) / span) * 100 : 100;

  const latest = useRef({});
  latest.current = {
    rangeMin,
    rangeMax,
    span,
    eps,
    currentMin,
    currentMax,
    lo,
    hi,
    onMinChange,
    onMaxChange,
  };

  const valueFromClientX = useCallback(
    (clientX) => {
      const el = trackRef.current;
      const { rangeMin: r0, span: s } = latest.current;
      if (!el || s <= 0) return r0;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      return r0 + (rect.width > 0 ? (x / rect.width) * s : 0);
    },
    []
  );

  const maybeClearFullRange = useCallback((cMin, cMax) => {
    const { rangeMin: r0, rangeMax: r1, eps: e, onMinChange: om, onMaxChange: ox } = latest.current;
    const s = r1 - r0;
    if (s <= 0) return;
    const effLo = cMin != null ? cMin : r0;
    const effHi = cMax != null ? cMax : r1;
    const a = Math.min(effLo, effHi);
    const b = Math.max(effLo, effHi);
    if (a <= r0 + e && b >= r1 - e) {
      om(null);
      ox(null);
    }
  }, []);

  useEffect(() => {
    if (!dragging || disabled) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const raw = valueFromClientX(e.clientX);
      const L = latest.current;
      if (d === 'low') {
        const v = Math.max(L.rangeMin, Math.min(raw, L.hi));
        L.onMinChange(v);
        maybeClearFullRange(v, L.currentMax);
      } else {
        let v = Math.min(L.rangeMax, Math.max(raw, L.lo));
        L.onMaxChange(v);
        maybeClearFullRange(L.currentMin, v);
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, disabled, valueFromClientX, maybeClearFullRange]);

  const onThumbDown = (which, e) => {
    if (disabled) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragging(which);
  };

  const onTrackPointerDown = (e) => {
    if (disabled) return;
    if (e.button != null && e.button !== 0) return;
    if (e.target?.closest?.('[data-range-thumb="1"]')) return;
    e.preventDefault();
    const raw = valueFromClientX(e.clientX);
    const distLo = Math.abs(raw - lo);
    const distHi = Math.abs(raw - hi);
    if (distLo <= distHi) {
      let v = Math.max(rangeMin, Math.min(raw, hi));
      onMinChange(v);
      maybeClearFullRange(v, currentMax);
    } else {
      let v = Math.min(rangeMax, Math.max(raw, lo));
      onMaxChange(v);
      maybeClearFullRange(currentMin, v);
    }
  };

  /** Arrow keys move a thumb by 1% of the span (10% with Shift). Home/End jump to the bounds. */
  const onThumbKeyDown = (which, e) => {
    if (disabled || span <= 0) return;
    const step = span * (e.shiftKey ? 0.1 : 0.01);
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    if (which === 'low') {
      const target = e.key === 'Home' ? rangeMin : e.key === 'End' ? hi : lo + delta;
      const v = Math.max(rangeMin, Math.min(target, hi));
      onMinChange(v);
      maybeClearFullRange(v, currentMax);
    } else {
      const target = e.key === 'Home' ? lo : e.key === 'End' ? rangeMax : hi + delta;
      const v = Math.min(rangeMax, Math.max(target, lo));
      onMaxChange(v);
      maybeClearFullRange(currentMin, v);
    }
  };

  if (span <= 0 || !Number.isFinite(span)) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Filter value is fixed at <span className="font-medium text-foreground tabular-nums">{formatBound(rangeMin)}</span> (no range).
      </p>
    );
  }

  /** Returns true when the text was accepted (or cleared); non-numeric text stays in the field with an error below it. */
  const commitTyped = (raw, which) => {
    const setter = which === 'min' ? onMinChange : onMaxChange;
    const setError = which === 'min' ? setMinError : setMaxError;
    const current = which === 'min' ? currentMin : currentMax;
    const text = String(raw ?? '').trim();
    if (text === '') {
      // An emptied field removes that bound.
      setError(null);
      if (current != null) setter(null);
      return true;
    }
    const n = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(n)) {
      setError('Enter a number, for example 0.01.');
      return false;
    }
    setError(null);
    // Out-of-range numbers are clamped to the data range, as before (the bounds shown are rounded,
    // so rejecting them would refuse the very values the field displays).
    const v = Math.max(rangeMin, Math.min(n, rangeMax));
    if (which === 'min') {
      if (v > hi) onMaxChange(v);
      onMinChange(v);
      maybeClearFullRange(v, v > hi ? v : currentMax);
    } else {
      if (v < lo) onMinChange(v);
      onMaxChange(v);
      maybeClearFullRange(v < lo ? v : currentMin, v);
    }
    return true;
  };

  const minInputValue = minDraft !== null ? minDraft : currentMin != null ? String(currentMin) : '';
  const maxInputValue = maxDraft !== null ? maxDraft : currentMax != null ? String(currentMax) : '';

  // The thumb grows while it is dragged. The scale lives in the inline transform (which already
  // centres the thumb), so it is not overridden by the centring translate.
  const thumbClass = (active) =>
    `absolute size-[18px] [@media(pointer:coarse)]:size-6 before:absolute before:-inset-3 before:content-[''] rounded-full border-2 border-[hsl(var(--brand-500))] bg-[hsl(var(--wb-card))] outline-none transition-[transform,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--brand-50))] motion-reduce:transition-none ${
      active ? 'z-20 shadow-[0_0_0_5px_hsl(var(--brand-500)/0.18)]' : 'z-10'
    }`;
  const thumbTransform = (active) => (active && !reduceMotion ? 'translate(-50%, -50%) scale(1.25)' : 'translate(-50%, -50%)');

  return (
    <div className="space-y-2 select-none">
      {histogram && (
        <RangeHistogram values={histogram.values} rangeMin={rangeMin} rangeMax={rangeMax} lo={lo} hi={hi} />
      )}
      <div
        ref={trackRef}
        className={`relative flex h-6 [@media(pointer:coarse)]:h-11 items-center ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
        onPointerDown={onTrackPointerDown}
        role="presentation"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[hsl(var(--brand-200))]" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[hsl(var(--brand-500))]"
          style={{ left: `${loPct}%`, width: `${Math.max(hiPct - loPct, 0)}%` }}
        />
        <button
          type="button"
          role="slider"
          data-range-thumb="1"
          aria-label="Minimum value"
          aria-valuemin={rangeMin}
          aria-valuemax={hi}
          aria-valuenow={lo}
          disabled={disabled}
          onPointerDown={(e) => onThumbDown('low', e)}
          onKeyDown={(e) => onThumbKeyDown('low', e)}
          className={thumbClass(dragging === 'low')}
          style={{ left: `${loPct}%`, top: '50%', transform: thumbTransform(dragging === 'low'), touchAction: 'none' }}
        />
        <button
          type="button"
          role="slider"
          data-range-thumb="1"
          aria-label="Maximum value"
          aria-valuemin={lo}
          aria-valuemax={rangeMax}
          aria-valuenow={hi}
          disabled={disabled}
          onPointerDown={(e) => onThumbDown('high', e)}
          onKeyDown={(e) => onThumbKeyDown('high', e)}
          className={thumbClass(dragging === 'high')}
          style={{ left: `${hiPct}%`, top: '50%', transform: thumbTransform(dragging === 'high'), touchAction: 'none' }}
        />
      </div>
      <p id={`${uid}-range`} className="text-[12px] text-muted-foreground tabular-nums">
        Data range {formatBound(rangeMin)} to {formatBound(rangeMax)}.{histogram?.caption ? ` Bars show ${histogram.caption}.` : ''}
      </p>
      <div className="grid grid-cols-2 items-start gap-2">
        {[
          { which: 'min', label: 'Min', draft: minDraft, setDraft: setMinDraft, error: minError, setError: setMinError, value: minInputValue, placeholder: formatBound(rangeMin), current: currentMin, aria: 'Minimum filter value' },
          { which: 'max', label: 'Max', draft: maxDraft, setDraft: setMaxDraft, error: maxError, setError: setMaxError, value: maxInputValue, placeholder: formatBound(rangeMax), current: currentMax, aria: 'Maximum filter value' },
        ].map((f) => {
          const inputId = `${uid}-${f.which}`;
          const errId = `${inputId}-error`;
          return (
            <div key={f.which} className="min-w-0">
              <label htmlFor={inputId} className="mb-1 block pl-1 text-[12px] font-medium text-muted-foreground">{f.label}</label>
              <input
                id={inputId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={f.value}
                placeholder={f.placeholder}
                onFocus={() => {
                  if (!disabled && f.draft === null) f.setDraft(f.current != null ? String(f.current) : '');
                }}
                onChange={(e) => {
                  f.setDraft(e.target.value);
                  if (f.error) f.setError(null);
                }}
                onBlur={(e) => {
                  if (commitTyped(e.target.value, f.which)) f.setDraft(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (commitTyped(e.currentTarget.value, f.which)) {
                    f.setDraft(null);
                    onEnterApply?.();
                  }
                }}
                disabled={disabled}
                aria-label={f.aria}
                aria-invalid={f.error ? true : undefined}
                aria-describedby={f.error ? `${errId} ${uid}-range` : `${uid}-range`}
                className={`${FIELD_CLASS} select-text ${f.error ? 'border-[var(--error)]' : ''} ${flashing && !f.error ? '!border-[hsl(var(--brand-500))] ring-2 ring-[hsl(var(--brand-500)/0.45)]' : ''}`}
              />
              {f.error && (
                <p id={errId} role="alert" className="mt-1 text-[12px] leading-snug text-[var(--error)]">
                  {f.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-muted-foreground [@media(pointer:coarse)]:hidden">Press Enter in a field to apply.</p>
    </div>
  );
}

const CATEGORY_RENDER_CAP = 200;

/** Searchable multi-select; two-value yes/no style columns become Any / A / B. */
function CategoricalEditor({ values, selected, disabled, onChange, counts = null, caption = '' }) {
  const [query, setQuery] = useState('');
  const segId = useId();
  const reduceMotion = useReducedMotion();
  const all = Array.isArray(values) ? values : [];
  const nonEmpty = all.filter((v) => String(v) !== 'Empty');
  const isBoolean =
    nonEmpty.length > 0 &&
    nonEmpty.length <= 2 &&
    nonEmpty.every((v) => BOOLISH.test(String(v))) &&
    selected.length <= 1;

  if (isBoolean) {
    const options = [{ key: '__any', label: 'Any', value: null }, ...nonEmpty.map((v) => ({ key: String(v), label: String(v), value: v }))];
    const current = selected.length === 0 ? '__any' : String(selected[0]);
    return (
      <div role="radiogroup" aria-label="Value" className="inline-flex w-full gap-0.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] p-0.5">
        {options.map((opt) => {
          const active = current === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.value === null ? [] : [opt.value])}
              className={`relative h-7 [@media(pointer:coarse)]:h-10 flex-1 rounded-full border border-transparent px-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'text-[hsl(var(--brand-700))]'
                  : 'text-muted-foreground hover:bg-[hsl(var(--brand-50))] hover:text-foreground'
              }`}
            >
              {active && (
                <motion.span
                  aria-hidden="true"
                  layoutId={`${segId}-seg`}
                  transition={reduceMotion ? { duration: 0 } : SPRING}
                  className="pointer-events-none absolute -inset-px rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]"
                />
              )}
              <span className="relative inline-flex items-center justify-center gap-1">
                {active && (
                  <motion.span
                    aria-hidden="true"
                    className="inline-flex"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 22 }}
                  >
                    <Check className="size-3.5" strokeWidth={2.4} />
                  </motion.span>
                )}
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No values are listed for this column, so it cannot be filtered here. It is still available to chat.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const matchedAll = q ? all.filter((v) => String(v).toLowerCase().includes(q)) : all;
  // With a loaded sample the most common values come first; without one the file's own order is kept.
  const matches = counts
    ? [...matchedAll].sort((a, b) => (String(a) === 'Empty') - (String(b) === 'Empty') || (counts.get(String(b)) || 0) - (counts.get(String(a)) || 0))
    : matchedAll;
  const topCount = counts ? Math.max(1, ...matches.map((v) => counts.get(String(v)) || 0)) : 0;
  const shown = matches.slice(0, CATEGORY_RENDER_CAP);
  const toggle = (value, checked) => {
    if (disabled) return;
    const next = checked ? [...selected, value] : selected.filter((v) => v !== value);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {all.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${all.length.toLocaleString()} values`}
            aria-label="Search values"
            spellCheck={false}
            autoComplete="off"
            className={`${FIELD_CLASS} pl-8 pr-8`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear value search"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${MINI_ICON_BTN}`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between text-[12px] text-muted-foreground tabular-nums">
        <span>
          {selected.length.toLocaleString()} selected of {all.length.toLocaleString()} values
        </span>
        {selected.length > 0 && !disabled && (
          <button type="button" onClick={() => onChange([])} className="rounded-full px-2 py-0.5 font-medium text-[hsl(var(--brand-700))] outline-none transition-colors hover:bg-[hsl(var(--brand-100))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]">
            Clear selection
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-2xl border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))]">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">No values match &ldquo;{query}&rdquo;</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--wb-line))]">
            {shown.map((value) => (
              <li key={String(value)}>
                <label
                  className={`flex items-center gap-2 px-2.5 py-1.5 [@media(pointer:coarse)]:min-h-11 text-[13px] ${
                    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[hsl(var(--brand-50))]'
                  }`}
                >
                  <Checkbox
                    checked={selected.includes(value)}
                    onCheckedChange={(checked) => toggle(value, checked === true)}
                    disabled={disabled}
                    className="wb-spring-check"
                  />
                  <span className="min-w-0 flex-1 truncate" title={String(value)}>
                    {String(value) === 'Empty' ? 'Empty' : String(value)}
                  </span>
                  {counts && (
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground">
                      <span aria-hidden className="relative h-1 w-10 overflow-hidden rounded-full bg-[hsl(var(--brand-100))]">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--brand-500)/0.7)]" style={{ width: `${Math.round(((counts.get(String(value)) || 0) / topCount) * 100)}%` }} />
                      </span>
                      <span className="min-w-[1.6rem] text-right">{(counts.get(String(value)) || 0).toLocaleString()}</span>
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {matches.length > shown.length && (
        <p className="text-[12px] text-muted-foreground">
          Showing the first {CATEGORY_RENDER_CAP} of {matches.length.toLocaleString()}. Search to narrow the list.
        </p>
      )}
      {counts && caption && <p className="text-[11.5px] leading-snug text-muted-foreground">Counts from {caption}.</p>}
    </div>
  );
}

/** Inline editor for one column. Picks range, boolean or multi-select from the column's metadata. */
function ColumnFilterEditor({
  colName,
  notFilterableReason,
  range,
  filter,
  catData,
  selectedValues,
  disabled,
  hasFilter,
  onNumericChange,
  onCategoricalChange,
  onClear,
  onEnterApply = null,
  sample = null,
}) {
  const [flashKey, setFlashKey] = useState(0);
  if (notFilterableReason) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {notFilterableReason} <span className="text-muted-foreground">Still available to chat for analysis.</span>
      </p>
    );
  }

  let body = null;
  if (range) {
    const span = range.max - range.min;
    const isFrequencyColumn = /(^|_)(af|maf|freq|gnomad|1000g|all\.sites)/i.test(colName);
    const presets =
      isFrequencyColumn && range.min === 0 && range.max <= 1
        ? [
            { label: '< 0.001', min: null, max: 0.001 },
            { label: '< 0.01', min: null, max: 0.01 },
            { label: '< 0.05', min: null, max: 0.05 },
          ]
        : span > 0
          ? [
              { label: 'Bottom 10%', min: null, max: roundPreset(range.min + span * 0.1) },
              { label: 'Bottom 25%', min: null, max: roundPreset(range.min + span * 0.25) },
              { label: 'Top 25%', min: roundPreset(range.min + span * 0.75), max: null },
              { label: 'Top 10%', min: roundPreset(range.min + span * 0.9), max: null },
            ]
          : [];
    body = (
      <div className="space-y-2.5">
        {presets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onNumericChange('Min', p.min);
                  onNumericChange('Max', p.max);
                  setFlashKey((k) => k + 1);
                }}
                disabled={disabled}
                className="h-7 [@media(pointer:coarse)]:h-10 rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3 text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <NumericRangeSlider
          key={colName}
          rangeMin={range.min}
          rangeMax={range.max}
          currentMin={filter.currentMin}
          currentMax={filter.currentMax}
          disabled={disabled}
          onMinChange={(v) => onNumericChange('Min', v)}
          onMaxChange={(v) => onNumericChange('Max', v)}
          onEnterApply={onEnterApply}
          flashKey={flashKey}
          histogram={(() => {
            const values = sample?.status === 'ready' ? sample.numbers(colName) : null;
            return values ? { values, caption: sampleCaption(sample) } : null;
          })()}
        />
      </div>
    );
  } else if (catData) {
    body = (
      <CategoricalEditor
        key={colName}
        values={catData.values}
        selected={selectedValues}
        disabled={disabled}
        onChange={onCategoricalChange}
        counts={sample?.status === 'ready' ? sample.counts(colName) : null}
        caption={sampleCaption(sample)}
      />
    );
  }

  return (
    <div className="space-y-2">
      {body}
      {hasFilter && !disabled && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] [@media(pointer:coarse)]:min-h-11"
          >
            <RotateCcw className="size-3" aria-hidden />
            Clear this filter
          </button>
        </div>
      )}
    </div>
  );
}

const VariantFilterSidebar = ({
  conversationId,
  userId,
  db,
  variantData,
  currentDocument,
  onUploadSuccess,
  onFiltersChange,
  isOpen,
  onToggle,
  userTier,
  // From MongoDB conversation – keep sidebar in sync with backend/database after load or refresh
  activeVariantFiltersFromConv = null,
  filteredVariantCountFromConv = null,
  activeProprietaryFilterFromConv = null,
  filterWorkingSetCountFromConv = null,
  isRunningExomiser = false,
  exomiserStatus = null,
  fetchExomiserEligibility = null,
  runExomiser = null,
  requestedTab = null,
  onRequestedTabConsumed = null,
  acmgFilterCanApply = false,
  // Quota gates from the normalized limits: { allowed, reason, cta, meter }
  annovarGate,
  acmgExomiserGate,
  // Pipeline state owned by useVariantPipeline. The sidebar and the pipeline stepper must
  // share one busy flag so dual applies cannot race.
  isRunningAnnovar = false,
  runAnnovar = null,
  isApplyingProprietaryFilter = false,
  setIsApplyingProprietaryFilter = () => {},
  pipelineBusy = false,
  beginPipelineWork = () => {},
  refreshAfterFilterChange = null,
  downloadGate = null,
  onProprietaryFilterClick = null,
  onGuestRefreshMetadata = null,
  chatEligibility = null,
  onEditSampleInfo = null,
  // Optional: opens the upgrade / top-up / sign-up flow for a blocked ACMG or Phenotype run.
  onRequestUpgrade = null,
  onClinicalReportOpen = null,
  gaTriageStatus = '',
  gaTriageUpdatedAt = null,
}) => {
  const reduceMotion = useReducedMotion();
  /* Quota is orthogonal to filter readiness. `=== false` (rather than a falsy check) so a missing
   * gate — degraded limits, still loading — never disables anything. */
  const annovarQuotaBlocked = annovarGate?.allowed === false;
  const acmgQuotaBlocked = acmgExomiserGate?.allowed === false;
  const acmgQuotaMeter = acmgExomiserGate?.meter;
  const acmgMeterLabel = acmgQuotaMeter?.tracked && !acmgQuotaMeter.unlimited && acmgQuotaMeter.remaining != null
    ? formatAcmgPhenotypeMeterLabel(acmgQuotaMeter.remaining, acmgQuotaMeter.limit)
    : null;
  const annovarQuotaMeter = annovarGate?.meter;
  const annovarMeterLabel = annovarQuotaMeter?.tracked && !annovarQuotaMeter.unlimited && annovarQuotaMeter.remaining != null
    ? `${annovarQuotaMeter.remaining} of ${annovarQuotaMeter.limit} annotation runs left`
    : null;

  const [filters, setFilters] = useState({});
  const [categoricalFilters, setCategoricalFilters] = useState({});
  const [filteredCount, setFilteredCount] = useState(null);
  const [filterWorkingSetCount, setFilterWorkingSetCount] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [proprietaryFilterPreviews, setProprietaryFilterPreviews] = useState(null);
  const [activeProprietaryFilter, setActiveProprietaryFilter] = useState(null);
  const [filterMode, setFilterMode] = useState('manual');
  const [pendingTabSwitch, setPendingTabSwitch] = useState(null);
  const [removeFileDialogOpen, setRemoveFileDialogOpen] = useState(false);

  const handleRemoveVariantFile = async () => {
    setRemoveFileDialogOpen(false);
    try {
      await onUploadSuccess(null);
      // Clear filter state locally without hitting backend (file is already gone)
      setFilters({});
      setCategoricalFilters({});
      setAppliedFilters(null);
      setFilteredCount(null);
      setFilterWorkingSetCount(null);
      setActiveProprietaryFilter(null);
      setAppliedPresetId(null);
      notify({ message: 'File removed from conversation', type: 'success' });
    } catch (error) {
      console.error('[VariantFilterSidebar] Error removing file:', error);
    }
  };
  const [openFilterPopup, setOpenFilterPopup] = useState(null); // Column whose filter editor is expanded inline
  const [commandOpen, setCommandOpen] = useState(false); // The Add-filter command popover
  const [applyDiff, setApplyDiff] = useState(null); // { from, to, added, changed, removed } for the last manual Apply
  const [undoApplyPending, setUndoApplyPending] = useState(false); // Undo of a Reset: re-apply once the reset settles
  const rootRef = useRef(null);
  const [, narrowPanel] = usePanelWidth(520, rootRef);
  const [expandedGroups, setExpandedGroups] = useState({}); // groupName -> open (unset = default)
  const [initializedConversationId, setInitializedConversationId] = useState(null); // Prevent re-initializing filters on polling updates
  const [savedFilterPresets, setSavedFilterPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  const [gardenNameInput, setGardenNameInput] = useState('');
  const [gardenNotesInput, setGardenNotesInput] = useState('');
  const [isEditingGardenEntry, setIsEditingGardenEntry] = useState(false);
  const [gardenApplyMissingColumns, setGardenApplyMissingColumns] = useState([]);
  const [isGardenExpanded, setIsGardenExpanded] = useState(false);
  const [isGardenSaveFormOpen, setIsGardenSaveFormOpen] = useState(false);
  const [appliedPresetId, setAppliedPresetId] = useState(null);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const [exomiserEligibility, setExomiserEligibility] = useState(null);
  const [isFetchingExomiserEligibility, setIsFetchingExomiserEligibility] = useState(false);
  const proprietaryPreviewLoadedForRef = useRef(null);

  // Define isGuest early so it can be used in functions below
  const isGuest = userTier === 'guest';

  // After guest ANNOVAR, reload sidebar columns from annovar-status (needs deployed BE).
  // Callback is stored in a ref — an inline parent lambda would retrigger this every render
  // and hammer annovar-status while the sidebar is open.
  const onGuestRefreshMetadataRef = useRef(onGuestRefreshMetadata);
  onGuestRefreshMetadataRef.current = onGuestRefreshMetadata;
  useEffect(() => {
    if (!isGuest || isOpen === false || !conversationId) return;
    void onGuestRefreshMetadataRef.current?.();
  }, [isGuest, isOpen, conversationId]);
  // Manual filters can narrow the ACMG (or other) Postgres working set; proprietary apply still
  // requires manual filters to be reset first (see handleApplyProprietaryFilter).
  // Locked while any pipeline job is in flight, from either the stepper or this sidebar.
  const isManualFiltersDisabled = pipelineBusy;
  const selectedGardenEntry = useMemo(
    () => savedFilterPresets.find((p) => p.id === selectedPresetId) || null,
    [savedFilterPresets, selectedPresetId]
  );

  // Initialize filters from variant data
  useEffect(() => {
    if (variantData && conversationId) {
      // Only initialize once per conversation to avoid wiping in-progress selections on polling updates
      if (initializedConversationId !== conversationId) {
        // Initialize numeric filters - start fresh for this conversation
        if (variantData.parameter_ranges) {
          const initialFilters = {};
          for (const param in variantData.parameter_ranges) {
            const range = variantData.parameter_ranges[param];
            initialFilters[param] = {
              min: range.min,
              max: range.max,
              currentMin: null,
              currentMax: null
            };
          }
          setFilters(initialFilters);
        } else {
          setFilters({});
        }

        // Initialize categorical filters - start fresh for this conversation
        if (variantData.categorical_columns) {
          const initialCategorical = {};
          for (const param in variantData.categorical_columns) {
            initialCategorical[param] = [];
          }
          setCategoricalFilters(initialCategorical);
        } else {
          setCategoricalFilters({});
        }

        setInitializedConversationId(conversationId);
      }
    } else if (!variantData) {
      // Clear filters if variantData is null
      setFilters({});
      setCategoricalFilters({});
      setInitializedConversationId(null);
    }
  }, [variantData, conversationId, initializedConversationId]);

  // Clear all filter state when conversation changes
  useEffect(() => {
    // Reset all filter-related state when conversationId changes
    proprietaryPreviewLoadedForRef.current = null;
    setFilters({});
    setCategoricalFilters({});
    setAppliedFilters(null);
    setFilteredCount(null);
    setFilterWorkingSetCount(null);
    setActiveProprietaryFilter(null);
    setProprietaryFilterPreviews(null);
    setInitializedConversationId(null);
    setSavedFilterPresets([]);
    setSelectedPresetId('');
    setFilterMode('manual');
    setPendingTabSwitch(null);
  }, [conversationId]);

  useEffect(() => {
    if (activeProprietaryFilter === 'filter_1') setFilterMode('acmg');
    else if (activeProprietaryFilter === 'filter_3') setFilterMode('exomiser');
  }, [activeProprietaryFilter]);

  // Fetch Exomiser eligibility whenever the tab is opened or after job state changes
  useEffect(() => {
    let cancelled = false;
    if (filterMode !== 'exomiser' || !fetchExomiserEligibility) return;
    (async () => {
      setIsFetchingExomiserEligibility(true);
      const result = await fetchExomiserEligibility();
      if (!cancelled) {
        setExomiserEligibility(result);
        setIsFetchingExomiserEligibility(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filterMode, fetchExomiserEligibility, isRunningExomiser, activeProprietaryFilter]);

  // External request to switch tabs (e.g. from the File Analysis modal "Prioritize with Exomiser")
  useEffect(() => {
    if (!requestedTab) return;
    setFilterMode(requestedTab);
    onRequestedTabConsumed?.();
  }, [requestedTab, onRequestedTabConsumed]);

  // Sync sidebar state from MongoDB conversation (when parent loads conversation from backend)
  // Ensures apply/reset filter state in backend and DB is reflected in the UI after refresh or switch conversation
  useEffect(() => {
    if (!conversationId || !variantData) return;
    const hasFromConv =
      activeVariantFiltersFromConv !== undefined ||
      filteredVariantCountFromConv !== undefined ||
      activeProprietaryFilterFromConv !== undefined ||
      filterWorkingSetCountFromConv !== undefined;
    if (!hasFromConv) return;

    const activeFilters =
      activeVariantFiltersFromConv != null && Object.keys(activeVariantFiltersFromConv).length > 0
        ? activeVariantFiltersFromConv
        : null;
    setAppliedFilters(activeFilters);
    if (filteredVariantCountFromConv !== undefined && filteredVariantCountFromConv !== null) {
      setFilteredCount(filteredVariantCountFromConv);
    } else {
      setFilteredCount(null);
    }
    if (filterWorkingSetCountFromConv !== undefined && filterWorkingSetCountFromConv !== null) {
      setFilterWorkingSetCount(filterWorkingSetCountFromConv);
    } else if (!activeFilters && !activeProprietaryFilterFromConv) {
      setFilterWorkingSetCount(null);
    }
    setActiveProprietaryFilter(activeProprietaryFilterFromConv || null);

    if (activeFilters && variantData.parameter_ranges) {
      setFilters(prev => {
        const updated = { ...prev };
        for (const param in activeFilters) {
          if (param === '_numeric_logic') continue;
          const filter = activeFilters[param];
          if (variantData.parameter_ranges[param]) {
            if (!updated[param]) {
              const range = variantData.parameter_ranges[param];
              updated[param] = {
                min: range.min,
                max: range.max,
                currentMin: null,
                currentMax: null
              };
            }
            if (filter.min !== undefined || filter.max !== undefined) {
              updated[param].currentMin = filter.min != null ? filter.min : null;
              updated[param].currentMax = filter.max != null ? filter.max : null;
            }
          }
        }
        return updated;
      });
      setCategoricalFilters(prev => {
        const updated = { ...prev };
        for (const param in activeFilters) {
          if (param === '_numeric_logic') continue;
          const filter = activeFilters[param];
          if (filter.values && Array.isArray(filter.values)) {
            updated[param] = filter.values;
          }
        }
        return updated;
      });
    } else if (!activeFilters) {
      setFilters(prev => {
        const reset = { ...prev };
        for (const param in reset) {
          reset[param] = { ...reset[param], currentMin: null, currentMax: null };
        }
        return reset;
      });
      setCategoricalFilters(prev => {
        const reset = { ...prev };
        for (const param in reset) reset[param] = [];
        return reset;
      });
    }
  }, [
    conversationId,
    variantData,
    activeVariantFiltersFromConv,
    filteredVariantCountFromConv,
    activeProprietaryFilterFromConv,
    filterWorkingSetCountFromConv,
  ]);

  // Load active filters from Firestore (when db available) and proprietary filter previews from API (MongoDB)
  useEffect(() => {
    if (!conversationId || !userId || !variantData) return;

    const loadActiveFilters = async () => {
      try {
        // Firestore: only when db is passed and we don't have MongoDB-sourced state from parent
        const hasMongoState =
          activeVariantFiltersFromConv !== undefined || filteredVariantCountFromConv !== undefined;
        if (db && !hasMongoState) {
          const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : 'default-app-id';
          const conversationRef = doc(db, 'artifacts', appId, 'users', userId, 'conversations', conversationId);
          const conversationDoc = await getDoc(conversationRef);

          if (conversationDoc.exists()) {
            const data = conversationDoc.data();
            const activeFilters = data.activeVariantFilters;
            const count = data.filteredVariantCount;

            if (activeFilters) {
              setAppliedFilters(activeFilters);
              // Update filter inputs with active values - ensure filters state is initialized first
              setFilters(prevFilters => {
                const updatedFilters = { ...prevFilters };
                for (const param in activeFilters) {
                  if (param === '_numeric_logic') continue;
                  const filter = activeFilters[param];
                  if (filter.min !== undefined || filter.max !== undefined) {
                    // Numeric filter - ensure the parameter exists in filters state
                    if (!updatedFilters[param] && variantData.parameter_ranges && variantData.parameter_ranges[param]) {
                      const range = variantData.parameter_ranges[param];
                      updatedFilters[param] = {
                        min: range.min,
                        max: range.max,
                        currentMin: null,
                        currentMax: null
                      };
                    }
                    if (updatedFilters[param]) {
                      updatedFilters[param].currentMin = filter.min !== undefined && filter.min !== null ? filter.min : null;
                      updatedFilters[param].currentMax = filter.max !== undefined && filter.max !== null ? filter.max : null;
                    }
                  }
                }
                return updatedFilters;
              });

              setCategoricalFilters(prevCategorical => {
                const updatedCategorical = { ...prevCategorical };
                for (const param in activeFilters) {
                  if (param === '_numeric_logic') continue;
                  const filter = activeFilters[param];
                  if (filter.values && Array.isArray(filter.values)) {
                    // Categorical filter - ensure the parameter exists
                    updatedCategorical[param] = filter.values;
                  }
                }
                return updatedCategorical;
              });
            } else {
              // No active filters in Firestore - clear applied filters
              setAppliedFilters(null);
              // Reset filter inputs to null (but keep the filter structure from variantData)
              setFilters(prevFilters => {
                const resetFilters = { ...prevFilters };
                for (const param in resetFilters) {
                  resetFilters[param] = {
                    ...resetFilters[param],
                    currentMin: null,
                    currentMax: null
                  };
                }
                return resetFilters;
              });
              setCategoricalFilters(prevCategorical => {
                const resetCategorical = { ...prevCategorical };
                for (const param in resetCategorical) {
                  resetCategorical[param] = [];
                }
                return resetCategorical;
              });
            }

            if (count !== undefined && count !== null) {
              setFilteredCount(count);
            } else {
              setFilteredCount(null);
            }

            // Load proprietary filter state
            const activeProprietary = data.activeProprietaryFilter;
            if (activeProprietary) {
              setActiveProprietaryFilter(activeProprietary);
            } else {
              // Clear proprietary filter if not active
              setActiveProprietaryFilter(null);
            }
          }
        }

        // Load proprietary filter previews once per conversation when variant data is ready.
        if (variantData && conversationId && userId) {
          if (proprietaryPreviewLoadedForRef.current !== conversationId) {
            proprietaryPreviewLoadedForRef.current = conversationId;
            loadProprietaryFilterPreviews();
          }
        } else {
          proprietaryPreviewLoadedForRef.current = null;
          setProprietaryFilterPreviews(null);
        }
      } catch (error) {
        console.error('[VariantFilterSidebar] Error loading active filters:', error);
      }
    };

    loadActiveFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, db, userId, variantData, activeVariantFiltersFromConv, filteredVariantCountFromConv]);

  const handleFilterChange = (param, type, value) => {
    let parsed = null;
    if (value === '' || value === null || value === undefined) {
      parsed = null;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      parsed = value;
    } else {
      const n = parseFloat(value);
      parsed = Number.isFinite(n) ? n : null;
    }
    setFilters(prev => ({
      ...prev,
      [param]: {
        ...prev[param],
        [`current${type}`]: parsed
      }
    }));
  };

  const applyFilters = async () => {
    if (!conversationId || !userId) return false;
    if (pipelineBusy) return false;

    // Don't apply filters if there's no variant data
    if (!variantData || !variantData.total_variants || variantData.total_variants === 0) {
      notify({
        message: 'No variant data available. Please upload a variant file first.',
        type: 'error'
      });
      return false;
    }

    beginPipelineWork();
    setIsApplying(true);
    try {
      const token = await optionalIdToken();

      const API_URL = apiUrl('/api/filter-variants');

      const filterObject = buildFilterPayloadFromState(filters, categoricalFilters);

      console.log('[VariantFilterSidebar] Applying filters:', filterObject);
      console.log('[VariantFilterSidebar] Numeric filters state:', filters);
      console.log('[VariantFilterSidebar] Categorical filters state:', categoricalFilters);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Lets the backend verify a guest owns this conversation (guests have no token).
          'X-Device-Id': getDeviceId(),
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          filters: filterObject
        })
      });

      if (response.ok) {
        const data = await response.json();
        const fc = Number(data.filtered_count);
        const tc = Number(data.total_count);
        setFilteredCount(Number.isFinite(fc) ? fc : 0);
        if (Number.isFinite(tc) && tc > 0) {
          setFilterWorkingSetCount(tc);
        }
        setApplyDiff({ ...diffFilterPayloads(appliedFilters, filterObject), from: underConsiderationCount, to: Number.isFinite(fc) ? fc : 0 });
        setAppliedFilters(filterObject);
        // Manual Apply invalidates any previously applied preset (filters no longer match a saved entry)
        setAppliedPresetId(null);

        if (data.parameter_ranges && Object.keys(data.parameter_ranges).length > 0) {
          setFilters((prev) => mergeParameterRangesIntoFilters(prev, data.parameter_ranges));
        }

        const prevFc = filteredCount;
        const sameCount =
          prevFc !== null &&
          Number.isFinite(prevFc) &&
          Number.isFinite(fc) &&
          prevFc === fc &&
          Object.keys(filterObject).length > 0;
        const hasNumericInPayload = Object.values(filterObject).some(
          (v) => v && typeof v === 'object' && ('min' in v || 'max' in v)
        );
        if (sameCount && hasNumericInPayload && fc > 0) {
          notify({
            message:
              'Match count unchanged. If you added a numeric column, narrow its range (full span does not filter). Try a smaller min/max, then Apply again.',
            type: 'warning',
          });
        }

        if (fc === 0 && Object.keys(filterObject).length > 0) {
          notify({
            message: 'No variants match these filters. Widen numeric bounds or change categorical selections.',
            type: 'warning',
          });
        }

        // IMPORTANT: Keep filter state intact - don't clear the inputs
        // The filters state and categoricalFilters state should remain as-is
        // so users can see what they selected and modify if needed

        // Show notification message
        notify({
          message: variantData?.sample_only_ingest
            ? `Filters applied on full annotated file: ${(Number.isFinite(fc) ? fc : 0).toLocaleString()} of ${(Number.isFinite(tc) ? tc : displayTotalVariants).toLocaleString()} variants match`
            : `Filters applied: ${(Number.isFinite(fc) ? fc : 0).toLocaleString()} of ${(Number.isFinite(tc) ? tc : displayTotalVariants).toLocaleString()} variants`,
          type: fc === 0 && Object.keys(filterObject).length > 0 ? 'warning' : 'success',
        });

        // Auto-hide notification after 4 seconds

        if (onFiltersChange) {
          onFiltersChange(filterObject, data.filtered_count, data.total_count, {
            parameter_ranges: data.parameter_ranges,
            numeric_columns: data.numeric_columns,
            parameter_ranges_from_full_file: data.parameter_ranges_from_full_file,
          });
        }
        if (data.parameter_ranges_from_full_file && data.parameter_ranges) {
          notify({
            message:
              `Numeric slider bounds now reflect all ${(Number.isFinite(tc) ? tc : data.total_count || 0).toLocaleString()} rows in the annotated file. Narrow a range and Apply again if the count did not change.`,
            type: 'warning',
          });
        }
        return true;
      }
      const errorData = await response.json().catch(() => ({}));
      console.error('[VariantFilterSidebar] Filter request failed:', response.status, errorData);
      const errDetail = errorData.detail;
      const errMessage =
        (typeof errDetail === 'object' && errDetail?.message) ||
        (typeof errDetail === 'string' ? errDetail : null) ||
        'Failed to apply filters. For large files, run ACMG Filter 1 first.';
      notify({ message: errMessage, type: 'error' });
      return false;
    } catch (error) {
      console.error('[VariantFilterSidebar] Error applying filters:', error);
      return false;
    } finally {
      setIsApplying(false);
      // A manual filter that lands ≤1000 queues enrichment just like ACMG/Exomiser;
      // one that stays >1000 comes back as CHAT_TOO_MANY_VARIANTS. Runs on failure too so
      // beginPipelineWork()'s "unknown" state is always resolved.
      await refreshAfterFilterChange?.(conversationId);
    }
  };

  const resetFilters = async ({ quiet = false } = {}) => {
    if (!conversationId || !userId) return;
    if (pipelineBusy) return;
    beginPipelineWork();

    // Reset local state first
    const resetFiltersState = {};
    for (const param in filters) {
      resetFiltersState[param] = {
        ...filters[param],
        currentMin: null,
        currentMax: null
      };
    }
    setFilters(resetFiltersState);

    // Reset categorical filters
    const resetCategorical = {};
    for (const param in categoricalFilters) {
      resetCategorical[param] = [];
    }
    setCategoricalFilters(resetCategorical);

    // Clear applied filters state
    setAppliedFilters(null);
    setFilteredCount(null);
    setAppliedPresetId(null);
    setApplyDiff(null);

    // Clear proprietary filter state
    setActiveProprietaryFilter(null);

    // Clear filters in backend and Firestore
    setIsApplying(true);
    try {
      const token = await optionalIdToken();

      const API_URL = apiUrl('/api/filter-variants');

      // Send empty filters object to clear all filters
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Lets the backend verify a guest owns this conversation (guests have no token).
          'X-Device-Id': getDeviceId(),
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          filters: {} // Empty filters = show all variants
        })
      });

      if (response.ok) {
        const data = await response.json();

        // Validate response - if total_count is 0, something is wrong
        if (data.total_count === 0) {
          console.error('[VariantFilterSidebar] Reset failed: total_count is 0. Variant data may be missing.');
          // Don't update filteredCount if total is 0 - keep it null to show totalVariants instead
          setFilteredCount(null);
        } else {
          // Reset successful - filtered count should equal total count
          setFilteredCount(data.filtered_count);
        }

        // Clear applied filters
        setAppliedFilters(null);

        // Show notification (skipped when an Undo toast speaks for the reset)
        if (data.total_count > 0 && !quiet) {
          notify({
            message: `Filters reset: All ${data.total_count.toLocaleString()} variants are now under consideration`,
            type: 'success'
          });
        }
        setFilterWorkingSetCount(null);

        if (onFiltersChange) {
          onFiltersChange({}, data.filtered_count, data.total_count);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[VariantFilterSidebar] Reset request failed:', response.status, errorData);
        // Even if backend fails, we've cleared local state, so show a warning
        notify({
          message: 'Filters reset locally, but backend update may have failed. Please refresh if needed.',
          type: 'warning'
        });
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error resetting filters:', error);
      // Even if backend fails, we've cleared local state
      notify({
        message: 'Filters reset locally, but backend update failed. Please refresh if needed.',
        type: 'warning'
      });
    } finally {
      setIsApplying(false);
      // POST /api/filter-variants with `filters: {}` carries no `enrichment_will_requeue`
      // (unlike remove-proprietary-filter), so let eligibility alone decide whether we
      // wait for enrichment (≤1000) or land back on CHAT_REQUIRES_FILTER (>1000). B-FE3.
      await refreshAfterFilterChange?.(conversationId);
    }
  };

  const handleCategoricalChange = (param, value, checked) => {
    setCategoricalFilters(prev => {
      const current = prev[param] || [];
      if (checked) {
        return { ...prev, [param]: [...current, value] };
      } else {
        return { ...prev, [param]: current.filter(v => v !== value) };
      }
    });
  };

  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState(false);
  const loadSavedFilterPresets = useCallback(async () => {
    if (!userId || isGuest) return;
    setPresetsLoading(true);
    setPresetsError(false);
    try {
      const token = await optionalIdToken();
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/saved-filters`, {
        method: 'GET',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      if (!response.ok) {
        setPresetsError(true);
        return;
      }
      const data = await response.json();
      const presets = Array.isArray(data?.presets) ? data.presets : [];
      setSavedFilterPresets(presets);
      if (presets.length === 0) {
        setSelectedPresetId('');
      } else if (!presets.some((p) => p.id === selectedPresetId)) {
        setSelectedPresetId(presets[0].id);
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error loading saved filter presets:', error);
      setPresetsError(true);
    } finally {
      setPresetsLoading(false);
    }
  }, [userId, isGuest, selectedPresetId]);

  useEffect(() => {
    loadSavedFilterPresets();
  }, [loadSavedFilterPresets]);

  useEffect(() => {
    if (!selectedGardenEntry) return;
    if (!isEditingGardenEntry) {
      setGardenNameInput(selectedGardenEntry.name || '');
      setGardenNotesInput(selectedGardenEntry.notes || '');
    }
  }, [selectedGardenEntry, isEditingGardenEntry]);

  const applyFilterPayloadToInputs = useCallback((payload) => {
    const nextPayload = payload || {};
    setFilters(prev => {
      const updated = { ...prev };
      for (const param in updated) {
        updated[param] = { ...updated[param], currentMin: null, currentMax: null };
      }
      for (const param in nextPayload) {
        const spec = nextPayload[param];
        if (!spec || typeof spec !== 'object') continue;
        if ('min' in spec || 'max' in spec) {
          if (!updated[param] && variantData?.parameter_ranges?.[param]) {
            const range = variantData.parameter_ranges[param];
            updated[param] = { min: range.min, max: range.max, currentMin: null, currentMax: null };
          }
          if (updated[param]) {
            updated[param].currentMin = spec.min != null ? spec.min : null;
            updated[param].currentMax = spec.max != null ? spec.max : null;
          }
        }
      }
      return updated;
    });

    setCategoricalFilters(prev => {
      const updated = { ...prev };
      for (const param in updated) {
        updated[param] = [];
      }
      for (const param in nextPayload) {
        const spec = nextPayload[param];
        if (spec && Array.isArray(spec.values)) {
          updated[param] = spec.values;
        }
      }
      return updated;
    });
  }, [variantData]);

  const handleSaveCurrentToGarden = async () => {
    if (!conversationId || !userId || isGuest || isManualFiltersDisabled) return;
    const payload = buildFilterPayloadFromState(filters, categoricalFilters);
    const colCount = Object.keys(payload).length;
    if (colCount === 0) {
      notify({ message: 'Set at least one manual filter before saving.', type: 'warning' });
      return;
    }
    if (!gardenNameInput || !gardenNameInput.trim()) {
      notify({ message: 'Entry name is required.', type: 'warning' });
      return;
    }
    setIsSavingPreset(true);
    try {
      const token = await optionalIdToken();
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/saved-filters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          name: gardenNameInput.trim(),
          notes: (gardenNotesInput || '').trim(),
          filters: payload
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to save Filter Garden entry');
      notify({ message: `Saved: "${data.name}"`, type: 'success' });
      await loadSavedFilterPresets();
      if (data.id) setSelectedPresetId(data.id);
      setIsEditingGardenEntry(false);
    } catch (error) {
      notify({ message: error.message || 'Failed to save Filter Garden entry.', type: 'error' });
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleApplySelectedGarden = async (overrideId) => {
    const presetId = overrideId || selectedPresetId;
    if (!conversationId || !userId || !presetId || isGuest || isManualFiltersDisabled) return;
    setSelectedPresetId(presetId);
    beginPipelineWork();
    setIsApplyingPreset(true);
    try {
      const token = await optionalIdToken();
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/apply-saved-filter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          preset_id: presetId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to apply Filter Garden entry');
      if (!data.applied) {
        setGardenApplyMissingColumns(Array.isArray(data.missing_columns) ? data.missing_columns : []);
        notify({ message: 'Cannot apply — missing columns for this file.', type: 'warning' });
        return;
      }
      setGardenApplyMissingColumns([]);
      const payload = data.active_filters || {};
      applyFilterPayloadToInputs(payload);
      setApplyDiff({ ...diffFilterPayloads(appliedFilters, payload), from: underConsiderationCount, to: Number(data.filtered_count) || 0 });
      setAppliedFilters(payload);
      setFilteredCount(data.filtered_count ?? null);
      setAppliedPresetId(presetId);
      notify({ message: `${data.message || 'Applied.'} ${Number(data.filtered_count || 0).toLocaleString()} / ${Number(data.total_count || 0).toLocaleString()} variants.`, type: 'success' });
      if (onFiltersChange) {
        onFiltersChange(payload, data.filtered_count, data.total_count);
      }
    } catch (error) {
      notify({ message: error.message || 'Failed to apply Filter Garden entry.', type: 'error' });
    } finally {
      setIsApplyingPreset(false);
      // Always resolve eligibility again — beginPipelineWork() parked it at "unknown",
      // and an early return or a failure must not leave chat gated forever.
      await refreshAfterFilterChange?.(conversationId);
    }
  };

  const handleDeleteSelectedGarden = async (overrideId) => {
    const presetId = overrideId || selectedPresetId;
    if (!presetId || !userId || isGuest) return;
    if (!window.confirm('Delete this Filter Garden entry?')) return;
    try {
      const token = await optionalIdToken();
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/saved-filters/${encodeURIComponent(presetId)}`, {
        method: 'DELETE',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to delete Filter Garden entry');
      if (appliedPresetId === presetId) setAppliedPresetId(null);
      notify({ message: 'Entry deleted.', type: 'success' });
      await loadSavedFilterPresets();
    } catch (error) {
      notify({ message: error.message || 'Failed to delete Filter Garden entry.', type: 'error' });
    }
  };

  const handleStartEditSelectedGarden = () => {
    if (!selectedGardenEntry) return;
    setIsEditingGardenEntry(true);
    setGardenNameInput(selectedGardenEntry.name || '');
    setGardenNotesInput(selectedGardenEntry.notes || '');
  };

  const handleUpdateSelectedGarden = async () => {
    if (!selectedPresetId || !selectedGardenEntry) return;
    try {
      const token = await optionalIdToken();
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/saved-filters/${encodeURIComponent(selectedPresetId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          name: (gardenNameInput || '').trim(),
          notes: (gardenNotesInput || '').trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to update Filter Garden entry');
      notify({ message: `Updated: "${data.name}"`, type: 'success' });
      setIsEditingGardenEntry(false);
      await loadSavedFilterPresets();
    } catch (error) {
      notify({ message: error.message || 'Failed to update Filter Garden entry.', type: 'error' });
    }
  };

  // Delegate to the pipeline hook rather than POSTing /api/run-annovar directly, so this
  // shares the stepper's busy flag, job polling and eligibility refresh.
  const handleRunAnnovarFromGarden = async () => {
    if (!conversationId || !userId || isGuest || pipelineBusy) return;
    await runAnnovar?.();
  };

  // Load proprietary filter previews
  const loadProprietaryFilterPreviews = async () => {
    if (!conversationId || !userId) return;

    try {
      const token = await optionalIdToken();

      const base = getApiOrigin();
      const API_URL = `${base}/api/preview-proprietary-filters`;

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          conversation_id: conversationId
        })
      });

      if (response.ok) {
        const data = await response.json();
        setProprietaryFilterPreviews(data);
        console.log('[VariantFilterSidebar] Proprietary filter previews loaded:', data);
      } else {
        console.error('[VariantFilterSidebar] Failed to load filter previews:', response.status);
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error loading filter previews:', error);
    }
  };

  // Apply proprietary filter (toggle: if already active, remove it)
  const handleApplyProprietaryFilter = async (filterType) => {
    if (!conversationId || (!userId && !isGuest)) return;
    // pipelineBusy can be stuck true from a stale filter_job after remove — guest ACMG
    // re-apply goes through onProprietaryFilterClick which clears that before fetching.
    const blockedByPipelineBusy =
      pipelineBusy && !(isGuest && filterType === 'filter_1' && onProprietaryFilterClick);
    if (blockedByPipelineBusy) return;
    if (hasAppliedManualFilters && activeProprietaryFilter !== filterType) {
      notify({
        message: 'Manual filters are active. Reset manual filters before applying an annotation-stage filter.',
        type: 'warning'
      });
      return;
    }

    // If clicking the same filter that's already active, remove it
    if (activeProprietaryFilter === filterType) {
      await handleRemoveProprietaryFilter();
      return;
    }

    if (isGuest && filterType === 'filter_1' && onProprietaryFilterClick) {
      onProprietaryFilterClick('filter_1');
      return;
    }

    beginPipelineWork();
    setIsApplyingProprietaryFilter(true);
    try {
      const token = await optionalIdToken();

      const API_URL = apiUrl('/api/apply-proprietary-filter');

      const apiBase = getApiOrigin();

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          filter_type: filterType
        })
      });

      if (response.ok || response.status === 202) {
        let filteredCount = 0;
        let totalCount = null;
        if (response.status === 202) {
          const pollResult = await pollFilterJobStatus(conversationId, token, apiBase);
          filteredCount = pollResult.filtered_count ?? 0;
        } else {
          const data = await response.json();
          filteredCount = data.filtered_count ?? 0;
          totalCount = data.total_count ?? null;
        }

        setActiveProprietaryFilter(filterType);
        setFilteredCount(filteredCount);
        if (totalCount != null) {
          setFilterWorkingSetCount(totalCount);
        }

        await loadProprietaryFilterPreviews();

        notify({
          message: `${ACMG_FILTER_DISPLAY_NAME} applied: ${filteredCount.toLocaleString()} variants`,
          type: 'success'
        });

        if (onFiltersChange) {
          onFiltersChange({ proprietary: filterType }, filteredCount, totalCount);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          apiErrorDetailToMessage(errorData.detail) || 'Failed to apply filter'
        );
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error applying proprietary filter:', error);
      notify({
        message: error.message || 'Failed to apply recommended filter',
        type: 'error'
      });
    } finally {
      setIsApplyingProprietaryFilter(false);
      await refreshAfterFilterChange?.(conversationId);
    }
  };

  // Remove proprietary filter
  const handleRemoveProprietaryFilter = async () => {
    if (!conversationId || (!userId && !isGuest)) return;

    beginPipelineWork();
    setIsApplyingProprietaryFilter(true);
    // ≤1000 restores re-queue enrichment (wait for it before the "final" download);
    // >1000 returns false, so we must not wait — eligibility goes back to
    // CHAT_REQUIRES_FILTER and the annotated baseline is the final schema.
    let enrichmentWillRequeue = false;
    let restoredTotalCount = null;
    try {
      const token = await optionalIdToken();

      const API_URL = apiUrl('/api/remove-proprietary-filter');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          filter_type: activeProprietaryFilter || 'filter_1'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveProprietaryFilter(null);
        setFilteredCount(null);
        setFilterWorkingSetCount(null);

        // Reload previews to update counts
        await loadProprietaryFilterPreviews();

        // Show notification
        notify({
          message: 'Recommended filter removed',
          type: 'success'
        });

        // Notify parent
        if (onFiltersChange) {
          onFiltersChange({ proprietary: null }, data.total_count, data.total_count);
        }

        enrichmentWillRequeue = Boolean(data.enrichment_will_requeue);
        restoredTotalCount = data.total_count ?? null;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(apiErrorDetailToMessage(errorData.detail) || 'Failed to remove filter');
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error removing proprietary filter:', error);
      notify({
        message: error.message || 'Failed to remove recommended filter',
        type: 'error'
      });
    } finally {
      setIsApplyingProprietaryFilter(false);
      await refreshAfterFilterChange?.(conversationId, {
        enrichmentWillRequeue: isGuest ? false : enrichmentWillRequeue,
        totalCount: restoredTotalCount,
        clearExomiserStatus: true,
      });
    }
  };

  const pendingFilterPayload = useMemo(
    () => buildFilterPayloadFromState(filters, categoricalFilters),
    [filters, categoricalFilters]
  );

  const hasUnappliedFilterChanges = useMemo(
    () =>
      !filterPayloadsEquivalent(
        pendingFilterPayload,
        normalizeAppliedFiltersForCompare(appliedFilters)
      ),
    [pendingFilterPayload, appliedFilters]
  );

  // "Enter applies": the typed value is committed to `filters` and Apply must run on the render that
  // sees it, so the request is a counter handled in an effect instead of a direct call (a direct
  // call would send the filters from before the keystroke).
  const [applyRequest, setApplyRequest] = useState(0);
  const requestApply = useCallback(() => setApplyRequest((n) => n + 1), []);
  const handledApplyRequest = useRef(0);
  useEffect(() => {
    if (applyRequest === handledApplyRequest.current) return;
    handledApplyRequest.current = applyRequest;
    if (isApplying || pipelineBusy || !hasUnappliedFilterChanges) return;
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyRequest]);

  // Undo of a Reset restores the inputs, then re-applies as soon as the reset request has finished.
  useEffect(() => {
    if (!undoApplyPending || isApplying || pipelineBusy) return;
    setUndoApplyPending(false);
    if (hasUnappliedFilterChanges) applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoApplyPending, isApplying, pipelineBusy, hasUnappliedFilterChanges]);

  const hasAppliedManualFilters = useMemo(() => {
    const normalized = normalizeAppliedFiltersForCompare(appliedFilters);
    return Object.keys(normalized).length > 0;
  }, [appliedFilters]);

  const currentActiveFilterLabel = useMemo(() => {
    if (activeProprietaryFilter === 'filter_1') return 'ACMG filter';
    if (activeProprietaryFilter === 'filter_3') return PHENOTYPE_FILTER_DISPLAY_NAME;
    if (hasAppliedManualFilters) {
      const cols = Object.keys(normalizeAppliedFiltersForCompare(appliedFilters)).filter(k => k !== '_numeric_logic');
      if (cols.length === 0) return null;
      return `${cols.length} manual filter${cols.length > 1 ? 's' : ''} (${cols.join(', ')})`;
    }
    return null;
  }, [activeProprietaryFilter, hasAppliedManualFilters, appliedFilters]);

  const getCurrentActiveMode = useCallback(() => {
    if (activeProprietaryFilter === 'filter_1') return 'acmg';
    if (activeProprietaryFilter === 'filter_3') return 'exomiser';
    if (hasAppliedManualFilters) return 'manual';
    return null;
  }, [activeProprietaryFilter, hasAppliedManualFilters]);

  const samplePhenotypePresent = sampleHasPhenotype(currentDocument?.sample_metadata);
  const phenotypeMissing = !samplePhenotypePresent;

  const handleTabSwitch = (targetMode) => {
    if (targetMode === filterMode) return;
    // The phenotype tab stays selectable without a phenotype so its locked state and reason are visible.
    const currentMode = getCurrentActiveMode();
    if (!currentMode || targetMode === currentMode) {
      setFilterMode(targetMode);
      return;
    }
    setPendingTabSwitch(targetMode);
  };

  const confirmTabSwitch = async () => {
    const target = pendingTabSwitch;
    setPendingTabSwitch(null);
    if (!target) return;
    if (activeProprietaryFilter) {
      await handleRemoveProprietaryFilter();
    }
    if (hasAppliedManualFilters) {
      await resetFilters();
    }
    setFilterMode(target);
  };

  const cancelTabSwitch = () => {
    setPendingTabSwitch(null);
  };

  // Buttons morph idle -> running -> done from the busy flags that already exist. Done shows for
  // ~1.8s after a run that visibly worked; a failed run (outcome never appears) shows nothing.
  const { done: applyDone } = useDoneFlash(isApplying, { armed: hasUnappliedFilterChanges, ok: !hasUnappliedFilterChanges });
  const { done: acmgApplyDone, armedRun: acmgApplying } = useDoneFlash(isApplyingProprietaryFilter, {
    armed: activeProprietaryFilter == null,
    ok: activeProprietaryFilter === 'filter_1',
  });
  const exoStatusLc = (exomiserStatus?.status || '').toLowerCase();
  const exoBusyNow =
    exoStatusLc !== 'failed' && exoStatusLc !== 'error' && (isRunningExomiser || (!!exoStatusLc && exoStatusLc !== 'completed'));
  const { done: exoRunDone } = useDoneFlash(exoBusyNow, {
    armed: activeProprietaryFilter !== 'filter_3',
    ok: activeProprietaryFilter === 'filter_3',
  });
  const { done: annotateDone } = useDoneFlash(isRunningAnnovar, { armed: !acmgFilterCanApply, ok: !!acmgFilterCanApply });

  // An editor that opens below the fold scrolls just far enough to show itself (the footer is a sibling, so
  // it never covers the field).
  useEffect(() => {
    if (!openFilterPopup) return undefined;
    const t = setTimeout(() => {
      document.getElementById(`filter-col-${safeId(openFilterPopup)}`)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 260);
    return () => clearTimeout(t);
  }, [openFilterPopup, reduceMotion]);

  // A read-only sample of the variants in scope, loaded only once an editor is open (histograms and value counts).
  const sample = useVariantSample({
    conversationId,
    enabled: filterMode === 'manual' && !isGuest && (commandOpen || openFilterPopup != null),
    scopeKey: `${JSON.stringify(normalizeAppliedFiltersForCompare(appliedFilters))}|${filteredCount ?? ''}`,
  });

  // Plain content for the workspace "Variants" tab. The workspace supplies the header and close
  // button; `isOpen` / `onToggle` are still accepted so existing callers keep working, and only an
  // explicit `isOpen={false}` hides the content.
  if (isOpen === false) {
    return null;
  }

  // If no variant data, show upload prompt
  if (!variantData || (
    (!variantData.parameter_ranges || Object.keys(variantData.parameter_ranges).length === 0) &&
    (!variantData.categorical_columns || Object.keys(variantData.categorical_columns).length === 0)
  )) {
    return (
      <div className="variant-filter-sidebar flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto px-4 py-4">
        <div className="wb-card flex flex-col items-center justify-center px-6 py-10 text-center">
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]">
            <Upload className="size-5" aria-hidden />
          </span>
          <h3 className="text-base font-semibold text-foreground">No variant file yet</h3>
          <p className="mb-5 mt-1 max-w-xs text-[13px] leading-snug text-muted-foreground">
            Upload a TSV, CSV or VCF variant file to filter, review and download variants here.
          </p>
          <DocumentUpload
            conversationId={conversationId}
            userId={userId}
            onUploadSuccess={onUploadSuccess}
            existingDocument={currentDocument}
            compact={false}
            userTier={userTier}
          />
        </div>
      </div>
    );
  }

  // Extract variant data (we know variantData exists at this point)
  const allColumns = variantData.columns || []; // ALL columns from the file
  const numericColumns = variantData.numeric_columns || [];
  const categoricalColumns = variantData.categorical_columns || {};
  const ranges = variantData.parameter_ranges || {};
  const fileTotalVariants = variantData?.total_variants || 0;
  const annotatedRowBaseline =
    (variantData?.annotated_row_count != null && Number(variantData.annotated_row_count) > 0)
      ? Number(variantData.annotated_row_count)
      : (filterWorkingSetCountFromConv != null && Number(filterWorkingSetCountFromConv) > 0)
        ? Number(filterWorkingSetCountFromConv)
        : fileTotalVariants;
  const hasActiveManualFilters =
    appliedFilters && Object.keys(normalizeAppliedFiltersForCompare(appliedFilters)).length > 0;
  const displayTotalVariants =
    filterWorkingSetCount != null && (hasActiveManualFilters || activeProprietaryFilter)
      ? filterWorkingSetCount
      : annotatedRowBaseline;
  const underConsiderationCount =
    filteredCount !== null && (hasActiveManualFilters || activeProprietaryFilter)
      ? filteredCount
      : displayTotalVariants;
  const allUniqueValues = variantData.all_unique_values || {}; // ALL unique values for ALL columns (for frontend display)
  const noValidValuesColumns = variantData.no_valid_values_columns || []; // Columns where interpretation found no valid values

  // Numeric if backend listed it or there is a range (metadata skew: never show checklist for true numeric columns).
  const columnIsNumeric = (colName) =>
    numericColumns.includes(colName) || Object.prototype.hasOwnProperty.call(ranges, colName);
  const columnIsCategoricalOnly = (colName) =>
    !!categoricalColumns[colName] && !columnIsNumeric(colName);

  /** Selectable values for a categorical column; falls back to the unique-values list when the
   * categorical metadata carries none. */
  const categoricalValuesFor = (colName) => {
    const listed = categoricalColumns[colName]?.values;
    if (Array.isArray(listed) && listed.length > 0) return listed;
    return allUniqueValues[colName] || [];
  };

  /** Why a column cannot be filtered by hand, or null when it can. */
  const notFilterableReasonFor = (colName) => {
    if (noValidValuesColumns.includes(colName)) {
      return 'This column was detected but all sampled values look invalid. Manual filtering here may be meaningless.';
    }
    const allValues = allUniqueValues[colName] || [];
    if (allValues.length === 1) {
      return `This column has only one value: ${allValues[0] === 'Empty' ? 'Empty' : allValues[0]}.`;
    }
    if (columnIsNumeric(colName) && ranges[colName]) return null;
    if (columnIsCategoricalOnly(colName) && categoricalColumns[colName] && categoricalValuesFor(colName).length > 0) return null;
    if (allValues.length === 0) return 'No values found for this column.';
    return 'Mixed or non-standard format, so it cannot be filtered here.';
  };

  // ---- Filter state, as shown to the user ----
  const appliedNormalized = normalizeAppliedFiltersForCompare(appliedFilters);
  const filterChips = Object.entries(pendingFilterPayload)
    .map(([col, spec]) => {
      const isApplied =
        !!appliedNormalized[col] &&
        filterPayloadsEquivalent({ [col]: spec }, { [col]: appliedNormalized[col] });
      return { col, label: describeFilterSpec(spec), pending: !isApplied };
    })
    .filter((chip) => chip.label);
  const proprietaryChipLabel =
    activeProprietaryFilter === 'filter_1'
      ? ACMG_FILTER_DISPLAY_NAME
      : activeProprietaryFilter === 'filter_3'
        ? PHENOTYPE_FILTER_DISPLAY_NAME
        : null;
  const hasAnyChip = filterChips.length > 0 || !!proprietaryChipLabel;
  const unappliedCount =
    filterChips.filter((c) => c.pending).length +
    Object.keys(appliedNormalized).filter((k) => !(k in pendingFilterPayload)).length;
  const filteredOutCount = Math.max(0, displayTotalVariants - underConsiderationCount);

  /** Chip X and "Clear this filter": clear one column's draft, with an Undo that puts back exactly what it held. */
  const removeColumnFilter = (colName) => {
    const prevNumeric = filters[colName] ? { currentMin: filters[colName].currentMin ?? null, currentMax: filters[colName].currentMax ?? null } : null;
    const prevValues = categoricalFilters[colName] ? [...categoricalFilters[colName]] : null;
    clearColumnFilter(colName);
    undoToast('Filter removed', () => {
      if (prevNumeric) {
        setFilters((prev) => (prev[colName] ? { ...prev, [colName]: { ...prev[colName], ...prevNumeric } } : prev));
      }
      if (prevValues) {
        setCategoricalFilters((prev) => ({ ...prev, [colName]: prevValues }));
      }
    });
  };
  const clearColumnFilter = (colName) => {
    if (filters[colName]) {
      setFilters((prev) => ({
        ...prev,
        [colName]: { ...prev[colName], currentMin: null, currentMax: null },
      }));
    }
    if (categoricalFilters[colName]) {
      setCategoricalFilters((prev) => ({ ...prev, [colName]: [] }));
    }
  };
  const setCategoricalSelection = (colName, values) => {
    setCategoricalFilters((prev) => ({ ...prev, [colName]: values }));
  };
  /** Reset with an Undo when the filters were manual only: Undo puts every filter back and applies it again. */
  const resetWithUndo = () => {
    const manualOnly = hasAppliedManualFilters && !activeProprietaryFilter;
    const snapshot = manualOnly ? { ...pendingFilterPayload } : null;
    const before = underConsiderationCount;
    const hasUndo = !!snapshot && Object.keys(snapshot).length > 0;
    resetFilters({ quiet: hasUndo });
    if (hasUndo) {
      undoToast(`Filters reset, all ${displayTotalVariants.toLocaleString()} variants back in scope (was ${before.toLocaleString()}).`, () => {
        applyFilterPayloadToInputs(snapshot);
        setUndoApplyPending(true);
      });
    }
  };
  const clearAllFilters = () => {
    if (hasAppliedManualFilters || activeProprietaryFilter) {
      // Applied filters are reset on the server; Undo re-applies them as a new apply.
      resetWithUndo();
      return;
    }
    // Draft-only: every selection is local, so Undo can restore all of them.
    const prevNumeric = {};
    for (const param in filters) prevNumeric[param] = { currentMin: filters[param].currentMin ?? null, currentMax: filters[param].currentMax ?? null };
    const prevCategorical = {};
    for (const param in categoricalFilters) prevCategorical[param] = [...(categoricalFilters[param] || [])];
    if (Object.keys(pendingFilterPayload).length > 0) {
      undoToast('Filters cleared', () => {
        setFilters((prev) => {
          const next = { ...prev };
          for (const param in prevNumeric) if (next[param]) next[param] = { ...next[param], ...prevNumeric[param] };
          return next;
        });
        setCategoricalFilters((prev) => ({ ...prev, ...prevCategorical }));
      });
    }
    setFilters((prev) => {
      const next = { ...prev };
      for (const param in next) next[param] = { ...next[param], currentMin: null, currentMax: null };
      return next;
    });
    setCategoricalFilters((prev) => {
      const next = { ...prev };
      for (const param in next) next[param] = [];
      return next;
    });
  };
  const removeProprietaryChip = () => {
    if (isApplyingProprietaryFilter || pipelineBusy) return;
    handleRemoveProprietaryFilter();
  };

  // ---- Phenotype (Exomiser) readiness ----
  const exoIsActive = activeProprietaryFilter === 'filter_3';
  const exoCanRun = exomiserEligibility?.can_run === true;
  const exoReasons = exomiserEligibility?.reasons || [];
  const exoStatusText = (exomiserStatus?.status || '').toLowerCase();
  const exoFailed = exoStatusText === 'failed' || exoStatusText === 'error';
  const exoRunning = !exoFailed && (isRunningExomiser || (exoStatusText && exoStatusText !== 'completed'));
  const exoRawFailure = exomiserStatus?.error || exomiserStatus?.message || '';
  const exoFailureDetail = exoFailed
    ? (/no valid hpo/i.test(exoRawFailure)
        ? 'Could not derive valid HPO terms from the phenotype description. Edit the sample metadata with a clearer clinical phenotype (specific symptoms or HPO terms), then retry.'
        : sanitizePhenotypeStatusMessage(exoRawFailure, PHENOTYPE_FAILED_FALLBACK))
    : null;
  const exoRunningMessage = sanitizePhenotypeStatusMessage(
    exomiserStatus?.message,
    PHENOTYPE_STARTING_MESSAGE,
  );

  // ---- Mode readiness: one plain status line per mode ----
  const manualFilterCount = Object.keys(appliedNormalized).length;
  let modeBlurb;
  let modeStatus;
  if (filterMode === 'manual') {
    modeBlurb = 'Set filters by column, then press Apply.';
    modeStatus = isManualFiltersDisabled
      ? { tone: 'warning', word: 'Locked', detail: 'A pipeline job is running. Filters unlock when it finishes.' }
      : manualFilterCount > 0
        ? { tone: 'success', word: 'Active', detail: `${manualFilterCount} column filter${manualFilterCount === 1 ? '' : 's'} applied.` }
        : { tone: 'muted', word: 'Ready', detail: 'No filters applied yet.' };
  } else if (filterMode === 'acmg') {
    modeBlurb = PROPRIETARY_FILTER_1_DESCRIPTION;
    modeStatus =
      activeProprietaryFilter === 'filter_1'
        ? { tone: 'success', word: 'Active', detail: 'Showing variants that pass the ACMG filter.' }
        : acmgQuotaBlocked
          ? { tone: 'error', word: 'Unavailable', detail: acmgExomiserGate.reason }
          : !acmgFilterCanApply
            ? { tone: 'warning', word: 'Needs annotation', detail: 'Run annotation first, then apply this filter.' }
            : hasAppliedManualFilters
              ? { tone: 'warning', word: 'Blocked', detail: 'Manual filters are active. Reset them first.' }
              : { tone: 'muted', word: 'Ready', detail: acmgMeterLabel || 'Not applied yet.' };
  } else {
    modeBlurb = PHENOTYPE_FILTER_DESCRIPTION;
    modeStatus = exoIsActive
      ? { tone: 'success', word: 'Active', detail: 'Variants are ranked against the phenotype.' }
      : phenotypeMissing
        ? { tone: 'muted', word: 'Locked', detail: 'Needs a phenotype description. Everything else runs without one.' }
        : exoRunning
          ? { tone: 'info', word: 'Running', detail: 'This can take several minutes. You can leave this tab open.', pulse: true }
          : exoFailed
            ? { tone: 'error', word: 'Failed', detail: PHENOTYPE_FAILED_TITLE }
            : acmgQuotaBlocked
              ? { tone: 'error', word: 'Unavailable', detail: acmgExomiserGate.reason }
              : !exoCanRun && exoReasons.length > 0
                ? { tone: 'warning', word: 'Not ready', detail: 'See what is missing below.' }
                : isFetchingExomiserEligibility && !exomiserEligibility
                  ? { tone: 'muted', word: 'Checking', detail: 'Checking eligibility…' }
                  : { tone: 'muted', word: 'Ready', detail: acmgMeterLabel || 'Not run yet.' };
  }

  // ---- Column groups (a single unknown "Other" bucket is split by data type) ----
  const columnGroups = (() => {
    const base = groupColumns(allColumns);
    const out = [];
    for (const [groupName, cols] of base) {
      if (groupName === OTHER_GROUP && cols.length > 8) {
        const numeric = cols.filter((c) => !notFilterableReasonFor(c) && columnIsNumeric(c));
        const categorical = cols.filter((c) => !notFilterableReasonFor(c) && !columnIsNumeric(c));
        const rest = cols.filter((c) => notFilterableReasonFor(c));
        if (numeric.length) out.push(['Numeric columns', numeric]);
        if (categorical.length) out.push(['Categorical columns', categorical]);
        if (rest.length) out.push(['Not filterable', rest]);
      } else {
        out.push([groupName, cols]);
      }
    }
    return out;
  })();
  const groupOfColumn = {};
  for (const [groupName, cols] of columnGroups) {
    for (const c of cols) groupOfColumn[c] = groupName;
  }
  const columnQuery = columnSearchQuery.trim().toLowerCase();
  const searchMatches = columnQuery
    ? allColumns.filter((c) => c.toLowerCase().includes(columnQuery))
    : null;

  /** The column's type for glyphs: number, category, or a yes/no value. */
  const columnKindOf = (colName) => {
    if (columnIsNumeric(colName)) return 'number';
    const vals = categoricalValuesFor(colName).map(String).filter((v) => v !== 'Empty');
    if (vals.length > 0 && vals.length <= 2 && vals.every((v) => BOOLISH.test(v))) return 'boolean';
    return 'category';
  };
  const columnHintOf = (colName) => {
    const rowRange = columnIsNumeric(colName) ? ranges[colName] : null;
    if (rowRange) return `${formatBound(rowRange.min)} to ${formatBound(rowRange.max)}`;
    if (categoricalColumns[colName] && categoricalValuesFor(colName).length > 0) return `${categoricalValuesFor(colName).length.toLocaleString()} values`;
    return null;
  };

  /** The value editor for one column, shared by the catalog rows and the Add-filter popover. */
  const renderEditor = (colName) => {
    const spec = pendingFilterPayload[colName];
    const summary = describeFilterSpec(spec);
    const reason = notFilterableReasonFor(colName);
    const loadingSample = sample.status === 'loading' && columnIsNumeric(colName) && !reason;
    return (
      <>
        {loadingSample && <div aria-hidden className="wb-shimmer mb-2 h-10 w-full rounded-lg" />}
        <ColumnFilterEditor
          colName={colName}
          notFilterableReason={reason}
          range={columnIsNumeric(colName) ? ranges[colName] : null}
          filter={filters[colName] || {}}
          catData={categoricalColumns[colName] ? { ...categoricalColumns[colName], values: categoricalValuesFor(colName) } : undefined}
          selectedValues={categoricalFilters[colName] || []}
          disabled={isManualFiltersDisabled}
          hasFilter={!!summary}
          onNumericChange={(type, value) => handleFilterChange(colName, type, value)}
          onCategoricalChange={(values) => setCategoricalSelection(colName, values)}
          onClear={() => removeColumnFilter(colName)}
          onEnterApply={requestApply}
          sample={sample}
        />
      </>
    );
  };

  /** Set one column's draft from a typed condition such as `qual > 100`. */
  const quickSetFilter = (colName, spec) => {
    if (spec.values) {
      setCategoricalSelection(colName, spec.values);
      return;
    }
    if ('min' in spec) handleFilterChange(colName, 'Min', spec.min);
    if ('max' in spec) handleFilterChange(colName, 'Max', spec.max);
  };

  const renderColumnRow = (colName, { showGroup = false } = {}) => {
    const spec = pendingFilterPayload[colName];
    const summary = describeFilterSpec(spec);
    const isPending = !!summary && !(
      appliedNormalized[colName] &&
      filterPayloadsEquivalent({ [colName]: spec }, { [colName]: appliedNormalized[colName] })
    );
    const reason = notFilterableReasonFor(colName);
    const isExpanded = openFilterPopup === colName;
    const rowRange = columnIsNumeric(colName) ? ranges[colName] : null;
    const rowHint = reason ? null : columnHintOf(colName);
    // Where the chosen span sits inside the data range, as a tiny track (numeric filters only).
    const trackSpan = rowRange && spec && ('min' in spec || 'max' in spec) && rowRange.max > rowRange.min
      ? {
          l: Math.max(0, Math.min(100, (((spec.min ?? rowRange.min) - rowRange.min) / (rowRange.max - rowRange.min)) * 100)),
          r: Math.max(0, Math.min(100, (((spec.max ?? rowRange.max) - rowRange.min) / (rowRange.max - rowRange.min)) * 100)),
        }
      : null;
    return (
      <div key={colName} id={`filter-row-${safeId(colName)}`}>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`filter-col-${safeId(colName)}`}
          onClick={() => setOpenFilterPopup(isExpanded ? null : colName)}
          className={`group/row relative flex min-h-9 w-full items-center gap-2 rounded-full border px-3 py-1 text-left text-[13px] outline-none transition-colors [@media(pointer:coarse)]:min-h-11 ${
            isExpanded
              ? 'border-[hsl(var(--brand-200))]'
              : 'border-transparent hover:border-[hsl(var(--brand-200))] hover:bg-[hsl(var(--brand-50))]'
          }`}
        >
          {/* Only one editor is open at a time, so one tint glides to whichever row is open. */}
          {isExpanded && <SelectionMarker group="filter-row" bar={false} />}
          {reason
            ? <span aria-hidden className="relative inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/60"><Lock className="size-3" /></span>
            : <KindGlyph kind={columnKindOf(colName)} className={`relative ${summary ? 'text-[hsl(var(--brand-700))]' : 'text-muted-foreground'}`} />}
          <span className="relative min-w-0 flex-1">
            <span className={`block truncate ${reason ? 'text-muted-foreground' : 'text-foreground'} ${summary || isExpanded ? 'font-medium' : ''}`}>{colName}</span>
            {showGroup && groupOfColumn[colName] && (
              <span className="block truncate text-[12px] text-muted-foreground">{groupOfColumn[colName]}</span>
            )}
          </span>
          {summary ? (
            <span
              className={`relative inline-flex h-6 max-w-[9rem] shrink-0 items-center truncate rounded-full border px-2.5 text-[12px] font-medium tabular-nums ${
                isPending
                  ? 'border-dashed border-[var(--warning)] bg-[hsl(var(--wb-card))] text-foreground'
                  : 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
              }`}
              title={isPending ? `${summary} (not applied yet)` : summary}
            >
              {summary}
            </span>
          ) : reason ? (
            <span className="relative shrink-0 text-[12px] text-muted-foreground">Not filterable</span>
          ) : rowHint ? (
            <span className="relative shrink-0 text-[12px] tabular-nums text-muted-foreground">{rowHint}</span>
          ) : null}
          {trackSpan && !isExpanded ? (
            <span aria-hidden className="relative -ml-1 h-1 w-9 shrink-0 overflow-hidden rounded-full bg-[hsl(var(--brand-200))]">
              <span className="absolute inset-y-0 rounded-full bg-[hsl(var(--brand-500))]" style={{ left: `${trackSpan.l}%`, width: `${Math.max(6, trackSpan.r - trackSpan.l)}%` }} />
            </span>
          ) : null}
          <Turn open={isExpanded} className="relative shrink-0">
            <ChevronRight className={`wb-chev size-3.5 text-muted-foreground ${isExpanded ? '' : 'group-hover/row:translate-x-0.5 group-hover/row:text-[hsl(var(--brand-700))]'}`} aria-hidden />
          </Turn>
        </button>
        <Collapse open={isExpanded} id={`filter-col-${safeId(colName)}`}>
          <div className="mx-1 mb-1.5 mt-1 rounded-2xl border border-[hsl(var(--brand-100))] bg-[hsl(var(--brand-50))] p-3">
            {renderEditor(colName)}
          </div>
        </Collapse>
      </div>
    );
  };

  const selectedPreset = savedFilterPresets.find((p) => p.id === appliedPresetId) || null;
  const canSavePreset = hasAppliedManualFilters || Object.keys(pendingFilterPayload).length > 0;

  const TABS = [
    { key: 'manual', label: 'Manual', filterKey: null, badge: manualFilterCount > 0 ? String(manualFilterCount) : null, badgeLabel: `${manualFilterCount} applied` },
    { key: 'acmg', label: 'ACMG', filterKey: 'filter_1', badge: activeProprietaryFilter === 'filter_1' ? 'On' : null, badgeLabel: 'active' },
    { key: 'exomiser', label: PHENOTYPE_FILTER_DISPLAY_NAME, filterKey: 'filter_3', usePhenotypeAi: true, locked: phenotypeMissing, badge: exoIsActive ? 'On' : null, badgeLabel: 'active' },
  ];
  const activeTabIndex = TABS.findIndex((t) => t.key === filterMode);
  const focusTab = (i) => {
    const el = document.getElementById(`filter-tab-${TABS[i].key}`);
    if (el) el.focus();
  };
  // Roving focus steps from the tab that has focus, not from the selected one, so repeated arrow
  // presses keep moving.
  const focusedTabIndex = () => {
    const i = TABS.findIndex((t) => document.activeElement?.id === `filter-tab-${t.key}`);
    return i >= 0 ? i : activeTabIndex;
  };
  const onTablistKeyDown = (e) => {
    const cur = focusedTabIndex();
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusTab((cur + 1) % TABS.length);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusTab((cur - 1 + TABS.length) % TABS.length);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(TABS.length - 1);
        break;
      default:
    }
  };

  const ringBrand = 'focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]';
  const pillBtn = 'h-8 [@media(pointer:coarse)]:h-11 text-[13px]';
  const canRunAnnotation = !isGuest && typeof runAnnovar === 'function';
  const annotateState = isRunningAnnovar ? 'running' : annotateDone ? 'done' : 'idle';
  const runAnnotationButton = canRunAnnotation ? (
    <StateButton
      state={annotateState}
      labels={{ idle: 'Run annotation', running: 'Running annotation…', done: 'Annotated' }}
      icon={Tags}
      variant="outline"
      size="sm"
      onClick={handleRunAnnovarFromGarden}
      disabled={annovarQuotaBlocked || pipelineBusy}
      className={`${pillBtn} ${annotateState !== 'idle' ? 'disabled:opacity-100' : ''}`}
    />
  ) : null;

  // A blocked ACMG / Phenotype run on this plan: offer the upgrade, when the host gave us a handler.
  const upgradeAction =
    acmgQuotaBlocked && acmgExomiserGate?.cta && typeof onRequestUpgrade === 'function'
      ? { label: acmgExomiserGate.cta.label || 'Upgrade', onClick: () => onRequestUpgrade(acmgExomiserGate.cta.kind) }
      : null;

  // Where a blocked Phenotype reason can be fixed in one click, when the host gave us a handler.
  const reasonAction = (reason) => {
    if (reason === 'annovar_required') return runAnnotationButton;
    if ((reason === 'phenotype_required' || reason === 'hpo_selection_required') && onEditSampleInfo) {
      return (
        <Button type="button" variant="outline" size="sm" onClick={onEditSampleInfo} className={pillBtn}>
          <PencilLine aria-hidden />
          Edit sample info
        </Button>
      );
    }
    if (reason === 'manual_filter_active' || reason === 'manual_filters_active') {
      return (
        <Button type="button" variant="outline" size="sm" onClick={resetFilters} disabled={isApplying} className={pillBtn}>
          <RotateCcw aria-hidden />
          Reset manual filters
        </Button>
      );
    }
    if (reason === 'proprietary_filter_active') {
      return (
        <Button type="button" variant="outline" size="sm" onClick={handleRemoveProprietaryFilter} disabled={isApplyingProprietaryFilter || pipelineBusy} className={pillBtn}>
          <X aria-hidden />
          Remove active filter
        </Button>
      );
    }
    return null;
  };

  const scopePct = displayTotalVariants > 0
    ? Math.max(0, Math.min(100, (underConsiderationCount / displayTotalVariants) * 100))
    : 0;

  /** Mode-specific primary action for the sticky footer. */
  const renderPrimaryAction = () => {
    // A finished run keeps `disabled:opacity-100` so the check does not look greyed out.
    const settled = (state) => (state !== 'idle' ? 'disabled:opacity-100' : '');
    if (filterMode === 'manual') {
      const state = isApplying ? 'running' : applyDone ? 'done' : 'idle';
      return (
        <StateButton
          state={state}
          labels={{ idle: applyLabel, running: 'Applying…', done: 'Applied' }}
          icon={ListFilter}
          onClick={applyFilters}
          title="Apply filters (Ctrl or Cmd + Enter)"
          disabled={isManualFiltersDisabled || !hasUnappliedFilterChanges}
          aria-describedby="filter-apply-status"
          className={`h-9 flex-1 [@media(pointer:coarse)]:h-11 ${settled(state)}`}
        />
      );
    }
    // A blocked plan: the way forward is the upgrade, when the host gave us a handler.
    if ((filterMode === 'acmg' || filterMode === 'exomiser') && acmgQuotaBlocked && upgradeAction && !(filterMode === 'acmg' ? activeProprietaryFilter === 'filter_1' : exoIsActive)) {
      return (
        <Button type="button" onClick={upgradeAction.onClick} aria-describedby="filter-apply-status" className="h-9 flex-1 [@media(pointer:coarse)]:h-11">
          {upgradeAction.label}
        </Button>
      );
    }
    // Locked Phenotype: the primary action is the one that unlocks it, not a dead Run button.
    if (filterMode === 'exomiser' && phenotypeMissing && onEditSampleInfo && !exoIsActive) {
      return (
        <Button type="button" onClick={onEditSampleInfo} aria-describedby="filter-apply-status" className="h-9 flex-1 [@media(pointer:coarse)]:h-11">
          <PencilLine aria-hidden />
          Add a phenotype
        </Button>
      );
    }
    if (filterMode === 'acmg') {
      // For a moment after a successful apply the primary pill shows the check, then becomes Remove.
      // `acmgApplying`: the apply is still finishing (the filter is set, previews are loading), so it must
      // not read as "Removing…".
      return activeProprietaryFilter === 'filter_1' && !acmgApplyDone && !acmgApplying ? (
        <StateButton
          state={isApplyingProprietaryFilter ? 'running' : 'idle'}
          labels={{ idle: 'Remove ACMG filter', running: 'Removing…' }}
          icon={X}
          variant="outline"
          onClick={() => handleApplyProprietaryFilter('filter_1')}
          aria-describedby="filter-apply-status"
          className={`h-9 flex-1 !text-[var(--error)] [@media(pointer:coarse)]:h-11 ${settled(isApplyingProprietaryFilter ? 'running' : 'idle')}`}
        />
      ) : (
        <StateButton
          state={isApplyingProprietaryFilter ? 'running' : acmgApplyDone ? 'done' : 'idle'}
          labels={{ idle: 'Apply ACMG filter', running: 'Applying…', done: 'Applied' }}
          icon={ListFilter}
          onClick={() => handleApplyProprietaryFilter('filter_1')}
          disabled={!acmgFilterCanApply || acmgApplyDone}
          aria-describedby="filter-apply-status"
          className={`h-9 flex-1 [@media(pointer:coarse)]:h-11 ${settled(isApplyingProprietaryFilter ? 'running' : acmgApplyDone ? 'done' : 'idle')}`}
        />
      );
    }
    return exoIsActive && !exoRunDone ? (
      <StateButton
        state={isApplyingProprietaryFilter ? 'running' : 'idle'}
        labels={{ idle: `Remove ${PHENOTYPE_FILTER_DISPLAY_NAME}`, running: 'Removing…' }}
        icon={X}
        variant="outline"
        onClick={() => handleApplyProprietaryFilter('filter_3')}
        aria-describedby="filter-apply-status"
        className={`h-9 flex-1 !text-[var(--error)] [@media(pointer:coarse)]:h-11 ${settled(isApplyingProprietaryFilter ? 'running' : 'idle')}`}
      />
    ) : (
      <StateButton
        state={exoRunning ? 'running' : exoRunDone ? 'done' : 'idle'}
        labels={{
          idle: exoFailed ? <>Retry <PhenotypeAiLabel variant="inline" /></> : <>Run <PhenotypeAiLabel variant="inline" /></>,
          running: 'Running…',
          done: 'Done',
        }}
        icon={Play}
        onClick={() => runExomiser && runExomiser()}
        disabled={exoRunDone || phenotypeMissing || !exoCanRun || !runExomiser || acmgQuotaBlocked}
        aria-describedby="filter-apply-status"
        className={`h-9 flex-1 [@media(pointer:coarse)]:h-11 ${settled(exoRunning ? 'running' : exoRunDone ? 'done' : 'idle')}`}
      />
    );
  };

  /** The one short line under the count in the footer: what the primary button will do, or why it is off. */
  const footerStatus = (() => {
    if (filterMode === 'manual') {
      if (isManualFiltersDisabled) return { tone: 'warning', text: 'Apply is off while a pipeline job runs.' };
      if (hasUnappliedFilterChanges) {
        return {
          tone: 'warning',
          text: `${unappliedCount > 0 ? `${unappliedCount} unapplied change${unappliedCount === 1 ? '' : 's'}` : 'Unapplied changes'}. Press Apply to update the count.`,
        };
      }
      if (hasAppliedManualFilters) return { tone: 'success', text: 'Filters applied. Change a filter to enable Apply.' };
      return { tone: 'muted', text: 'Choose a column filter to enable Apply.' };
    }
    if (modeStatus.word === 'Active') return { tone: 'success', text: 'Applied. Remove it to see all variants again.' };
    if (modeStatus.word === 'Running') return { tone: 'info', text: 'Running. The count updates when it finishes.', pulse: true };
    if (modeStatus.word === 'Ready') return { tone: 'muted', text: 'Ready. Apply it to update the count.' };
    if (modeStatus.word === 'Checking') return { tone: 'muted', text: 'Checking eligibility…' };
    if (filterMode === 'exomiser' && phenotypeMissing) return { tone: 'muted', text: 'Add a phenotype in sample info to run this.' };
    if (filterMode === 'acmg') return { tone: modeStatus.tone, text: `${modeStatus.word}. See what is needed above.` };
    return { tone: modeStatus.tone, text: `${modeStatus.word}. See the note above.` };
  })();

  const footerQuiet = footerStatus.tone === 'muted' || footerStatus.tone === 'success';

  // ---- The pinned filter bar: pieces that depend on this render's state ----
  const barInfo = (
    variantData?.sample_only_ingest && (
      <Popover>
        <PopoverTrigger
          className="wb-iconbtn outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] [@media(pointer:coarse)]:size-11"
          aria-label="About this file"
        >
          <Info className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={6}
          className="w-72 p-3 text-xs leading-relaxed text-muted-foreground"
        >
          {variantData.s3_line_count_status === 'pending' || variantData.s3_line_count_status === 'running' ? (
            <>
              Counting all variant rows in your file on the server (very large files can take several minutes).
              Column mapping already used the first {variantData.interpretation_sample_rows || 50} rows.
            </>
          ) : annotatedRowBaseline > 0 ? (
            variantData?.annotated_row_count || variantData?.sample_only_ingest ? (
              <>
                Annotated variant file ({annotatedRowBaseline.toLocaleString()} rows). Each Apply re-scans this full annotated file on S3 (all active filters combined). Uploaded VCF may list more rows before annotation.
              </>
            ) : (
              <>
                Full file on cloud storage ({annotatedRowBaseline.toLocaleString()} data rows). Column mapping used the first {variantData.interpretation_sample_rows || 50} rows only and is not loaded into the database yet. Run annotation, then apply the ACMG filter (or apply filters once) to load a working set. Use Clear all to remove filters and start over from the full file.
              </>
            )
          ) : (
            <>
              Full file on cloud storage. Column mapping used the first {variantData.interpretation_sample_rows || 50} rows only. Run annotation, then apply the ACMG filter. Use Clear all to reload the full file row count.
            </>
          )}
        </PopoverContent>
      </Popover>
    )
  );
  const barWarning = (
    <Dismissible
      show={
        !!hasActiveManualFilters &&
        filterWorkingSetCount != null &&
        filteredCount === 1 &&
        filterWorkingSetCount === 1 &&
        fileTotalVariants > 100
      }
    >
      <div className="mt-3">
        <InlineNotice tone="warning" title="Only 1 variant is loaded" role="status">
          Press Reset, then apply ACMG or your first filter again to reload a larger working set.
        </InlineNotice>
      </div>
    </Dismissible>
  );
  const barNotice =
    chatEligibility?.allowed !== true && chatEligibility?.message ? (
      <p
        id="variant-eligibility-note"
        className="wb-rise mt-3 flex items-start gap-2 border-t border-[hsl(var(--wb-line))] pt-2.5 text-[12px] leading-snug text-muted-foreground"
      >
        <Info aria-hidden className="mt-px size-3.5 shrink-0 text-[var(--info)]" />
        <span>{chatEligibility.message}</span>
      </p>
    ) : null;
  const barChips = filterChips.map((chip) => ({ ...chip, kind: columnKindOf(chip.col) }));
  // Columns the Add-filter command can offer: only those that can be filtered by hand.
  const commandColumns = columnGroups.flatMap(([group, cols]) =>
    cols
      .filter((c) => !notFilterableReasonFor(c))
      .map((c) => ({
        name: c,
        group,
        kind: columnKindOf(c),
        hint: columnHintOf(c),
        active: !!pendingFilterPayload[c],
        values: columnIsNumeric(c) ? null : categoricalValuesFor(c),
      }))
  );
  const editFilterFromChip = (col) => {
    if (filterMode !== 'manual') return;
    setColumnSearchQuery('');
    const g = groupOfColumn[col];
    if (g) setExpandedGroups((prev) => ({ ...prev, [g]: true }));
    setOpenFilterPopup(col);
  };
  const applyPhase = isApplying ? 'applying' : hasUnappliedFilterChanges ? 'dirty' : applyDiff || hasAppliedManualFilters ? 'applied' : 'clean';
  const pendingDiff = diffFilterPayloads(appliedFilters, pendingFilterPayload);
  const applyLabel = unappliedCount > 0 ? `Apply ${unappliedCount} change${unappliedCount === 1 ? '' : 's'}` : 'Apply';
  const onRootKeyDown = (e) => {
    if (e.defaultPrevented || filterMode !== 'manual') return;
    const t = e.target;
    const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || t?.isContentEditable;
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !isManualFiltersDisabled && allColumns.length > 0) {
      e.preventDefault();
      setCommandOpen(true);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && hasUnappliedFilterChanges && !isApplying && !isManualFiltersDisabled) {
      e.preventDefault();
      applyFilters();
    }
  };

  return (
    <div ref={rootRef} onKeyDown={onRootKeyDown} className="variant-filter-sidebar group/tab flex h-full min-h-0 w-full min-w-0 flex-col text-foreground [&_input::placeholder]:!text-muted-foreground [&_textarea::placeholder]:!text-muted-foreground">
      {/* Confirmation dialogs (short, focused) */}
      <AlertDialog open={removeFileDialogOpen} onOpenChange={setRemoveFileDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this variant file?</AlertDialogTitle>
            <AlertDialogDescription>
              All filters and variant data for this conversation will be cleared. You&apos;ll need to upload the file again to run analysis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep file</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemoveVariantFile}>
              Remove file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingTabSwitch} onOpenChange={(open) => { if (!open) cancelTabSwitch(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to {pendingTabSwitch === 'manual' ? 'Manual' : pendingTabSwitch === 'acmg' ? 'ACMG' : PHENOTYPE_FILTER_DISPLAY_NAME} filters?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your current {getCurrentActiveMode() === 'manual' ? 'manual filters' : getCurrentActiveMode() === 'acmg' ? 'ACMG filter' : 'phenotype prioritization'} will be cleared. You can re-apply after switching.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelTabSwitch}>Keep current filter</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTabSwitch}>
              Switch to {pendingTabSwitch === 'manual' ? 'Manual' : pendingTabSwitch === 'acmg' ? 'ACMG' : PHENOTYPE_FILTER_DISPLAY_NAME}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------- Pinned filter bar: count, active filters, Add filter, saved filters ---------------- */}
      {fileTotalVariants > 0 && (
        <div className="max-h-[46%] shrink-0 overflow-y-auto overscroll-contain px-4 pb-1 pt-3">
          <FilterBar
            scopeCount={underConsiderationCount}
            totalCount={displayTotalVariants}
            filteredOut={filteredOutCount}
            scopePct={scopePct}
            chips={barChips}
            proprietaryLabel={proprietaryChipLabel}
            onEditChip={editFilterFromChip}
            onRemoveChip={removeColumnFilter}
            onRemoveProprietary={removeProprietaryChip}
            removeDisabled={isManualFiltersDisabled}
            proprietaryDisabled={isApplyingProprietaryFilter || pipelineBusy}
            onResetAll={clearAllFilters}
            resetDisabled={isApplying}
            addFilter={
              filterMode === 'manual' && commandColumns.length > 0 ? (
                <AddFilterCommand
                  open={commandOpen}
                  onOpenChange={setCommandOpen}
                  columns={commandColumns}
                  renderEditor={renderEditor}
                  onQuickSet={quickSetFilter}
                  disabled={isManualFiltersDisabled}
                />
              ) : null
            }
            saved={
              filterMode === 'manual' && !isGuest
                ? {
                    presets: savedFilterPresets,
                    appliedId: appliedPresetId,
                    busyId: isApplyingPreset ? selectedPresetId : null,
                    disabled: isApplying || isApplyingPreset || isManualFiltersDisabled,
                    onApply: handleApplySelectedGarden,
                    onDeactivate: resetWithUndo,
                  }
                : null
            }
            info={barInfo}
            warning={barWarning}
            notice={barNotice}
          />
        </div>
      )}

      {/* ---------------- Scrolling body ---------------- */}
      <div className="min-h-0 flex-1 scroll-py-3 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
        {/* Mode: Manual | ACMG | Phenotype, as a pill segmented control */}
        <div>
          <div
            className="flex w-full items-center gap-0.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] p-0.5"
            role="tablist"
            aria-label="Filter mode"
            aria-orientation="horizontal"
            onKeyDown={onTablistKeyDown}
          >
            {TABS.map((t) => {
              const selected = filterMode === t.key;
              return (
                <button
                  key={t.key}
                  id={`filter-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="filter-tabpanel"
                  aria-describedby={t.locked ? 'filter-mode-lock-reason' : undefined}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => handleTabSwitch(t.key)}
                  data-state={selected ? 'active' : 'inactive'}
                  data-selected={selected ? 'true' : 'false'}
                  style={{ height: 30 }}
                  className={`wb-tab wb-tab--slide min-w-0 flex-1 justify-center gap-1.5 px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.55)] [@media(pointer:coarse)]:!h-11 [&_svg]:!text-current ${
                    selected ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {selected ? (
                    <motion.span layoutId="filter-mode-pill" className="wb-tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
                  ) : null}
                  <span className="relative inline-flex items-center gap-1.5">
                  {t.usePhenotypeAi ? <PhenotypeAiLabel variant="tab" /> : t.label}
                  {t.locked && <Lock className="size-3 shrink-0" aria-label="Locked" />}
                  {t.badge && (
                    <span className="wb-tab-badge">
                      {t.badge}
                      <span className="sr-only"> {t.badgeLabel}</span>
                    </span>
                  )}
                  </span>
                </button>
              );
            })}
          </div>
          {/* A locked mode explains itself in words, whichever mode is selected. */}
          {phenotypeMissing && filterMode !== 'exomiser' && (
            <p id="filter-mode-lock-reason" className="sr-only">
              {PHENOTYPE_FILTER_DISPLAY_NAME} is locked. Add a phenotype description in sample info to unlock it.
            </p>
          )}
        </div>

        <div
          role="tabpanel"
          id="filter-tabpanel"
          aria-labelledby={`filter-tab-${filterMode}`}
          tabIndex={0}
          className="space-y-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.4)]"
        >
          {/* What this mode does and whether it is ready */}
          {!(filterMode === 'manual' && modeStatus.word !== 'Locked') && filterMode !== 'acmg' && !(filterMode === 'exomiser' && phenotypeMissing) && (
          <section key={filterMode} className="wb-card wb-fade p-4" aria-label="About this filter mode">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-[13px] leading-snug text-muted-foreground">{modeBlurb}</p>
              <StatusPill tone={modeStatus.tone}>{modeStatus.word}</StatusPill>
            </div>

            {/* Manual: nothing to add while ready. */}
            {!(filterMode === 'manual' && modeStatus.word === 'Ready') &&
              !(filterMode === 'exomiser' && (phenotypeMissing || (!exoRunning && !exoFailed && !exoIsActive && !exoCanRun && exoReasons.length > 0))) &&
              !(filterMode === 'exomiser' && exoFailed && exoFailureDetail) && (
                <p
                  className="mt-2 text-[13px] leading-snug text-foreground"
                  role="status"
                >
                  {modeStatus.detail}
                </p>
              )}

            {/* Phenotype */}
            {filterMode === 'exomiser' && !phenotypeMissing && (
              <div className="space-y-3 empty:hidden">
                {exoRunning && (
                  <div className="mt-3 grid min-h-[40px] rounded-2xl bg-[var(--info-soft)] px-3.5 py-2.5">
                    <AnimatePresence initial={false}>
                      <motion.p
                        key={exoRunningMessage}
                        className="col-start-1 row-start-1 text-[13px] font-medium text-foreground"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.15, ease: 'easeOut' }}
                      >
                        {`${exoRunningMessage.replace(/[.…\s]+$/, '')}…`}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                )}

                {exoFailed && exoFailureDetail && (
                  <div className="mt-3">
                    <InlineNotice tone="error" title={PHENOTYPE_FAILED_TITLE} role="alert">
                      {exoFailureDetail}
                    </InlineNotice>
                  </div>
                )}

                {!exoRunning && !exoFailed && !exoIsActive && isFetchingExomiserEligibility && !exomiserEligibility && (
                  <div className="mt-3 space-y-2" role="status" aria-busy="true" aria-label="Checking eligibility">
                    <Skeleton className="h-4 w-2/3 rounded-full" />
                    <Skeleton className="h-4 w-1/2 rounded-full" />
                  </div>
                )}

                {!exoRunning && !exoFailed && !exoIsActive && !exoCanRun && exoReasons.length > 0 && (
                  <div className="mt-3">
                    <InlineNotice tone="warning" title="Cannot run phenotype prioritization yet">
                      <ul className="space-y-3">
                        {exoReasons.map((r) => {
                          const act = reasonAction(r);
                          return (
                            <li key={r} className="flex flex-col items-start gap-1.5">
                              <span>{PHENOTYPE_REASON_LABELS[r] || r}</span>
                              {act}
                            </li>
                          );
                        })}
                      </ul>
                    </InlineNotice>
                  </div>
                )}
              </div>
            )}
          </section>
          )}

          {/* ACMG: the rule drawn out, the yield, and what is still needed */}
          {filterMode === 'acmg' && (
            <div key="acmg-mode" className="wb-fade">
              <AcmgModePanel
                status={modeStatus}
                active={activeProprietaryFilter === 'filter_1'}
                canApply={acmgFilterCanApply}
                manualBlocked={hasAppliedManualFilters}
                onResetManual={resetFilters}
                resetDisabled={isApplying}
                quotaBlocked={acmgQuotaBlocked}
                quotaReason={acmgExomiserGate?.reason}
                meterLabel={acmgMeterLabel}
                annotationAction={annovarQuotaBlocked ? <span className="text-[12px] text-[var(--error)]">{annovarGate.reason}</span> : runAnnotationButton}
                preview={proprietaryFilterPreviews?.filter_1 || null}
                total={displayTotalVariants}
                kept={underConsiderationCount}
              />
            </div>
          )}

          {/* Phenotype: locked preview, or what is saved and what happens next */}
          {filterMode === 'exomiser' && phenotypeMissing && (
            <div key="pheno-locked" className="wb-fade">
              <PhenotypeLockedPreview status={modeStatus} upgrade={upgradeAction} canEdit={!!onEditSampleInfo} />
            </div>
          )}
          {filterMode === 'exomiser' && !phenotypeMissing && !exoIsActive && (
            <div key="pheno-summary" className="wb-fade space-y-3">
              <PhenotypeSummary meta={currentDocument?.sample_metadata} onEdit={onEditSampleInfo} />
              {!exoRunning && <PhenotypeNext />}
            </div>
          )}
          {filterMode === 'exomiser' && !phenotypeMissing && exoIsActive && (
            <div key="pheno-summary-active" className="wb-fade">
              <PhenotypeSummary meta={currentDocument?.sample_metadata} onEdit={onEditSampleInfo} />
            </div>
          )}

          {/* ---- Manual ---- */}
          {filterMode === 'manual' && allColumns.length > 0 && (
            <>
              {/* Saved filters (the old "Filter Garden"): reusable sets of manual filters */}
              {!isGuest && (
                <section className="wb-card overflow-hidden" aria-label="Saved filters">
                  <button
                    type="button"
                    aria-expanded={isGardenExpanded}
                    aria-controls="filter-saved-panel"
                    onClick={() => {
                      const next = !isGardenExpanded;
                      setIsGardenExpanded(next);
                      if (!next) {
                        setIsGardenSaveFormOpen(false);
                        setIsEditingGardenEntry(false);
                        setGardenApplyMissingColumns([]);
                      }
                    }}
                    className="group/row flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-[13px] outline-none transition-colors hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
                  >
                    <Turn open={isGardenExpanded} className="shrink-0">
                      <ChevronRight className={`wb-chev size-3.5 text-muted-foreground ${isGardenExpanded ? '' : 'group-hover/row:translate-x-0.5 group-hover/row:text-[hsl(var(--brand-700))]'}`} aria-hidden />
                    </Turn>
                    <span className="font-medium">Manage saved filters</span>
                    <span className="wb-tab-badge text-muted-foreground">{savedFilterPresets.length}</span>
                    {selectedPreset && (
                      <span className="wb-chip ml-auto max-w-[10rem]" data-tone="brand">
                        <Check className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{selectedPreset.name}</span>
                      </span>
                    )}
                  </button>
                  <Collapse open={isGardenExpanded} id="filter-saved-panel">
                    <div className="space-y-2.5 border-t border-[hsl(var(--wb-line))] p-3">
                      <p className="px-1 text-[12px] leading-snug text-muted-foreground">
                        Save the manual filters you have set and apply them to any variant file later.
                      </p>
                      {presetsLoading && savedFilterPresets.length === 0 ? (
                        <div className="space-y-1.5" role="status" aria-busy="true" aria-label="Loading saved filters">
                          <Skeleton className="h-12 w-full rounded-2xl" />
                          <Skeleton className="h-12 w-full rounded-2xl" />
                        </div>
                      ) : presetsError && savedFilterPresets.length === 0 ? (
                        <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-[var(--error-soft)] px-3.5 py-2.5 text-[13px] text-foreground">
                          <span>Saved filters did not load.</span>
                          <Button type="button" variant="outline" size="sm" onClick={loadSavedFilterPresets} className="h-7 text-[12px]">
                            Retry
                          </Button>
                        </p>
                      ) : savedFilterPresets.length === 0 ? (
                        <p className="rounded-2xl bg-[hsl(var(--wb-pill))] px-3.5 py-3 text-center text-[13px] text-muted-foreground">
                          Nothing saved yet. Set a filter, then save it here.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {savedFilterPresets.map((preset) => {
                            const isActive = appliedPresetId === preset.id;
                            const isEditing = isEditingGardenEntry && selectedPresetId === preset.id;
                            const colCount = (preset.required_columns || []).length;
                            return (
                              <li
                                key={preset.id}
                                className={`rounded-2xl border ${
                                  isActive
                                    ? 'border-[hsl(var(--brand-300))] bg-[hsl(var(--brand-50))]'
                                    : 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))]'
                                }`}
                              >
                                {isEditing ? (
                                  <div className="space-y-2 p-3">
                                    <input
                                      type="text"
                                      value={gardenNameInput}
                                      onChange={(e) => setGardenNameInput(e.target.value)}
                                      autoFocus
                                      maxLength={80}
                                      aria-label="Saved filter name"
                                      className={FIELD_CLASS}
                                    />
                                    <textarea
                                      value={gardenNotesInput}
                                      onChange={(e) => setGardenNotesInput(e.target.value)}
                                      rows={2}
                                      maxLength={500}
                                      placeholder="Notes"
                                      aria-label="Notes"
                                      className={TEXTAREA_CLASS}
                                    />
                                    <div className="flex gap-2">
                                      <Button type="button" size="sm" onClick={handleUpdateSelectedGarden} className="[@media(pointer:coarse)]:h-11">Save</Button>
                                      <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingGardenEntry(false)} className="[@media(pointer:coarse)]:h-11">Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 py-2 pl-3.5 pr-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[13px] font-medium">{preset.name}</p>
                                      {preset.notes && <p className="truncate text-[12px] text-muted-foreground">{preset.notes}</p>}
                                      <p className="text-[12px] text-muted-foreground tabular-nums">
                                        {colCount} column{colCount === 1 ? '' : 's'}
                                        {preset.metadata?.genome_build ? ` · ${preset.metadata.genome_build}` : ''}
                                      </p>
                                    </div>
                                    {isActive ? (
                                      <Button type="button" size="sm" variant="outline" onClick={resetFilters} disabled={isApplying} className="[@media(pointer:coarse)]:h-11" title="Deactivate this saved filter and clear its filters">
                                        <X aria-hidden /> Deactivate
                                      </Button>
                                    ) : (
                                      <Button type="button" size="sm" variant="outline" onClick={() => handleApplySelectedGarden(preset.id)} disabled={isApplyingPreset || isManualFiltersDisabled} className="[@media(pointer:coarse)]:h-11">
                                        {isApplyingPreset && selectedPresetId === preset.id ? 'Applying…' : 'Apply'}
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Edit ${preset.name}`}
                                      className="[@media(pointer:coarse)]:size-11"
                                      onClick={() => {
                                        setSelectedPresetId(preset.id);
                                        setIsEditingGardenEntry(true);
                                        setGardenNameInput(preset.name || '');
                                        setGardenNotesInput(preset.notes || '');
                                      }}
                                    >
                                      <PencilLine aria-hidden />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Delete ${preset.name}`}
                                      className="[@media(pointer:coarse)]:size-11 hover:text-[var(--error)]"
                                      onClick={() => handleDeleteSelectedGarden(preset.id)}
                                    >
                                      <Trash2 aria-hidden />
                                    </Button>
                                  </div>
                                )}
                                {selectedPresetId === preset.id && gardenApplyMissingColumns.length > 0 && (
                                  <div className="px-3 pb-3">
                                    <InlineNotice
                                      tone="warning"
                                      title={`Missing columns: ${gardenApplyMissingColumns.join(', ')}`}
                                      action={
                                        <StateButton
                                          state={annotateState}
                                          labels={{ idle: 'Run annotation', running: 'Running annotation…', done: 'Annotated' }}
                                          icon={Tags}
                                          size="sm"
                                          variant="outline"
                                          onClick={handleRunAnnovarFromGarden}
                                          disabled={annovarQuotaBlocked}
                                          className={`[@media(pointer:coarse)]:h-11 ${annotateState !== 'idle' ? 'disabled:opacity-100' : ''}`}
                                        />
                                      }
                                    >
                                      {annovarQuotaBlocked
                                        ? <span className="text-[var(--error)]">{annovarGate.reason}</span>
                                        : annovarMeterLabel || 'This file has not been annotated with these columns yet.'}
                                    </InlineNotice>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {!isGardenSaveFormOpen && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsGardenSaveFormOpen(true);
                            setGardenNameInput('');
                            setGardenNotesInput('');
                          }}
                          disabled={!canSavePreset || isManualFiltersDisabled}
                          className="wb-fade w-full [@media(pointer:coarse)]:h-11"
                        >
                          <Plus aria-hidden />
                          Save current filters
                        </Button>
                      )}
                      <Collapse open={isGardenSaveFormOpen}>
                        <div className="space-y-2.5 rounded-2xl border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] p-3">
                          <label className="block">
                            <span className="mb-1 block pl-1 text-[12px] font-medium text-muted-foreground">Name</span>
                            <input
                              type="text"
                              value={gardenNameInput}
                              onChange={(e) => setGardenNameInput(e.target.value)}
                              placeholder="For example, Rare and damaging"
                              autoFocus
                              maxLength={80}
                              className={FIELD_CLASS}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block pl-1 text-[12px] font-medium text-muted-foreground">Notes (optional)</span>
                            <textarea
                              value={gardenNotesInput}
                              onChange={(e) => setGardenNotesInput(e.target.value)}
                              rows={2}
                              maxLength={500}
                              className={TEXTAREA_CLASS}
                            />
                          </label>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={async () => {
                                await handleSaveCurrentToGarden();
                                setIsGardenSaveFormOpen(false);
                              }}
                              disabled={isSavingPreset || !gardenNameInput.trim()}
                              className="[@media(pointer:coarse)]:h-11"
                            >
                              {isSavingPreset ? 'Saving…' : 'Save'}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setIsGardenSaveFormOpen(false)} className="[@media(pointer:coarse)]:h-11">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </Collapse>
                    </div>
                  </Collapse>
                </section>
              )}

              {/* Column search */}
              <div>
                <CardHeader title="Columns" count={allColumns.length.toLocaleString()}>
                  <span className="text-[12px] text-muted-foreground">Pick one to set a filter</span>
                </CardHeader>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    type="text"
                    value={columnSearchQuery}
                    onChange={(e) => setColumnSearchQuery(e.target.value)}
                    placeholder={`Search ${allColumns.length.toLocaleString()} columns`}
                    aria-label="Search columns"
                    spellCheck={false}
                    autoComplete="off"
                    className={`${FIELD_CLASS} pl-9 pr-9`}
                  />
                  {columnSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setColumnSearchQuery('')}
                      aria-label="Clear column search"
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${MINI_ICON_BTN}`}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>

              {/* Columns: search results, or collapsible groups (one card per group) */}
              {searchMatches ? (
                searchMatches.length === 0 ? (
                  <div className="wb-card px-4 py-8 text-center">
                    <p className="text-[13px] font-medium text-foreground">No columns match &ldquo;{columnSearchQuery}&rdquo;</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">Check the spelling or search for part of the name.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setColumnSearchQuery('')} className="mt-3 [@media(pointer:coarse)]:h-11">
                      Clear search
                    </Button>
                  </div>
                ) : (
                  <section className="wb-card p-1.5" aria-label="Matching columns">
                    <div className="space-y-0.5">
                      {searchMatches.map((c) => renderColumnRow(c, { showGroup: true }))}
                    </div>
                  </section>
                )
              ) : (
                columnGroups.map(([groupName, cols], groupIndex) => {
                  const isGroupOpen = expandedGroups[groupName] ?? (groupIndex === 0 || columnGroups.length === 1);
                  const activeInGroup = cols.reduce((acc, c) => acc + (pendingFilterPayload[c] ? 1 : 0), 0);
                  return (
                    <section key={groupName} className="wb-card overflow-hidden" aria-label={groupName}>
                      <button
                        type="button"
                        aria-expanded={isGroupOpen}
                        aria-controls={`filter-group-${groupIndex}`}
                        onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupName]: !isGroupOpen }))}
                        className="group/row flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-[13px] outline-none transition-colors hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
                      >
                        <Turn open={isGroupOpen} className="shrink-0">
                          <ChevronRight className={`wb-chev size-3.5 text-muted-foreground ${isGroupOpen ? '' : 'group-hover/row:translate-x-0.5 group-hover/row:text-[hsl(var(--brand-700))]'}`} aria-hidden />
                        </Turn>
                        <span className="min-w-0 truncate font-medium">{groupName}</span>
                        <span className="wb-tab-badge text-muted-foreground">{cols.length}</span>
                        {activeInGroup > 0 && (
                          <span className="wb-chip ml-auto tabular-nums" data-tone="brand">
                            {activeInGroup} active
                          </span>
                        )}
                      </button>
                      <Collapse open={isGroupOpen} id={`filter-group-${groupIndex}`}>
                        <div className="space-y-0.5 border-t border-[hsl(var(--wb-line))] p-1.5">
                          {cols.map((c) => renderColumnRow(c))}
                        </div>
                      </Collapse>
                    </section>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------------- Sticky footer ---------------- */}
      {/* The live count, then the one primary action for the selected mode (Apply for Manual) beside
        * Reset. Download and the report are quiet outline pills. The scroll area above is a sibling,
        * so this bar never overlaps a focused control. */}
      <div className="shrink-0 space-y-2 border-t border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] px-4 pb-3 pt-2.5 group-data-[w=narrow]/tab:space-y-1.5 group-data-[w=narrow]/tab:pb-[max(0.75rem,var(--mtabs-safe-b,env(safe-area-inset-bottom)))] group-data-[w=narrow]/tab:pt-2">
        <div id="filter-apply-status" role="status" className="space-y-0.5">
          {/* Manual mode shows the apply state machine (Draft, Applying, Applied) with the diff. The count itself
            * lives in the pinned filter bar above, so it is not repeated here. */}
          {filterMode === 'manual' ? (
            <>
              <p className="sr-only">{footerStatus.text}</p>
              {fileTotalVariants > 0 && !isManualFiltersDisabled && (
                <ApplyStatus phase={applyPhase} pending={pendingDiff} diff={applyDiff} scopeNow={underConsiderationCount} />
              )}
              {isManualFiltersDisabled && (
                <p className="flex items-start gap-1.5 pt-0.5 text-[12px] leading-snug text-muted-foreground">
                  <StatusDot tone={footerStatus.tone} pulse={footerStatus.pulse} className="mt-[5px]" />
                  <span>{footerStatus.text}</span>
                </p>
              )}
              {applyPhase === 'clean' && !isManualFiltersDisabled && allColumns.length > 0 && (
                <p className="hidden pt-1 text-[12px] leading-snug text-muted-foreground md:block">
                  Press <kbd className="ov-kbd !ml-0 !mr-0.5">/</kbd> to add a filter, <kbd className="ov-kbd !ml-0 !mr-0.5">⌘</kbd><kbd className="ov-kbd !ml-0 !mr-0.5">↵</kbd> to apply.
                </p>
              )}
            </>
          ) : (
            <>
              {/* Idle and success states are spoken to assistive tech but not repeated visually: the count
                * above already shows the result. Anything that needs attention is written out. */}
              {footerQuiet && <p className="sr-only">{footerStatus.text}</p>}
              {/* The attention line slides open and shut. The footer is anchored to the bottom, so the
                * buttons stay where they are while the content above glides up. */}
              <Collapse open={!footerQuiet}>
                <p className="flex items-start gap-1.5 pt-0.5 text-[12px] leading-snug text-muted-foreground">
                  <StatusDot tone={footerStatus.tone} pulse={footerStatus.pulse} className="mt-[5px]" />
                  <span>{footerStatus.text}</span>
                </p>
              </Collapse>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {renderPrimaryAction()}
          <Button
            type="button"
            variant="outline"
            onClick={resetWithUndo}
            disabled={isApplying}
            aria-label="Reset all filters"
            title={
              isGuest
                ? 'Reset all filters and restore all preview variants for chat'
                : 'Reset all active filters (manual and proprietary) and restore all variants'
            }
            className="h-9 [@media(pointer:coarse)]:h-11"
          >
            <RotateCcw aria-hidden />
            Reset
          </Button>
        </div>

        {!isGuest && variantData && (
          <div className="grid grid-cols-2 items-start gap-2">
            <ExportVariantsButton
              conversationId={conversationId}
              variantData={variantData}
              filteredCount={filteredCount}
              isGuest={isGuest}
              downloadGate={downloadGate}
              uiCount={underConsiderationCount}
              eligibilityMessage={chatEligibility?.message || null}
              compact={narrowPanel}
              onReconcileUiCount={(nextCount) => {
                const n = Number(nextCount);
                if (!Number.isFinite(n)) return;
                setFilteredCount(n);
                if (onFiltersChange) {
                  onFiltersChange(
                    hasActiveManualFilters ? filters : { proprietary: activeProprietaryFilter },
                    n,
                    displayTotalVariants
                  );
                }
              }}
            />
            <CaseReportDownloadButton
              conversationId={conversationId}
              variantData={variantData}
              isGuest={isGuest}
              downloadGate={downloadGate}
              chatEligibility={chatEligibility}
              gaTriageStatus={gaTriageStatus}
              gaTriageUpdatedAt={gaTriageUpdatedAt}
              onRequestOpen={onClinicalReportOpen}
              hideEligibilityReason
              compact={narrowPanel}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default VariantFilterSidebar;
