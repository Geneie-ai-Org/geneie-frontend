import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X, RotateCcw, Upload, Trash2, Info, Search, PencilLine, ChevronRight, Check, Lock, Plus, Tags } from 'lucide-react';
import { getDeviceId } from '@/lib/deviceId';
import { doc, getDoc } from 'firebase/firestore';
import { optionalIdToken } from '@/lib/safeAuth';
import DocumentUpload from './DocumentUpload';
import ExportVariantsButton from './ExportVariantsButton';
import CaseReportDownloadButton from './CaseReportDownloadButton';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
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
import { sampleHasPhenotype } from '@/components/PhenotypeInputPanel';
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

/** Flat, hairline-free notice: soft status fill, normal text colour, coloured title. */
function InlineNotice({ tone = 'warning', title, children, action = null, role }) {
  return (
    <div
      role={role}
      className={`rounded-md px-3 py-2.5 text-[13px] leading-snug text-foreground ${TONE_SOFT[tone] || TONE_SOFT.muted}`}
    >
      {title && <p className={`font-medium ${TONE_TEXT[tone] || ''}`}>{title}</p>}
      {children && <div className={`${title ? 'mt-0.5' : ''} text-muted-foreground`}>{children}</div>}
      {action && <div className="mt-1.5">{action}</div>}
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
  annovar_required: 'Run Annotation first. Phenotype prioritization requires an annotated file.',
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

const BOOLISH = /^(true|false|yes|no|y|n|t|f|0|1)$/i;

const FIELD_CLASS =
  'h-8 max-md:h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-[13px] md:text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50';

/** Dual-handle range slider + min/max fields for numeric column filters. */
function NumericRangeSlider({ rangeMin, rangeMax, currentMin, currentMax, onMinChange, onMaxChange, disabled }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = dragging;

  /** Draft strings while an input is focused: commit on blur so typing is not overwritten each keystroke. */
  const [minDraft, setMinDraft] = useState(null);
  const [maxDraft, setMaxDraft] = useState(null);

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

  const applyTyped = (raw, which) => {
    const setter = which === 'min' ? onMinChange : onMaxChange;
    const current = which === 'min' ? currentMin : currentMax;
    if (raw === '' || raw === null || raw === undefined) {
      // An emptied field removes that bound.
      if (current != null) setter(null);
      return;
    }
    const n = parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n)) return;
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
  };

  const minInputValue = minDraft !== null ? minDraft : currentMin != null ? String(currentMin) : '';
  const maxInputValue = maxDraft !== null ? maxDraft : currentMax != null ? String(currentMax) : '';

  const thumbClass = (active) =>
    `absolute size-4 rounded-full border-2 border-background bg-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
      active ? 'z-20 scale-110' : 'z-10'
    }`;

  return (
    <div className="space-y-2 select-none">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-2xs text-muted-foreground">Min</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={minInputValue}
            placeholder={formatBound(rangeMin)}
            onFocus={() => {
              if (!disabled) setMinDraft(currentMin != null ? String(currentMin) : '');
            }}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={(e) => {
              setMinDraft(null);
              applyTyped(e.target.value, 'min');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={disabled}
            className={`${FIELD_CLASS} select-text`}
            aria-label="Minimum filter value"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs text-muted-foreground">Max</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={maxInputValue}
            placeholder={formatBound(rangeMax)}
            onFocus={() => {
              if (!disabled) setMaxDraft(currentMax != null ? String(currentMax) : '');
            }}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={(e) => {
              setMaxDraft(null);
              applyTyped(e.target.value, 'max');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={disabled}
            className={`${FIELD_CLASS} select-text`}
            aria-label="Maximum filter value"
          />
        </label>
      </div>
      <div
        ref={trackRef}
        className={`relative flex h-6 items-center ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
        onPointerDown={onTrackPointerDown}
        role="presentation"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
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
          style={{ left: `${loPct}%`, top: '50%', transform: 'translate(-50%, -50%)', touchAction: 'none' }}
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
          style={{ left: `${hiPct}%`, top: '50%', transform: 'translate(-50%, -50%)', touchAction: 'none' }}
        />
      </div>
      <p className="text-2xs text-muted-foreground tabular-nums">
        Data range {formatBound(rangeMin)} to {formatBound(rangeMax)}
      </p>
    </div>
  );
}

const CATEGORY_RENDER_CAP = 200;

/** Searchable multi-select; two-value yes/no style columns become Any / A / B. */
function CategoricalEditor({ values, selected, disabled, onChange }) {
  const [query, setQuery] = useState('');
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
      <div role="radiogroup" aria-label="Value" className="inline-flex w-full rounded-md bg-muted p-0.5">
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
              className={`h-7 max-md:h-10 flex-1 rounded px-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
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
  const matches = q ? all.filter((v) => String(v).toLowerCase().includes(q)) : all;
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
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${all.length.toLocaleString()} values`}
            aria-label="Search values"
            className={`${FIELD_CLASS} pl-7`}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-2xs text-muted-foreground tabular-nums">
        <span>
          {selected.length.toLocaleString()} selected of {all.length.toLocaleString()} values
        </span>
        {selected.length > 0 && !disabled && (
          <button type="button" onClick={() => onChange([])} className="rounded text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
            Clear
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-background">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">No values match &ldquo;{query}&rdquo;</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((value) => (
              <li key={String(value)}>
                <label
                  className={`flex items-center gap-2 px-2.5 py-1.5 max-md:min-h-11 text-[13px] ${
                    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted'
                  }`}
                >
                  <Checkbox
                    checked={selected.includes(value)}
                    onCheckedChange={(checked) => toggle(value, checked === true)}
                    disabled={disabled}
                  />
                  <span className="min-w-0 flex-1 truncate" title={String(value)}>
                    {String(value) === 'Empty' ? 'Empty' : String(value)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {matches.length > shown.length && (
        <p className="text-2xs text-muted-foreground">
          Showing the first {CATEGORY_RENDER_CAP} of {matches.length.toLocaleString()}. Search to narrow the list.
        </p>
      )}
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
}) {
  if (notFilterableReason) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {notFilterableReason} <span className="text-[var(--text-tertiary)]">Still available to chat for analysis.</span>
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
                }}
                disabled={disabled}
                className="h-7 max-md:h-10 rounded-full border border-border bg-background px-2.5 text-2xs font-medium text-muted-foreground outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="inline-flex items-center gap-1 rounded text-2xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-11"
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
    ? `${annovarQuotaMeter.remaining} of ${annovarQuotaMeter.limit} Annotation runs left`
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

  const resetFilters = async () => {
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

        // Show notification
        if (data.total_count > 0) {
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

  const loadSavedFilterPresets = useCallback(async () => {
    if (!userId || isGuest) return;
    try {
      const token = await optionalIdToken();
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/saved-filters`, {
        method: 'GET',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      if (!response.ok) return;
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
      <div className="variant-filter-sidebar flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
          <Upload className="mb-3 size-8 text-muted-foreground" aria-hidden />
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
  const clearAllFilters = () => {
    if (hasAppliedManualFilters || activeProprietaryFilter) {
      resetFilters();
      return;
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
            ? { tone: 'warning', word: 'Needs annotation', detail: 'Run Annotation first, then apply this filter.' }
            : hasAppliedManualFilters
              ? { tone: 'warning', word: 'Blocked', detail: 'Manual filters are active. Reset them first.' }
              : { tone: 'muted', word: 'Ready', detail: acmgMeterLabel || 'Not applied yet.' };
  } else {
    modeBlurb = PHENOTYPE_FILTER_DESCRIPTION;
    modeStatus = exoIsActive
      ? { tone: 'success', word: 'Active', detail: 'Variants are ranked against the phenotype.' }
      : phenotypeMissing
        ? { tone: 'warning', word: 'Locked', detail: 'Needs a phenotype description in sample info. The rest of the pipeline runs without one.' }
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
    const rowHint = reason
      ? null
      : rowRange
        ? `${formatBound(rowRange.min)} to ${formatBound(rowRange.max)}`
        : categoricalColumns[colName] && categoricalValuesFor(colName).length > 0
          ? `${categoricalValuesFor(colName).length.toLocaleString()} values`
          : null;
    return (
      <div key={colName} className={isExpanded ? 'bg-muted/50' : undefined}>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setOpenFilterPopup(isExpanded ? null : colName)}
          className="flex w-full items-center gap-2 py-1.5 pl-9 pr-4 text-left text-[13px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 max-md:min-h-11"
        >
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${reason ? 'text-muted-foreground' : 'text-foreground'}`}>{colName}</span>
            {showGroup && groupOfColumn[colName] && (
              <span className="block truncate text-2xs text-muted-foreground">{groupOfColumn[colName]}</span>
            )}
          </span>
          {summary ? (
            <span
              className={`inline-flex h-5 max-w-[9rem] shrink-0 items-center gap-1 truncate rounded-full px-2 text-2xs font-medium tabular-nums ${
                isPending
                  ? 'border border-dashed border-[var(--warning)] text-foreground'
                  : 'bg-primary/10 text-primary'
              }`}
              title={isPending ? `${summary} (not applied yet)` : summary}
            >
              {summary}
            </span>
          ) : reason ? (
            <span className="shrink-0 text-2xs text-muted-foreground">Not filterable</span>
          ) : rowHint ? (
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{rowHint}</span>
          ) : null}
        </button>
        {isExpanded && (
          <div className="pb-3 pl-9 pr-4 pt-1">
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
              onClear={() => clearColumnFilter(colName)}
            />
          </div>
        )}
      </div>
    );
  };

  const selectedPreset = savedFilterPresets.find((p) => p.id === appliedPresetId) || null;
  const canSavePreset = hasAppliedManualFilters || Object.keys(pendingFilterPayload).length > 0;

  const TABS = [
    { key: 'manual', label: 'Manual', filterKey: null },
    { key: 'acmg', label: 'ACMG', filterKey: 'filter_1' },
    { key: 'exomiser', label: PHENOTYPE_FILTER_DISPLAY_NAME, filterKey: 'filter_3', usePhenotypeAi: true, locked: phenotypeMissing },
  ];
  const activeTabIndex = TABS.findIndex((t) => t.key === filterMode);
  const focusTab = (i) => {
    const el = document.getElementById(`filter-tab-${TABS[i].key}`);
    if (el) el.focus();
  };
  const onTablistKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusTab((activeTabIndex + 1) % TABS.length);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusTab((activeTabIndex - 1 + TABS.length) % TABS.length);
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

  const proprietaryBtnBase = 'w-full max-md:h-11';

  return (
    <div className="variant-filter-sidebar flex h-full min-h-0 w-full min-w-0 flex-col bg-background text-foreground">
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemoveVariantFile}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingTabSwitch} onOpenChange={(open) => { if (!open) cancelTabSwitch(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to {pendingTabSwitch === 'manual' ? 'Manual' : pendingTabSwitch === 'acmg' ? 'ACMG' : PHENOTYPE_FILTER_DISPLAY_NAME}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your current {getCurrentActiveMode() === 'manual' ? 'manual filters' : getCurrentActiveMode() === 'acmg' ? 'ACMG filter' : 'phenotype prioritization'} will be cleared. You can re-apply after switching.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelTabSwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTabSwitch}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------- Scrolling body ---------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Summary: how many variants remain, and what is filtering them */}
        {fileTotalVariants > 0 && (
          <section aria-label="Filter summary" className="border-b border-border px-4 pb-3 pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  <span className="text-lg font-semibold leading-none text-foreground">
                    {underConsiderationCount.toLocaleString()}
                  </span>{' '}
                  of {displayTotalVariants.toLocaleString()} variants
                </p>
                {variantData?.sample_only_ingest && (
                  <Popover>
                    <PopoverTrigger
                      className="inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:size-11"
                      aria-label="About this file"
                    >
                      <Info className="size-3.5" />
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
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
                            Full file on cloud storage ({annotatedRowBaseline.toLocaleString()} data rows). Column mapping used the first {variantData.interpretation_sample_rows || 50} rows only and is not loaded into the database yet. Run Annotation, then apply the ACMG filter (or apply filters once) to load a working set. Use Reset to clear filters and start over from the full file.
                          </>
                        )
                      ) : (
                        <>
                          Full file on cloud storage. Column mapping used the first {variantData.interpretation_sample_rows || 50} rows only. Run Annotation, then apply the ACMG filter. Use Reset to reload the full file row count.
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {filteredOutCount > 0 && (
                <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                  {filteredOutCount.toLocaleString()} filtered out
                </span>
              )}
            </div>
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Variants remaining after filters"
              aria-valuemin={0}
              aria-valuemax={displayTotalVariants}
              aria-valuenow={underConsiderationCount}
            >
              <div
                className="h-full rounded-full bg-[hsl(var(--signal))] transition-[width] duration-300 motion-reduce:transition-none"
                style={{
                  width: displayTotalVariants > 0
                    ? `${Math.max(0, Math.min(100, (underConsiderationCount / displayTotalVariants) * 100))}%`
                    : '0%',
                  minWidth: underConsiderationCount > 0 ? '3px' : 0,
                }}
              />
            </div>

            {hasActiveManualFilters &&
              filterWorkingSetCount != null &&
              filteredCount === 1 &&
              filterWorkingSetCount === 1 &&
              fileTotalVariants > 100 && (
                <div className="mt-3">
                  <InlineNotice tone="warning" title="Only 1 variant is loaded" role="status">
                    Press Reset, then apply ACMG or your first filter again to reload a larger working set.
                  </InlineNotice>
                </div>
              )}

            {hasAnyChip && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
                {proprietaryChipLabel && (
                  <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1 text-xs font-medium text-primary">
                    <span className="truncate">{proprietaryChipLabel}</span>
                    <button
                      type="button"
                      onClick={removeProprietaryChip}
                      disabled={isApplyingProprietaryFilter || pipelineBusy}
                      aria-label={`Remove ${proprietaryChipLabel}`}
                      className="inline-flex size-5 items-center justify-center rounded-full outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:size-8"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                )}
                {filterChips.map((chip) => (
                  <span
                    key={chip.col}
                    className={`inline-flex h-6 max-w-full items-center gap-1 rounded-full pl-2.5 pr-1 text-xs ${
                      chip.pending
                        ? 'border border-dashed border-[var(--warning)] text-foreground'
                        : 'bg-primary/10 text-primary'
                    }`}
                    title={chip.pending ? `${chip.col}: ${chip.label} (not applied yet)` : `${chip.col}: ${chip.label}`}
                  >
                    <span className="truncate">
                      <span className="font-medium">{chip.col}</span>
                      <span className="tabular-nums"> {chip.label}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => clearColumnFilter(chip.col)}
                      disabled={isManualFiltersDisabled}
                      aria-label={`Remove filter on ${chip.col}`}
                      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:size-8 ${
                        chip.pending ? 'hover:bg-muted' : 'hover:bg-primary/15'
                      }`}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  disabled={isApplying}
                  className="rounded px-1 text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 max-md:min-h-11"
                >
                  Clear all
                </button>
              </div>
            )}
          </section>
        )}

        {/* Mode: Manual | ACMG | Phenotype, with what it does and whether it is ready */}
        <section aria-label="Filter mode" className="border-b border-border px-4 py-3">
          <div
            className="flex w-full items-center gap-0.5 rounded-lg bg-[var(--segment-track)] p-0.5"
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
                  tabIndex={selected ? 0 : -1}
                  onClick={() => handleTabSwitch(t.key)}
                  data-state={selected ? 'active' : 'inactive'}
                  className={`inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-10 ${
                    selected
                      ? 'bg-[var(--segment-thumb)] font-medium text-foreground shadow-[var(--shadow-sm)]'
                      : 'font-medium text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.usePhenotypeAi ? <PhenotypeAiLabel variant="tab" /> : t.label}
                  {t.locked && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Locked" />}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id="filter-tabpanel"
            aria-labelledby={`filter-tab-${filterMode}`}
            tabIndex={0}
            className="mt-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <p className="text-[13px] leading-snug text-muted-foreground">{modeBlurb}</p>
            <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug" aria-live="polite">
              <StatusDot tone={modeStatus.tone} pulse={modeStatus.pulse} className="mt-[7px]" />
              <span>
                <span className="font-medium text-foreground">{modeStatus.word}</span>
                {modeStatus.detail && <span className="text-muted-foreground">{`. ${modeStatus.detail}`}</span>}
              </span>
            </p>
            {filterMode === 'exomiser' && phenotypeMissing && onEditSampleInfo && (
              <Button type="button" variant="outline" size="sm" onClick={onEditSampleInfo} className="mt-2 max-md:h-11">
                Add a phenotype in sample info
              </Button>
            )}
          </div>
        </section>

        {/* ---- Manual ---- */}
        {filterMode === 'manual' && allColumns.length > 0 && (
          <div>
            {/* Saved filters (the old "Filter Garden"): reusable sets of manual filters */}
            {!isGuest && (
              <div className="border-b border-border">
                <button
                  type="button"
                  aria-expanded={isGardenExpanded}
                  onClick={() => {
                    const next = !isGardenExpanded;
                    setIsGardenExpanded(next);
                    if (!next) {
                      setIsGardenSaveFormOpen(false);
                      setIsEditingGardenEntry(false);
                      setGardenApplyMissingColumns([]);
                    }
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 max-md:min-h-11"
                >
                  <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${isGardenExpanded ? 'rotate-90' : ''}`} aria-hidden />
                  <span className="font-medium">Saved filters</span>
                  <span className="text-2xs tabular-nums text-muted-foreground">{savedFilterPresets.length}</span>
                  {selectedPreset && (
                    <span className="ml-auto inline-flex h-5 max-w-[10rem] items-center gap-1 truncate rounded-full bg-primary/10 px-2 text-2xs font-medium text-primary">
                      <Check className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{selectedPreset.name}</span>
                    </span>
                  )}
                </button>
                {isGardenExpanded && (
                  <div className="space-y-2 px-4 pb-3">
                    <p className="text-2xs leading-snug text-muted-foreground">
                      Save the manual filters you have set and apply them to any variant file later.
                    </p>
                    {savedFilterPresets.length === 0 ? (
                      <p className="rounded-md bg-muted px-3 py-3 text-center text-[13px] text-muted-foreground">
                        Nothing saved yet. Set a filter, then save it here.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {savedFilterPresets.map((preset) => {
                          const isActive = appliedPresetId === preset.id;
                          const isEditing = isEditingGardenEntry && selectedPresetId === preset.id;
                          const colCount = (preset.required_columns || []).length;
                          return (
                            <li key={preset.id} className={isActive ? 'bg-primary/5' : undefined}>
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
                                    className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                                  />
                                  <div className="flex gap-2">
                                    <Button type="button" size="sm" onClick={handleUpdateSelectedGarden} className="max-md:h-11">Save</Button>
                                    <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingGardenEntry(false)} className="max-md:h-11">Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 py-2 pl-3 pr-1.5">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-medium">{preset.name}</p>
                                    {preset.notes && <p className="truncate text-2xs text-muted-foreground">{preset.notes}</p>}
                                    <p className="text-2xs text-muted-foreground tabular-nums">
                                      {colCount} column{colCount === 1 ? '' : 's'}
                                      {preset.metadata?.genome_build ? ` · ${preset.metadata.genome_build}` : ''}
                                    </p>
                                  </div>
                                  {isActive ? (
                                    <Button type="button" size="sm" variant="ghost" onClick={resetFilters} disabled={isApplying} className="max-md:h-11" title="Deactivate this saved filter and clear its filters">
                                      <X aria-hidden /> Deactivate
                                    </Button>
                                  ) : (
                                    <Button type="button" size="sm" variant="outline" onClick={() => handleApplySelectedGarden(preset.id)} disabled={isApplyingPreset || isManualFiltersDisabled} className="max-md:h-11">
                                      {isApplyingPreset && selectedPresetId === preset.id ? 'Applying…' : 'Apply'}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Edit ${preset.name}`}
                                    className="max-md:size-11"
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
                                    className="max-md:size-11 hover:text-[var(--error)]"
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
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleRunAnnovarFromGarden}
                                        disabled={isRunningAnnovar || annovarQuotaBlocked}
                                        className="max-md:h-11"
                                      >
                                        <Tags aria-hidden />
                                        {isRunningAnnovar ? 'Running Annotation…' : 'Run Annotation'}
                                      </Button>
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

                    {!isGardenSaveFormOpen ? (
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
                        className="w-full max-md:h-11"
                      >
                        <Plus aria-hidden />
                        Save current filters
                      </Button>
                    ) : (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <label className="block">
                          <span className="mb-1 block text-2xs text-muted-foreground">Name</span>
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
                          <span className="mb-1 block text-2xs text-muted-foreground">Notes (optional)</span>
                          <textarea
                            value={gardenNotesInput}
                            onChange={(e) => setGardenNotesInput(e.target.value)}
                            rows={2}
                            maxLength={500}
                            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
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
                            className="max-md:h-11"
                          >
                            {isSavingPreset ? 'Saving…' : 'Save'}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setIsGardenSaveFormOpen(false)} className="max-md:h-11">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Column search */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="text"
                  value={columnSearchQuery}
                  onChange={(e) => setColumnSearchQuery(e.target.value)}
                  placeholder={`Search ${allColumns.length.toLocaleString()} columns`}
                  aria-label="Search columns"
                  className={`${FIELD_CLASS} pl-8 pr-8`}
                />
                {columnSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setColumnSearchQuery('')}
                    aria-label="Clear column search"
                    className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:size-10"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            {/* Columns: search results, or collapsible groups */}
            <div className="border-t border-border">
              {searchMatches ? (
                searchMatches.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No columns match &ldquo;{columnSearchQuery}&rdquo;.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {searchMatches.map((c) => renderColumnRow(c, { showGroup: true }))}
                  </div>
                )
              ) : (
                <div className="divide-y divide-border">
                  {columnGroups.map(([groupName, cols], groupIndex) => {
                    const isGroupOpen = expandedGroups[groupName] ?? (groupIndex === 0 || columnGroups.length === 1);
                    const activeInGroup = cols.reduce((acc, c) => acc + (pendingFilterPayload[c] ? 1 : 0), 0);
                    return (
                      <div key={groupName}>
                        <button
                          type="button"
                          aria-expanded={isGroupOpen}
                          onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupName]: !isGroupOpen }))}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 max-md:min-h-11"
                        >
                          <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${isGroupOpen ? 'rotate-90' : ''}`} aria-hidden />
                          <span className="min-w-0 truncate font-medium">{groupName}</span>
                          <span className="text-2xs tabular-nums text-muted-foreground">{cols.length}</span>
                          {activeInGroup > 0 && (
                            <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-full bg-primary/10 px-2 text-2xs font-medium tabular-nums text-primary">
                              {activeInGroup} active
                            </span>
                          )}
                        </button>
                        {isGroupOpen && (
                          <div className="divide-y divide-border/60 pb-1">{cols.map((c) => renderColumnRow(c))}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- ACMG ---- */}
        {filterMode === 'acmg' && (
          <div className="space-y-2 px-4 py-4">
            {proprietaryFilterPreviews?.filter_1?.preview_pending && activeProprietaryFilter !== 'filter_1' && (
              <p className="text-[13px] text-muted-foreground">The match count appears after you apply.</p>
            )}
            {activeProprietaryFilter === 'filter_1' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleApplyProprietaryFilter('filter_1')}
                disabled={isApplyingProprietaryFilter}
                className={`${proprietaryBtnBase} text-destructive hover:text-destructive`}
              >
                {isApplyingProprietaryFilter ? 'Removing…' : 'Remove ACMG filter'}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => handleApplyProprietaryFilter('filter_1')}
                disabled={!acmgFilterCanApply || isApplyingProprietaryFilter}
                className={proprietaryBtnBase}
              >
                {isApplyingProprietaryFilter ? 'Applying…' : 'Apply ACMG filter'}
              </Button>
            )}
          </div>
        )}

        {/* ---- Phenotype ---- */}
        {filterMode === 'exomiser' && !phenotypeMissing && (
          <div className="space-y-3 px-4 py-4">
            {exoRunning && (
              <div className="grid min-h-[36px] rounded-md bg-muted px-3 py-2">
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
              <InlineNotice tone="error" title={PHENOTYPE_FAILED_TITLE} role="alert">
                {exoFailureDetail}
              </InlineNotice>
            )}

            {!exoRunning && !exoFailed && !exoIsActive && !exoCanRun && exoReasons.length > 0 && (
              <InlineNotice tone="warning" title="Cannot run phenotype prioritization yet">
                <ul className="list-disc space-y-0.5 pl-4">
                  {exoReasons.map((r) => (
                    <li key={r}>{PHENOTYPE_REASON_LABELS[r] || r}</li>
                  ))}
                </ul>
              </InlineNotice>
            )}

            {exoIsActive ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleApplyProprietaryFilter('filter_3')}
                disabled={isApplyingProprietaryFilter}
                className={`${proprietaryBtnBase} text-destructive hover:text-destructive`}
              >
                {isApplyingProprietaryFilter ? 'Removing…' : `Remove ${PHENOTYPE_FILTER_DISPLAY_NAME}`}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => runExomiser && runExomiser()}
                disabled={!exoCanRun || exoRunning || !runExomiser || acmgQuotaBlocked}
                className={proprietaryBtnBase}
              >
                {exoRunning ? (
                  'Running…'
                ) : exoFailed ? (
                  <>Retry <PhenotypeAiLabel variant="inline" /></>
                ) : (
                  <>Run <PhenotypeAiLabel variant="inline" /></>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Sticky footer ---------------- */}
      <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 py-2.5">
        {filterMode === 'manual' && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {isManualFiltersDisabled ? (
              <><StatusDot tone="warning" />Locked while a pipeline job runs.</>
            ) : hasUnappliedFilterChanges ? (
              <><StatusDot tone="warning" /><span className="tabular-nums">{unappliedCount > 0 ? `${unappliedCount} unapplied change${unappliedCount === 1 ? '' : 's'}` : 'Unapplied changes'}. Press Apply to update the variants.</span></>
            ) : hasAppliedManualFilters ? (
              <><StatusDot tone="success" />Filters applied.</>
            ) : (
              <><StatusDot tone="muted" />Choose a column filter, then press Apply.</>
            )}
          </p>
        )}

        <div className="flex gap-2">
          {filterMode === 'manual' && (
            <Button
              type="button"
              onClick={applyFilters}
              disabled={isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges}
              className="h-9 flex-1 max-md:h-11"
            >
              {isApplying ? 'Applying…' : 'Apply'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={resetFilters}
            disabled={isApplying}
            title={
              isGuest
                ? 'Clear all filters and restore all preview variants for chat'
                : 'Clear all active filters (manual and proprietary) and restore all variants'
            }
            className="h-9 flex-1 max-md:h-11"
          >
            <RotateCcw aria-hidden />
            Reset all
          </Button>
        </div>

        {!isGuest && variantData && (
          <div className="space-y-1 border-t border-border pt-2">
            <ExportVariantsButton
              conversationId={conversationId}
              variantData={variantData}
              filteredCount={filteredCount}
              isGuest={isGuest}
              downloadGate={downloadGate}
              uiCount={underConsiderationCount}
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
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default VariantFilterSidebar;
