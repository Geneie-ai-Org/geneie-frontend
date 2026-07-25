import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, X, RotateCcw, CheckCircle, Upload, Trash2, Info, Zap, Search, Sprout, PencilLine, ChevronDown, PanelRightClose } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import DocumentUpload from './DocumentUpload';
import { useProcessingToast } from '@/hooks/useProcessingToast';
import ExportVariantsButton from './ExportVariantsButton';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import qiagenLogo from '../Qiagen.svg.png';
import { toast } from 'sonner';
import { apiErrorDetailToMessage as sharedApiErrorDetailToMessage, humanizeError } from '@/lib/humanizeError';
import { groupColumns } from '@/lib/variantColumnGroups';

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

const PROPRIETARY_FILTER_1_DESCRIPTION = "ClinVar and/or InterVar pathogenic classes, with rare gnomAD frequency (<1%) or missing frequency retained.";
const EXOMISER_FILTER_DESCRIPTION = "Phenotype-driven variant prioritization for Germline cases using HPO terms and Exomiser gene/variant scoring. Requires ANNOVAR annotation and a phenotype description.";

const DEVICE_ID_STORAGE_KEY = 'geneie_device_id';

function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing;
    const created = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch (_) {
    return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const apiErrorDetailToMessage = sharedApiErrorDetailToMessage;

async function pollFilterJobStatus(conversationId, token, apiBase, onProgress) {
  const maxPollMs = 14 * 24 * 60 * 60 * 1000;
  const started = Date.now();
  const pollOnce = async () => {
    const statusRes = await fetch(`${apiBase}/api/filter-status/${conversationId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': getOrCreateDeviceId(),
      },
    });
    if (!statusRes.ok) return null;
    const statusData = await statusRes.json().catch(() => ({}));
    const job = statusData.filter_job || {};
    const msg = job.message || statusData.message || 'Applying ACMG filter…';
    if (onProgress) onProgress(msg, job.progress_percent ?? statusData.progress_percent);
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

/** Dual-handle range slider for numeric column filters (min/max bounds). */
function NumericRangeSlider({ rangeMin, rangeMax, currentMin, currentMax, onMinChange, onMaxChange, disabled }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const dragRef = useRef(null);
  dragRef.current = dragging;

  /** Draft strings while an input is focused — commit on blur so typing is not overwritten each keystroke. */
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
      const { rangeMin: r0, rangeMax: r1, span: s } = latest.current;
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

  const fmt = (n) => {
    if (!Number.isFinite(n)) return '—';
    if (span >= 1) return n.toFixed(2);
    if (span >= 0.01) return n.toFixed(4);
    return n.toExponential(2);
  };

  if (span <= 0 || !Number.isFinite(span)) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        Filter value is fixed at <span className="font-medium">{fmt(rangeMin)}</span> (no range).
      </p>
    );
  }

  const applyTypedMin = (raw) => {
    if (raw === '' || raw === null || raw === undefined) return;
    const n = parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n)) return;
    const v = Math.max(rangeMin, Math.min(n, rangeMax));
    if (v > hi) onMaxChange(v);
    onMinChange(v);
    maybeClearFullRange(v, v > hi ? v : currentMax);
  };

  const applyTypedMax = (raw) => {
    if (raw === '' || raw === null || raw === undefined) return;
    const n = parseFloat(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n)) return;
    const v = Math.max(rangeMin, Math.min(n, rangeMax));
    if (v < lo) onMinChange(v);
    onMaxChange(v);
    maybeClearFullRange(v < lo ? v : currentMin, v);
  };

  const minInputValue =
    minDraft !== null ? minDraft : Number.isFinite(lo) ? String(lo) : '';
  const maxInputValue =
    maxDraft !== null ? maxDraft : Number.isFinite(hi) ? String(hi) : '';

  const commitMinInput = (raw) => {
    setMinDraft(null);
    applyTypedMin(raw);
  };

  const commitMaxInput = (raw) => {
    setMaxDraft(null);
    applyTypedMax(raw);
  };

  return (
    <div className="space-y-3 select-none">
      <div
        ref={trackRef}
        className={`relative h-10 flex items-center ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        onPointerDown={onTrackPointerDown}
        role="presentation"
      >
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-[var(--bg-surface-hover)]" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-[var(--accent-teal)]"
          style={{ left: `${loPct}%`, width: `${Math.max(hiPct - loPct, 0)}%`, minWidth: hiPct > loPct ? undefined : 0 }}
        />
        <button
          type="button"
          data-range-thumb="1"
          aria-label="Minimum value"
          aria-valuemin={rangeMin}
          aria-valuemax={hi}
          aria-valuenow={lo}
          disabled={disabled}
          onPointerDown={(e) => onThumbDown('low', e)}
          className={`absolute w-4 h-4 rounded-full border-2 border-[var(--bg-surface-raised)] shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-teal)] ${dragging === 'low' ? 'z-20 scale-110' : 'z-10'
            }`}
          style={{
            left: `${loPct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'var(--accent-teal)',
            touchAction: 'none',
          }}
        />
        <button
          type="button"
          data-range-thumb="1"
          aria-label="Maximum value"
          aria-valuemin={lo}
          aria-valuemax={rangeMax}
          aria-valuenow={hi}
          disabled={disabled}
          onPointerDown={(e) => onThumbDown('high', e)}
          className={`absolute w-4 h-4 rounded-full border-2 border-[var(--bg-surface-raised)] shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-teal)] ${dragging === 'high' ? 'z-20 scale-110' : 'z-10'
            }`}
          style={{
            left: `${hiPct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'var(--accent-teal)',
            touchAction: 'none',
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] tabular-nums px-0.5 -mt-1">
        <span>{fmt(rangeMin)}</span>
        <span>{fmt(rangeMax)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Min</label>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={minInputValue}
            onFocus={() => {
              if (!disabled) setMinDraft(Number.isFinite(lo) ? String(lo) : '');
            }}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={(e) => commitMinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={disabled}
            className={`w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:border-[var(--accent-teal)] select-text ${disabled ? 'opacity-50 cursor-not-allowed bg-[var(--bg-surface)]' : ''
              }`}
            style={{ backgroundColor: 'var(--bg-surface-raised)' }}
            aria-label="Minimum filter value"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Max</label>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={maxInputValue}
            onFocus={() => {
              if (!disabled) setMaxDraft(Number.isFinite(hi) ? String(hi) : '');
            }}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={(e) => commitMaxInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            disabled={disabled}
            className={`w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:border-[var(--accent-teal)] select-text ${disabled ? 'opacity-50 cursor-not-allowed bg-[var(--bg-surface)]' : ''
              }`}
            style={{ backgroundColor: 'var(--bg-surface-raised)' }}
            aria-label="Maximum filter value"
          />
        </div>
      </div>
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
}) => {
  const [filters, setFilters] = useState({});
  const [categoricalFilters, setCategoricalFilters] = useState({});
  const [filteredCount, setFilteredCount] = useState(null);
  const [filterWorkingSetCount, setFilterWorkingSetCount] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [proprietaryFilterPreviews, setProprietaryFilterPreviews] = useState(null);
  const [activeProprietaryFilter, setActiveProprietaryFilter] = useState(null);
  const [isApplyingProprietaryFilter, setIsApplyingProprietaryFilter] = useState(false);
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
  const [openFilterPopup, setOpenFilterPopup] = useState(null); // Column name for which popup is open
  const [popupSearchQuery, setPopupSearchQuery] = useState(''); // Search query for filtering values in popup
  const [initializedConversationId, setInitializedConversationId] = useState(null); // Prevent re-initializing filters on polling updates
  const [savedFilterPresets, setSavedFilterPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  // useProcessingToast(isApplying ? 'Processing filters...' : null, isApplying);
  const [isRunningAnnovar, setIsRunningAnnovar] = useState(false);
  const [gardenNameInput, setGardenNameInput] = useState('');
  const [gardenNotesInput, setGardenNotesInput] = useState('');
  const [isEditingGardenEntry, setIsEditingGardenEntry] = useState(false);
  const [gardenApplyMissingColumns, setGardenApplyMissingColumns] = useState([]);
  const [isGardenExpanded, setIsGardenExpanded] = useState(false);
  const [isGardenSaveFormOpen, setIsGardenSaveFormOpen] = useState(false);
  const [appliedPresetId, setAppliedPresetId] = useState(null);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const [openColumnGroup, setOpenColumnGroup] = useState(null);
  const [filterPopupParentGroup, setFilterPopupParentGroup] = useState(null);
  const [exomiserEligibility, setExomiserEligibility] = useState(null);
  const [isFetchingExomiserEligibility, setIsFetchingExomiserEligibility] = useState(false);
  const proprietaryPreviewLoadedForRef = useRef(null);

  // Define isGuest early so it can be used in functions below
  const isGuest = userTier === 'guest';
  // Manual filters can narrow the ACMG (or other) Postgres working set; proprietary apply still
  // requires manual filters to be reset first (see handleApplyProprietaryFilter).
  const isManualFiltersDisabled = false;
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

    // Don't apply filters if there's no variant data
    if (!variantData || !variantData.total_variants || variantData.total_variants === 0) {
      notify({
        message: 'No variant data available. Please upload a variant file first.',
        type: 'error'
      });
      return false;
    }

    setIsApplying(true);
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const API_URL = apiUrl('/api/filter-variants');

      const filterObject = buildFilterPayloadFromState(filters, categoricalFilters);

      console.log('[VariantFilterSidebar] Applying filters:', filterObject);
      console.log('[VariantFilterSidebar] Numeric filters state:', filters);
      console.log('[VariantFilterSidebar] Categorical filters state:', categoricalFilters);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    }
  };

  const resetFilters = async () => {
    if (!conversationId || !userId) return;

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
    // Show processing notification via parent component
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('showProcessing', { detail: { message: 'Resetting filters...' } }));
    }
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const API_URL = apiUrl('/api/filter-variants');

      // Send empty filters object to clear all filters
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
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
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
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
    setIsApplyingPreset(true);
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
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
    }
  };

  const handleDeleteSelectedGarden = async (overrideId) => {
    const presetId = overrideId || selectedPresetId;
    if (!presetId || !userId || isGuest) return;
    if (!window.confirm('Delete this Filter Garden entry?')) return;
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
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
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
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

  const handleRunAnnovarFromGarden = async () => {
    if (!conversationId || !userId || isGuest || isRunningAnnovar) return;
    setIsRunningAnnovar(true);
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/run-annovar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          'X-Device-Id': getOrCreateDeviceId(),
        },
        body: JSON.stringify({ conversation_id: conversationId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to run ANNOVAR');
      notify({ message: data.message || 'ANNOVAR finished. Retry apply.', type: 'success' });
      if (typeof onUploadSuccess === 'function') {
        const refreshDoc = currentDocument
          ? {
            ...currentDocument,
            storageType: currentDocument.storageType || 's3',
            is_variant_file: true
          }
          : {
            storageType: 's3',
            is_variant_file: true
          };
        await onUploadSuccess(refreshDoc);
      }
    } catch (error) {
      notify({ message: error.message || 'Failed to try ANNOVAR.', type: 'error' });
    } finally {
      setIsRunningAnnovar(false);
    }
  };

  // Load proprietary filter previews
  const loadProprietaryFilterPreviews = async () => {
    if (!conversationId || !userId) return;

    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

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
    if (!conversationId || !userId) return;
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

    setIsApplyingProprietaryFilter(true);
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const API_URL = apiUrl('/api/apply-proprietary-filter');

      const apiBase = getApiOrigin();

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          'X-Device-Id': getOrCreateDeviceId(),
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
          if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('showProcessing', {
              detail: { message: 'Applying ACMG filter to your annotated file…' },
            }));
          }
          const pollResult = await pollFilterJobStatus(conversationId, token, apiBase, (msg) => {
            if (window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('showProcessing', { detail: { message: msg } }));
            }
          });
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
    }
  };

  // Remove proprietary filter
  const handleRemoveProprietaryFilter = async () => {
    if (!conversationId || !userId) return;

    setIsApplyingProprietaryFilter(true);
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const API_URL = apiUrl('/api/remove-proprietary-filter');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
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
    if (activeProprietaryFilter === 'filter_3') return 'Exomiser';
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

  const handleTabSwitch = (targetMode) => {
    if (targetMode === filterMode) return;
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

  // Always show sidebar, but with different content based on state
  if (!isOpen) {
    return null;
  }

  // If no variant data, show upload prompt
  if (!variantData || (
    (!variantData.parameter_ranges || Object.keys(variantData.parameter_ranges).length === 0) &&
    (!variantData.categorical_columns || Object.keys(variantData.categorical_columns).length === 0)
  )) {
    return (
      <div className="variant-filter-sidebar w-full h-full flex flex-col min-w-0">
        <div className="sidebar-header flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--text-secondary)]" />
            Variant Filters
          </h3>
        </div>
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
          <Upload className="w-12 h-12 text-[var(--text-tertiary)] mb-4" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Upload Variant File</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Upload a TSV or CSV variant calling result file to enable filtering and analysis
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

  return (
    <div className="variant-filter-sidebar w-full h-full flex flex-col min-w-0 relative">
      <div className="h-full flex flex-col">
        {/* Header — tabs inline, actions on the right */}
        <div className="sidebar-header flex">
          <div className="flex-1 min-w-0">
            {(() => {
              const TABS = [
                { key: 'manual', label: 'Manual', filterKey: null },
                { key: 'acmg', label: 'ACMG', filterKey: 'filter_1' },
                { key: 'exomiser', label: 'Exomiser', filterKey: 'filter_3' },
              ];
              const activeIndex = TABS.findIndex((t) => t.key === filterMode);
              const focusTab = (i) => {
                const el = document.getElementById(`filter-tab-${TABS[i].key}`);
                if (el) el.focus();
              };
              const onTablistKeyDown = (e) => {
                switch (e.key) {
                  case 'ArrowRight':
                  case 'ArrowDown':
                    e.preventDefault();
                    focusTab((activeIndex + 1) % TABS.length);
                    break;
                  case 'ArrowLeft':
                  case 'ArrowUp':
                    e.preventDefault();
                    focusTab((activeIndex - 1 + TABS.length) % TABS.length);
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
              const renderCount = (filterKey) => {
                if (!filterKey) return null;
                // Exomiser (filter_3) has no preview count — only show the count once it's active.
                if (filterKey === 'filter_3') {
                  if (activeProprietaryFilter === 'filter_3') {
                    return (
                      <span className="ml-1 opacity-70 tabular-nums">
                        ({filteredCount != null ? filteredCount.toLocaleString() : '…'})
                      </span>
                    );
                  }
                  return null;
                }
                if (proprietaryFilterPreviews == null) {
                  return (
                    <span className="ml-1.5 inline-block h-2.5 w-6 align-middle rounded bg-[var(--bg-surface-hover)] animate-pulse" aria-hidden />
                  );
                }
                if (filterKey === 'filter_1' && activeProprietaryFilter === 'filter_1') {
                  return (
                    <span className="ml-1 opacity-70 tabular-nums">
                      ({filteredCount != null ? filteredCount.toLocaleString() : '…'})
                    </span>
                  );
                }
                const count = proprietaryFilterPreviews?.[filterKey]?.preview_count;
                if (count == null) return null;
                return <span className="ml-1 opacity-70 tabular-nums">({count.toLocaleString()})</span>;
              };
              return (
                <div
                  className="flex shrink-0 rounded-lg overflow-hidden"
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
                        className={`flex-1 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-teal)] ${
                          selected
                            ? 'bg-[var(--accent-teal)] text-[var(--bg-app)]'
                            : 'bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        {t.label}
                        {/* {renderCount(t.filterKey)} */}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-hidden sidebar-scroll flex flex-col space-y-1 relative">
          {/* Variant Count Display with graphical bar */}
          {hasActiveManualFilters &&
            filterWorkingSetCount != null &&
            filteredCount === 1 &&
            filterWorkingSetCount === 1 &&
            fileTotalVariants > 100 && (
              <div
                className="mx-4 mb-2 p-2.5 rounded-lg border text-xs leading-relaxed"
                style={{ backgroundColor: 'var(--warning-soft)', borderColor: 'var(--warning)', color: 'var(--warning)' }}
              >
                Only 1 variant is loaded in the database. Click <strong>Reset</strong>, then apply ACMG or your first
                sidebar filter again to reload a larger working set.
              </div>
            )}
          {fileTotalVariants > 0 && (
            <div className="sidebar-card">
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">Under consideration</span>
                  {variantData?.sample_only_ingest && (
                    <Popover>
                      <PopoverTrigger
                        className="inline-flex items-center justify-center w-4 h-4 rounded text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                        aria-label="About this file"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="start"
                        sideOffset={6}
                        className="w-72 p-3 text-[12px] leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-surface-raised)] border border-[var(--border-default)] rounded-lg shadow-xl"
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
                              Full file on cloud storage ({annotatedRowBaseline.toLocaleString()} data rows). Column mapping used the first {variantData.interpretation_sample_rows || 50} rows only — not loaded into the database yet. Run ANNOVAR, then apply the ACMG filter (or apply sidebar filters once) to load a working set. Use Reset to clear filters and start over from the full file.
                            </>
                          )
                        ) : (
                          <>
                            Full file on cloud storage. Column mapping used the first {variantData.interpretation_sample_rows || 50} rows only. Run ANNOVAR, then apply the ACMG filter. Use Reset to reload the full file row count.
                          </>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-[var(--accent-teal)]">
                  {underConsiderationCount.toLocaleString()}
                  <span className="text-[var(--text-tertiary)] font-normal">
                    {` / ${displayTotalVariants.toLocaleString()}`}
                  </span>
                </span>
              </div>
              <div
                className="w-full h-1.5 rounded-full overflow-hidden flex bg-[var(--bg-surface-hover)]"
                title={
                  (hasActiveManualFilters || activeProprietaryFilter) &&
                    underConsiderationCount < displayTotalVariants
                    ? `${underConsiderationCount.toLocaleString()} under consideration, ${(displayTotalVariants - underConsiderationCount).toLocaleString()} filtered out`
                    : 'All loaded variants under consideration'
                }
              >
                <div
                  className="h-full bg-[var(--accent-teal)] transition-[width] duration-300"
                  style={{
                    width: displayTotalVariants > 0
                      ? `${Math.max(0, Math.min(100, (underConsiderationCount / displayTotalVariants) * 100))}%`
                      : '0%',
                    minWidth: displayTotalVariants > 0 ? '4px' : 0
                  }}
                />
              </div>
            </div>
          )}

          {/* Remove variant file confirmation dialog */}
          <AlertDialog
            open={removeFileDialogOpen}
            onOpenChange={setRemoveFileDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this variant file?</AlertDialogTitle>
                <AlertDialogDescription>
                  All filters and variant data for this conversation will be cleared. You'll need to upload the file again to run analysis.
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

          {/* Switch-mode confirmation dialog */}
          <AlertDialog
            open={!!pendingTabSwitch}
            onOpenChange={(open) => { if (!open) cancelTabSwitch(); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Switch to {pendingTabSwitch === 'manual' ? 'Manual' : pendingTabSwitch === 'acmg' ? 'ACMG' : 'Exomiser'}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Your current {getCurrentActiveMode() === 'manual' ? 'manual filters' : getCurrentActiveMode() === 'acmg' ? 'ACMG filter' : 'Exomiser prioritization'} will be cleared. You can re-apply after switching.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelTabSwitch}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmTabSwitch}>Switch</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Tab Content */}
          <div
            role="tabpanel"
            id="filter-tabpanel"
            aria-labelledby={`filter-tab-${filterMode}`}
            tabIndex={0}
            className="focus-visible:outline-none flex-1 min-h-0 flex flex-col"
          >
            {/* Filter Garden — compact trigger, opens modal */}
            {filterMode === 'manual' && !isGuest && (
              <button
                type="button"
                onClick={() => setIsGardenExpanded(true)}
                className="w-full sidebar-card mb-1.5 flex items-center justify-between gap-2 hover:bg-[var(--bg-surface)] transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sprout className="w-3.5 h-3.5 text-[var(--accent-teal)] shrink-0" />
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">Filter Garden</span>
                  {appliedPresetId && savedFilterPresets.find(p => p.id === appliedPresetId) ? (
                    <span className="px-1.5 h-[18px] inline-flex items-center gap-1 rounded-full text-[10px] font-semibold bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]">
                      <CheckCircle className="w-2.5 h-2.5" />
                      Active
                    </span>
                  ) : savedFilterPresets.length > 0 ? (
                    <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
                      {savedFilterPresets.length} saved
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)]">Open</span>
              </button>
            )}

            {filterMode === 'manual' && allColumns.length > 0 && (() => {
              // --- Helpers scoped to this block ---
              const columnFilterCount = (colName) => {
                const isNumeric = columnIsNumeric(colName);
                const filter = filters[colName] || {};
                const isCategorical = columnIsCategoricalOnly(colName);
                const selectedValues = categoricalFilters[colName] || [];
                let count = 0;
                if (isNumeric) {
                  if (filter.currentMin !== null && filter.currentMin !== undefined) count++;
                  if (filter.currentMax !== null && filter.currentMax !== undefined) count++;
                } else if (isCategorical) {
                  count = selectedValues.length;
                }
                const appliedFilter = appliedFilters && appliedFilters[colName];
                if (appliedFilter) {
                  if (appliedFilter.min !== undefined || appliedFilter.max !== undefined) {
                    count = (appliedFilter.min !== null && appliedFilter.min !== undefined ? 1 : 0) +
                      (appliedFilter.max !== null && appliedFilter.max !== undefined ? 1 : 0);
                  } else if (appliedFilter.values && Array.isArray(appliedFilter.values)) {
                    count = appliedFilter.values.length;
                  }
                }
                return count;
              };

              const renderRow = (colName, parentGroup = null) => {
                const isColumnUnusable = noValidValuesColumns.includes(colName);
                const isOpen = openFilterPopup === colName;
                const isDisabled = isManualFiltersDisabled || isColumnUnusable;
                const count = columnFilterCount(colName);
                return (
                  <button
                    key={colName}
                    onClick={() => {
                      if (isDisabled) return;
                      if (parentGroup) {
                        setOpenColumnGroup(null);
                        setFilterPopupParentGroup(parentGroup);
                      } else {
                        setFilterPopupParentGroup(null);
                      }
                      setOpenFilterPopup(colName);
                      setPopupSearchQuery('');
                    }}
                    disabled={isDisabled}
                    aria-pressed={isOpen}
                    className={`group w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-teal)] ${
                      isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : `cursor-pointer hover:bg-[var(--bg-surface-hover)] ${isOpen ? 'bg-[var(--bg-surface-hover)]' : ''}`
                    }`}
                  >
                    <span
                      className={`text-[13px] truncate flex-1 ${isOpen ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'} ${isColumnUnusable ? 'text-[var(--text-tertiary)]' : ''}`}
                    >
                      {colName}
                    </span>
                    {count > 0 && (
                      <span className="px-1.5 h-[18px] inline-flex items-center rounded-full text-[10px] font-semibold tabular-nums bg-[var(--accent-teal-soft)] text-[var(--accent-teal)] flex-shrink-0">
                        {count}
                      </span>
                    )}
                  </button>
                );
              };

              const q = columnSearchQuery.trim().toLowerCase();
              const searchMatches = q
                ? allColumns.filter((c) => c.toLowerCase().includes(q))
                : null;
              const grouped = searchMatches ? null : groupColumns(allColumns);

              const openGroupCols = openColumnGroup
                ? (groupColumns(allColumns).find(([g]) => g === openColumnGroup)?.[1] || [])
                : [];

              return (
                <>
                <div className="flex flex-col flex-1 min-h-0 space-y-1.5">
                  {/* Search box */}
                  <div className="relative shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)] pointer-events-none" />
                    <input
                      type="text"
                      value={columnSearchQuery}
                      onChange={(e) => setColumnSearchQuery(e.target.value)}
                      placeholder="Search columns…"
                      className="w-full h-8 pl-8 pr-8 text-[12px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-teal)] transition-colors"
                    />
                    {columnSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setColumnSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Body: search results OR grouped */}
                  <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
                    {searchMatches ? (
                      searchMatches.length === 0 ? (
                        <p className="p-4 text-[11px] text-[var(--text-tertiary)] italic text-center">
                          No columns match &ldquo;{columnSearchQuery}&rdquo;
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--border-subtle)]">
                          {searchMatches.map(renderRow)}
                        </div>
                      )
                    ) : (
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {grouped.map(([groupName, cols]) => {
                          const activeCount = cols.reduce((acc, c) => acc + (columnFilterCount(c) > 0 ? 1 : 0), 0);
                          return (
                            <button
                              key={groupName}
                              type="button"
                              onClick={() => setOpenColumnGroup(groupName)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-[var(--bg-surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-teal)]"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                                  {groupName}
                                </span>
                                <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                                  {cols.length}
                                </span>
                                {activeCount > 0 && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-[var(--accent-teal)]"
                                    aria-label={`${activeCount} active filter${activeCount === 1 ? '' : 's'}`}
                                  />
                                )}
                              </div>
                              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] -rotate-90" aria-hidden />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Group columns modal */}
                <Dialog open={!!openColumnGroup} onOpenChange={(open) => { if (!open) setOpenColumnGroup(null); }}>
                  <DialogContent
                    className="!max-w-md w-full max-h-[min(80vh,640px)] flex flex-col p-0 gap-0 overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
                  >
                    <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border-subtle)]">
                      <DialogTitle className="text-base font-semibold text-[var(--text-primary)]">
                        {openColumnGroup}
                      </DialogTitle>
                      <DialogDescription className="text-[12px] text-[var(--text-tertiary)] mt-1">
                        {openGroupCols.length} column{openGroupCols.length === 1 ? '' : 's'} · click a column to configure its filter
                      </DialogDescription>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                      {openGroupCols.map((c) => renderRow(c, openColumnGroup))}
                    </div>
                  </DialogContent>
                </Dialog>
                </>
              );
            })()}

            {filterMode === 'acmg' && (
              <div className="sidebar-card rounded-lg shadow-sm">
                <label className="block text-sm font-bold text-[var(--text-primary)] mb-3">
                  ACMG Filter
                </label>
                <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                  {PROPRIETARY_FILTER_1_DESCRIPTION}
                </p>
                {proprietaryFilterPreviews?.filter_1 ? (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {proprietaryFilterPreviews.filter_1.preview_pending && activeProprietaryFilter !== 'filter_1'
                          ? 'Apply to load preview count'
                          : ''
                        }
                      </span>
                    </div>
                    {activeProprietaryFilter === 'filter_1' ? (
                      <button
                        type="button"
                        onClick={() => handleApplyProprietaryFilter('filter_1')}
                        disabled={isApplyingProprietaryFilter}
                        className="w-full px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                        style={{ borderColor: 'var(--error)', color: 'var(--error)', backgroundColor: 'var(--bg-surface-raised)' }}
                      >
                        {isApplyingProprietaryFilter ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Removing...
                          </span>
                        ) : (
                          'Remove ACMG Filter'
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApplyProprietaryFilter('filter_1')}
                        disabled={
                          !proprietaryFilterPreviews.filter_1.can_apply ||
                          isApplyingProprietaryFilter
                        }
                        className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: 'var(--accent-teal)' }}
                      >
                        {isApplyingProprietaryFilter ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Applying...
                          </span>
                        ) : (
                          'Apply ACMG Filter'
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)] italic">
                    ACMG filter previews are loading...
                  </p>
                )}
              </div>
            )}

            {filterMode === 'exomiser' && (() => {
              const isActive = activeProprietaryFilter === 'filter_3';
              const canRun = exomiserEligibility?.can_run === true;
              const reasons = exomiserEligibility?.reasons || [];
              const exoStatus = (exomiserStatus?.status || '').toLowerCase();
              const failed = exoStatus === 'failed' || exoStatus === 'error';
              const running = !failed && (isRunningExomiser || (exoStatus && !['done', 'complete'].includes(exoStatus)));
              const rawFailure = exomiserStatus?.error || exomiserStatus?.message || '';
              const failureDetail = failed
                ? (/no valid hpo/i.test(rawFailure)
                    ? 'Could not derive valid HPO terms from the phenotype description. Edit the sample metadata with a clearer clinical phenotype (specific symptoms or HPO terms), then retry.'
                    : (rawFailure || 'Exomiser did not complete successfully.'))
                : null;
              const REASON_LABELS = {
                germline_only: 'Analysis type must be Germline.',
                phenotype_required: 'Add a phenotype description to the sample metadata (edit the file pill).',
                annovar_required: 'Run ANNOVAR first — Exomiser requires an annotated file.',
                proprietary_filter_active: 'Another proprietary filter is active. Remove it first.',
                manual_filter_active: 'Manual filters are active. Reset them first.',
                manual_filters_active: 'Manual filters are active. Reset them first.',
                variant_limit_exceeded: 'File exceeds the Exomiser variant limit.',
                not_configured: 'Exomiser service is not configured on the server.',
                genome_build_mismatch: 'Genome build mismatch — resolve in sample metadata.',
                job_running: 'An Exomiser job is already running on this conversation.',
              };
              return (
                <div className="sidebar-card rounded-lg shadow-sm">
                  <label className="block text-sm font-bold text-[var(--text-primary)] mb-2">
                    Exomiser
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                    {EXOMISER_FILTER_DESCRIPTION}
                  </p>

                  {/* Progress area while running */}
                  {running && (
                    <div className="mb-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3.5 h-3.5 border-2 border-[var(--accent-teal)] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[12px] font-medium text-[var(--text-primary)]">
                          {exomiserStatus?.message || 'Starting Exomiser…'}
                        </span>
                      </div>
                      {exomiserStatus?.progress_percent != null && (
                        <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent-teal)] transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, Number(exomiserStatus.progress_percent)))}%` }}
                          />
                        </div>
                      )}
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                        This can take several minutes. You can leave this tab open or come back later.
                      </p>
                    </div>
                  )}

                  {/* Failure banner */}
                  {failed && failureDetail && (
                    <div className="mb-3 p-3 rounded-lg border text-[12px]" style={{ borderColor: 'var(--error)', backgroundColor: 'var(--error-soft)', color: 'var(--error)' }}>
                      <div className="font-medium mb-0.5">Exomiser failed</div>
                      <div className="leading-relaxed">{failureDetail}</div>
                    </div>
                  )}

                  {/* Eligibility issues (only if not running and not active) */}
                  {!running && !failed && !isActive && !canRun && reasons.length > 0 && (
                    <div className="mb-3 p-3 rounded-lg sidebar-warning-banner border text-[12px] space-y-1">
                      <div className="font-medium mb-1">Cannot run Exomiser yet:</div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {reasons.map((r) => (
                          <li key={r}>{REASON_LABELS[r] || r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Loading eligibility */}
                  {!running && !isActive && isFetchingExomiserEligibility && !exomiserEligibility && (
                    <p className="text-xs text-[var(--text-tertiary)] italic mb-3">
                      Checking eligibility…
                    </p>
                  )}

                  {/* Action buttons */}
                  {isActive ? (
                    <button
                      type="button"
                      onClick={() => handleApplyProprietaryFilter('filter_3')}
                      disabled={isApplyingProprietaryFilter}
                      className="w-full px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                      style={{ borderColor: 'var(--error)', color: 'var(--error)', backgroundColor: 'var(--bg-surface-raised)' }}
                    >
                      {isApplyingProprietaryFilter ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Removing…
                        </span>
                      ) : (
                        'Remove Exomiser prioritization'
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runExomiser && runExomiser()}
                      disabled={!canRun || running || !runExomiser}
                      className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--accent-teal)' }}
                    >
                      {running ? 'Running…' : failed ? 'Retry Exomiser' : 'Run Exomiser'}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Floating Filter Popup */}
        {openFilterPopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50" onClick={() => {
            setOpenFilterPopup(null);
            setFilterPopupParentGroup(null);
            setPopupSearchQuery(''); // Clear search when closing
          }}>
            <div
              className="bg-[var(--bg-surface-raised)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              style={{ margin: '20px' }}
            >
              {/* Popup Header */}
              <div className="sidebar-modal-header flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2 min-w-0">
                  {filterPopupParentGroup && (
                    <button
                      type="button"
                      onClick={() => {
                        const parent = filterPopupParentGroup;
                        setOpenFilterPopup(null);
                        setPopupSearchQuery('');
                        setFilterPopupParentGroup(null);
                        setOpenColumnGroup(parent);
                      }}
                      className="p-1 rounded hover:bg-[var(--bg-surface-hover)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0"
                      aria-label={`Back to ${filterPopupParentGroup}`}
                      title={`Back to ${filterPopupParentGroup}`}
                    >
                      <ChevronDown className="w-5 h-5 rotate-90" />
                    </button>
                  )}
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">{openFilterPopup}</h3>
                </div>
                <button
                  onClick={() => {
                    setOpenFilterPopup(null);
                    setFilterPopupParentGroup(null);
                    setPopupSearchQuery(''); // Clear search when closing
                  }}
                  className="p-1 rounded hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>

              {/* Popup Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {(() => {
                  const colName = openFilterPopup;
                  const allValues = allUniqueValues[colName] || [];
                  const isNumeric = columnIsNumeric(colName);
                  const range = ranges[colName];
                  const filter = filters[colName] || {};
                  const isCategorical = columnIsCategoricalOnly(colName);
                  const selectedValues = categoricalFilters[colName] || [];
                  const catData = categoricalColumns[colName];
                  const isColumnUnusable = noValidValuesColumns.includes(colName);

                  // If interpretation marked this column as having no valid values,
                  // show an info message instead of interactive controls.
                  if (isColumnUnusable) {
                    return (
                      <div className="text-sm text-[var(--text-secondary)]">
                        This column was detected but all sampled values look invalid. Manual filtering here may be meaningless.
                      </div>
                    );
                  }

                  // Show single value if column has only one unique value
                  if (allValues.length === 1) {
                    return (
                      <div className="text-sm text-[var(--text-secondary)]">
                        This column has only one value: <span className="font-medium">{allValues[0] === 'Empty' ? 'Empty' : allValues[0]}</span>
                      </div>
                    );
                  }

                  // Numeric filter controls (dual-thumb range slider)
                  if (isNumeric && range) {
                    const span = range.max - range.min;
                    // Preset chips — pick sensible defaults per column type.
                    const isFrequencyColumn = /(^|_)(af|maf|freq|gnomad|1000g|all\.sites)/i.test(colName);
                    const presets = (isFrequencyColumn && range.min === 0 && range.max <= 1)
                      ? [
                          { label: '< 0.001', min: null, max: 0.001 },
                          { label: '< 0.01', min: null, max: 0.01 },
                          { label: '< 0.05', min: null, max: 0.05 },
                        ]
                      : span > 0
                        ? [
                            { label: 'Bottom 10%', min: null, max: range.min + span * 0.1 },
                            { label: 'Bottom 25%', min: null, max: range.min + span * 0.25 },
                            { label: 'Top 25%', min: range.min + span * 0.75, max: null },
                            { label: 'Top 10%', min: range.min + span * 0.9, max: null },
                          ]
                        : [];
                    return (
                      <div className="space-y-3">
                        {presets.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-[var(--text-tertiary)] mr-1">Quick:</span>
                            {presets.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => {
                                  handleFilterChange(colName, 'Min', p.min);
                                  handleFilterChange(colName, 'Max', p.max);
                                }}
                                disabled={isManualFiltersDisabled}
                                className="h-6 px-2 rounded-md text-[11px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-teal)] hover:text-[var(--accent-teal)] hover:bg-[var(--accent-teal-soft)] transition-colors disabled:opacity-50"
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
                          disabled={isManualFiltersDisabled}
                          onMinChange={(v) => handleFilterChange(colName, 'Min', v)}
                          onMaxChange={(v) => handleFilterChange(colName, 'Max', v)}
                        />
                      </div>
                    );
                  }

                  // Categorical filter controls
                  if (isCategorical && catData) {
                    // Filter values based on search query
                    const filteredValues = popupSearchQuery
                      ? catData.values.filter(val =>
                        String(val).toLowerCase().includes(popupSearchQuery.toLowerCase())
                      )
                      : catData.values;

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-[var(--text-secondary)]">
                            Select values ({filteredValues.length} of {catData.count} shown):
                          </div>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
                          <input
                            type="text"
                            placeholder="Search values..."
                            value={popupSearchQuery}
                            onChange={(e) => setPopupSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:border-gray-400"
                            style={{ backgroundColor: 'var(--bg-surface-raised)' }}
                          />
                        </div>

                        <div className="space-y-1 max-h-96 overflow-y-auto border border-[var(--border-default)] rounded p-2">
                          {filteredValues.length > 0 ? (
                            filteredValues.map((value) => (
                              <label key={value} className={`flex items-center gap-2 text-sm p-2 rounded ${isManualFiltersDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[var(--bg-surface-hover)]'
                                }`}>
                                <Checkbox
                                  checked={selectedValues.includes(value)}
                                  onCheckedChange={(checked) => !isManualFiltersDisabled && handleCategoricalChange(colName, value, checked === true)}
                                  disabled={isManualFiltersDisabled}
                                  className="aria-checked:bg-[var(--accent-teal)] aria-checked:border-[var(--accent-teal)] aria-checked:text-white"
                                />
                                <span className="truncate flex-1">{value === 'Empty' ? 'Empty' : value}</span>
                              </label>
                            ))
                          ) : (
                            <div className="text-sm text-[var(--text-secondary)] text-center py-4">
                              No values match "{popupSearchQuery}"
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Not filterable
                  return (
                    <div className="text-sm text-[var(--text-secondary)]">
                      <div className="font-medium mb-2">Not filterable:</div>
                      <div className="text-[var(--text-tertiary)] italic">
                        {(() => {
                          const uniqueCount = allValues.length;
                          if (uniqueCount === 0) {
                            return "No values found";
                          } else if (uniqueCount === 1) {
                            return "Only one unique value (no filtering needed)";
                          } else {
                            return "Mixed or non-standard format - use chatbot to query this column";
                          }
                        })()}
                      </div>
                      <div className="text-[var(--text-tertiary)] mt-2">
                        Available to chatbot for analysis
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Popup Footer */}
              <div className="sidebar-modal-footer p-4 border-t flex flex-wrap justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const colName = openFilterPopup;
                    const isNumericReset = columnIsNumeric(colName);

                    if (isNumericReset) {
                      setFilters(prev => ({
                        ...prev,
                        [colName]: {
                          ...prev[colName],
                          currentMin: null,
                          currentMax: null
                        }
                      }));
                    } else {
                      setCategoricalFilters(prev => ({
                        ...prev,
                        [colName]: []
                      }));
                    }
                  }}
                  disabled={isManualFiltersDisabled}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${isManualFiltersDisabled
                      ? 'opacity-50 cursor-not-allowed bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
                      : 'text-[var(--text-primary)] bg-[var(--bg-surface-raised)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <div className="flex gap-2 flex-1 justify-end min-w-0">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await applyFilters();
                      if (ok) {
                        setOpenFilterPopup(null);
                        setFilterPopupParentGroup(null);
                        setPopupSearchQuery('');
                      }
                    }}
                    disabled={isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges}
                    title={
                      isManualFiltersDisabled
                        ? undefined
                        : isApplying
                          ? undefined
                          : !hasUnappliedFilterChanges
                            ? 'No changes to apply — selection matches what is already applied'
                            : 'Apply all current filter settings to the variant set'
                    }
                    className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 text-white ${isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:opacity-90'
                      }`}
                    style={{
                      backgroundColor:
                        isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges
                          ? 'var(--text-tertiary)'
                          : 'var(--accent-teal)'
                    }}
                  >
                    {isApplying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-[var(--bg-app)] border-t-transparent rounded-full animate-spin" />
                        Applying…
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Apply filters
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFilterPopup(null);
                      setFilterPopupParentGroup(null);
                      setPopupSearchQuery('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer with Actions */}
        <div className="shrink-0 px-3.5 py-2 border-t border-[var(--border-subtle)]">
          {/* Show pending filters (set but not yet applied) — Manual tab only */}
          {filterMode === 'manual' && (() => {
            if (!hasUnappliedFilterChanges) return null;
            const pendingFilters = [];
            for (const param in filters) {
              const filter = filters[param];
              if (filter && (filter.currentMin !== null || filter.currentMax !== null)) {
                const isApplied = appliedFilters && appliedFilters[param];
                if (!isApplied) {
                  pendingFilters.push(param);
                }
              }
            }
            for (const param in categoricalFilters) {
              const selected = categoricalFilters[param];
              if (selected && Array.isArray(selected) && selected.length > 0) {
                const isApplied = appliedFilters && appliedFilters[param];
                if (!isApplied) {
                  pendingFilters.push(param);
                }
              }
            }
            return (
              <div className="sidebar-pending-banner p-2 border rounded-lg">
                <div className="text-xs font-medium mb-1">
                  {pendingFilters.length > 0
                    ? `Pending filters (not yet applied): ${pendingFilters.join(', ')}`
                    : 'You have unapplied filter changes.'}
                </div>
                <div className="text-xs">
                  Apply from the column popup or use &quot;Apply Filters&quot; below to commit changes.
                </div>
              </div>
            );
          })()}

          <div className="flex gap-2">
            {filterMode === 'manual' && (
              <button
                type="button"
                onClick={applyFilters}
                disabled={isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges}
                title={
                  isManualFiltersDisabled
                    ? undefined
                    : isApplying
                      ? undefined
                      : !hasUnappliedFilterChanges
                        ? 'No changes to apply — adjust filters first'
                        : 'Apply all current filter settings'
                }
                className={`flex-1 h-9 px-3 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-[var(--bg-app)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges
                    ? 'opacity-50 cursor-not-allowed bg-[var(--text-tertiary)]'
                    : 'bg-[var(--accent-teal)] hover:brightness-110'
                  }`}
              >
                {isApplying ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[var(--bg-app)] border-t-transparent rounded-full animate-spin" />
                    Applying
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    Apply
                  </>
                )}
              </button>
            )}

            <button
              onClick={resetFilters}
              disabled={isApplying}
              title={
                isGuest
                  ? 'Clear all filters and restore all preview variants for chat'
                  : 'Clear all active filters (manual and proprietary) and restore all variants'
              }
              className={`flex-1 h-9 px-3 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium whitespace-nowrap border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] ${isApplying ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset all
            </button>
          </div>
        </div>

        {/* Sticky footer: primary export action, always visible */}
        {!isGuest && variantData && (
          <div className="shrink-0 px-3.5 py-2 bg-[var(--bg-sidebar)]">
            <ExportVariantsButton
              conversationId={conversationId}
              variantData={variantData}
              filteredCount={filteredCount}
              isGuest={isGuest}
            />
          </div>
        )}
      </div>

      {/* Filter Garden Modal */}
      <Dialog open={isGardenExpanded} onOpenChange={(open) => {
        setIsGardenExpanded(open);
        if (!open) {
          setIsGardenSaveFormOpen(false);
          setIsEditingGardenEntry(false);
          setGardenApplyMissingColumns([]);
        }
      }}>
        <DialogContent
          className="!max-w-lg w-full max-h-[min(85vh,700px)] flex flex-col p-0 gap-0 overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
        >
          <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border-subtle)]">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
              <Sprout className="w-4 h-4 text-[var(--accent-teal)]" />
              Filter Garden
            </DialogTitle>
            <DialogDescription className="text-[12px] text-[var(--text-tertiary)] mt-1">
              Save your manual filters as presets and apply them across variant files.
            </DialogDescription>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            

            {/* Preset list */}
            {savedFilterPresets.length === 0 ? (
              <div className="text-center py-10">
                <Sprout className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" />
                <p className="text-[13px] text-[var(--text-secondary)]">No saved presets yet.</p>
                <p className="text-[11px] text-[var(--text-disabled)] mt-1">Save your current filters to see them here.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {savedFilterPresets.map((preset) => {
                  const isActive = appliedPresetId === preset.id;
                  const isEditing = isEditingGardenEntry && selectedPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`group rounded-lg overflow-hidden border transition-all ${
                        isActive
                          ? 'border-[var(--accent-teal)]/50 bg-[var(--accent-teal-soft)]'
                          : 'border-[var(--border-subtle)] hover:border-[var(--border-default)] bg-[var(--bg-surface)]'
                      }`}
                    >

                      {isEditing ? (
                        <div className="p-3 space-y-2">
                          <input
                            type="text"
                            value={gardenNameInput}
                            onChange={(e) => setGardenNameInput(e.target.value)}
                            autoFocus
                            maxLength={80}
                            className="w-full px-2.5 py-1.5 text-[13px] border border-[var(--border-default)] rounded-md bg-[var(--bg-input)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]"
                          />
                          <textarea
                            value={gardenNotesInput}
                            onChange={(e) => setGardenNotesInput(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="Notes"
                            className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--border-default)] rounded-md bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)] resize-none"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={handleUpdateSelectedGarden}
                              className="h-7 px-3 rounded-md text-[11px] font-medium bg-[var(--accent-teal)] text-[var(--bg-app)] hover:brightness-110"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingGardenEntry(false)}
                              className="h-7 px-3 rounded-md text-[11px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 py-2.5 pl-3.5 pr-2">
                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="min-w-0">
                              <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate block">
                                {preset.name}
                              </span>
                            </div>
                            {preset.notes && (
                              <div className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">{preset.notes}</div>
                            )}
                            <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5">
                              <span>{(preset.required_columns || []).length} col{(preset.required_columns || []).length === 1 ? '' : 's'}</span>
                              {preset.metadata?.genome_build && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span>{preset.metadata.genome_build}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            {isActive ? (
                              <button
                                type="button"
                                title="Deactivate this preset and clear its filters"
                                onClick={resetFilters}
                                disabled={isApplying}
                                className="h-7 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 text-[var(--accent-teal)] hover:bg-[var(--accent-teal)]/15 transition-colors disabled:opacity-50"
                              >
                                <X className="w-3 h-3" />
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Apply preset"
                                onClick={() => handleApplySelectedGarden(preset.id)}
                                disabled={isApplyingPreset}
                                className="h-7 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 border border-[var(--accent-teal)]/60 text-[var(--accent-teal)] hover:bg-[var(--accent-teal-soft)] hover:border-[var(--accent-teal)] transition-colors disabled:opacity-50"
                              >
                                Apply
                              </button>
                            )}
                            {/* <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" aria-hidden /> */}
                            <button
                              type="button"
                              title="Edit name/notes"
                              onClick={() => {
                                setSelectedPresetId(preset.id);
                                setIsEditingGardenEntry(true);
                                setGardenNameInput(preset.name || '');
                                setGardenNotesInput(preset.notes || '');
                              }}
                              className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                            >
                              <PencilLine className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete preset"
                              onClick={() => handleDeleteSelectedGarden(preset.id)}
                              className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedPresetId === preset.id && gardenApplyMissingColumns.length > 0 && (
                        <div className="mx-3 mb-3 p-2 rounded-md text-[11px] sidebar-warning-banner border">
                          <div className="font-medium mb-1">Missing columns: {gardenApplyMissingColumns.join(', ')}</div>
                          <button
                            type="button"
                            onClick={handleRunAnnovarFromGarden}
                            disabled={isRunningAnnovar}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium underline"
                          >
                            <img src={qiagenLogo} alt="" className="w-3 h-3 object-contain" />
                            {isRunningAnnovar ? 'Running ANNOVAR...' : 'Try ANNOVAR'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Save current filters */}
            {!isGardenSaveFormOpen ? (
              <button
                type="button"
                onClick={() => {
                  setIsGardenSaveFormOpen(true);
                  setGardenNameInput('');
                  setGardenNotesInput('');
                }}
                disabled={!hasAppliedManualFilters && Object.keys(pendingFilterPayload).length === 0}
                title={
                  hasAppliedManualFilters || Object.keys(pendingFilterPayload).length > 0
                    ? 'Save current manual filters as a preset'
                    : 'Set at least one manual filter first'
                }
                className={`w-full h-10 px-3 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium border border-dashed transition-colors ${
                  hasAppliedManualFilters || Object.keys(pendingFilterPayload).length > 0
                    ? 'border-[var(--accent-teal)] text-[var(--accent-teal)] hover:bg-[var(--accent-teal-soft)] cursor-pointer'
                    : 'border-[var(--border-subtle)] text-[var(--text-tertiary)] cursor-not-allowed opacity-50'
                }`}
              >
                + Save current filters as preset
              </button>
            ) : (
              <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-2">
                <input
                  type="text"
                  value={gardenNameInput}
                  onChange={(e) => setGardenNameInput(e.target.value)}
                  placeholder="Preset name"
                  autoFocus
                  maxLength={80}
                  className="w-full px-3 py-2 text-[13px] border border-[var(--border-default)] rounded-md bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)]"
                />
                <textarea
                  value={gardenNotesInput}
                  onChange={(e) => setGardenNotesInput(e.target.value)}
                  rows={2}
                  placeholder="Notes (optional)"
                  maxLength={500}
                  className="w-full px-3 py-2 text-[13px] border border-[var(--border-default)] rounded-md bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-teal)] resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleSaveCurrentToGarden();
                      setIsGardenSaveFormOpen(false);
                    }}
                    disabled={isSavingPreset || !gardenNameInput.trim()}
                    className={`flex-1 h-8 rounded-md text-[12px] font-medium ${
                      isSavingPreset || !gardenNameInput.trim()
                        ? 'opacity-50 cursor-not-allowed bg-[var(--text-tertiary)] text-[var(--bg-app)]'
                        : 'bg-[var(--accent-teal)] text-[var(--bg-app)] hover:brightness-110'
                    }`}
                  >
                    {isSavingPreset ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsGardenSaveFormOpen(false)}
                    className="h-8 px-3 rounded-md text-[12px] font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Processing Notification */}
    </div>
  );
};

export default VariantFilterSidebar;
