import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, X, RotateCcw, CheckCircle, Upload, Trash2, Info, Zap, Search } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import DocumentUpload from './DocumentUpload';
import ProcessingNotification from './ProcessingNotification';
import { apiUrl, getApiOrigin } from '@/config/api';
import qiagenLogo from '../Qiagen.svg.png';

// Proprietary filter descriptions (for tooltips - no exact parameters)
export const ACMG_FILTER_DISPLAY_NAME = 'ACMG filter';

const PROPRIETARY_FILTER_1_DESCRIPTION = "ClinVar and/or InterVar pathogenic classes, with rare gnomAD frequency (<1%) or missing frequency retained.";
const PROPRIETARY_FILTER_2_DESCRIPTION = "Filters for rare, potentially deleterious coding and regulatory variants, including novel candidates, using functional impact and population frequency criteria.";

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

function apiErrorDetailToMessage(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail.message) return detail.message;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || d).join(', ');
  return null;
}

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
      <p className="text-xs text-[var(--text-secondary)]">
        Type bounds and/or drag the handles. Spanning the full bar clears this column&apos;s filter.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Minimum</label>
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
            className={`w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:border-[var(--accent-teal)] select-text ${
              disabled ? 'opacity-50 cursor-not-allowed bg-[var(--bg-surface)]' : ''
            }`}
            style={{ backgroundColor: 'var(--bg-surface-raised)' }}
            aria-label="Minimum filter value"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Maximum</label>
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
            className={`w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)] focus:border-[var(--accent-teal)] select-text ${
              disabled ? 'opacity-50 cursor-not-allowed bg-[var(--bg-surface)]' : ''
            }`}
            style={{ backgroundColor: 'var(--bg-surface-raised)' }}
            aria-label="Maximum filter value"
          />
        </div>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        Allowed range: {fmt(rangeMin)} (min of data) to {fmt(rangeMax)} (max of data).
      </p>
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
          className={`absolute w-4 h-4 rounded-full border-2 border-[var(--bg-surface-raised)] shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-teal)] ${
            dragging === 'low' ? 'z-20 scale-110' : 'z-10'
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
          className={`absolute w-4 h-4 rounded-full border-2 border-[var(--bg-surface-raised)] shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--accent-teal)] ${
            dragging === 'high' ? 'z-20 scale-110' : 'z-10'
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
}) => {
  const [filters, setFilters] = useState({});
  const [categoricalFilters, setCategoricalFilters] = useState({});
  const [filteredCount, setFilteredCount] = useState(null);
  const [filterWorkingSetCount, setFilterWorkingSetCount] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [notification, setNotification] = useState(null);
  const [proprietaryFilterPreviews, setProprietaryFilterPreviews] = useState(null);
  const [activeProprietaryFilter, setActiveProprietaryFilter] = useState(null);
  const [isApplyingProprietaryFilter, setIsApplyingProprietaryFilter] = useState(false);
  const [openFilterPopup, setOpenFilterPopup] = useState(null); // Column name for which popup is open
  const [popupSearchQuery, setPopupSearchQuery] = useState(''); // Search query for filtering values in popup
  const [initializedConversationId, setInitializedConversationId] = useState(null); // Prevent re-initializing filters on polling updates
  const [savedFilterPresets, setSavedFilterPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  const [isRunningAnnovar, setIsRunningAnnovar] = useState(false);
  const [isGardenModalOpen, setIsGardenModalOpen] = useState(false);
  const [gardenNameInput, setGardenNameInput] = useState('');
  const [gardenNotesInput, setGardenNotesInput] = useState('');
  const [isEditingGardenEntry, setIsEditingGardenEntry] = useState(false);
  const [gardenAction, setGardenAction] = useState('create');
  const [gardenApplyMissingColumns, setGardenApplyMissingColumns] = useState([]);
  const [gardenFeedback, setGardenFeedback] = useState(null);
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
  }, [conversationId]);

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
      setNotification({
        message: 'No variant data available. Please upload a variant file first.',
        type: 'error'
      });
      setTimeout(() => setNotification(null), 3000);
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
          setNotification({
            message:
              'Match count unchanged. If you added a numeric column, narrow its range (full span does not filter). Try a smaller min/max, then Apply again.',
            type: 'warning',
          });
          setTimeout(() => setNotification(null), 7000);
        }

        if (fc === 0 && Object.keys(filterObject).length > 0) {
          setNotification({
            message: 'No variants match these filters. Widen numeric bounds or change categorical selections.',
            type: 'warning',
          });
          setTimeout(() => setNotification(null), 6000);
        }
        
        // IMPORTANT: Keep filter state intact - don't clear the inputs
        // The filters state and categoricalFilters state should remain as-is
        // so users can see what they selected and modify if needed
        
        // Show notification message
        setNotification({
          message: variantData?.sample_only_ingest
            ? `Filters applied on full annotated file: ${(Number.isFinite(fc) ? fc : 0).toLocaleString()} of ${(Number.isFinite(tc) ? tc : displayTotalVariants).toLocaleString()} variants match`
            : `Filters applied: ${(Number.isFinite(fc) ? fc : 0).toLocaleString()} of ${(Number.isFinite(tc) ? tc : displayTotalVariants).toLocaleString()} variants`,
          type: fc === 0 && Object.keys(filterObject).length > 0 ? 'warning' : 'success',
        });
        
        // Auto-hide notification after 4 seconds
        setTimeout(() => setNotification(null), 4000);
        
        if (onFiltersChange) {
          onFiltersChange(filterObject, data.filtered_count, data.total_count, {
            parameter_ranges: data.parameter_ranges,
            numeric_columns: data.numeric_columns,
            parameter_ranges_from_full_file: data.parameter_ranges_from_full_file,
          });
        }
        if (data.parameter_ranges_from_full_file && data.parameter_ranges) {
          setNotification({
            message:
              `Numeric slider bounds now reflect all ${(Number.isFinite(tc) ? tc : data.total_count || 0).toLocaleString()} rows in the annotated file. Narrow a range and Apply again if the count did not change.`,
            type: 'warning',
          });
          setTimeout(() => setNotification(null), 8000);
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
      setNotification({ message: errMessage, type: 'error' });
      setTimeout(() => setNotification(null), 6000);
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
          setNotification({
            message: `Filters reset: All ${data.total_count.toLocaleString()} variants are now under consideration`,
            type: 'success'
          });
          setTimeout(() => setNotification(null), 4000);
        }
        setFilterWorkingSetCount(null);

        if (onFiltersChange) {
          onFiltersChange({}, data.filtered_count, data.total_count);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[VariantFilterSidebar] Reset request failed:', response.status, errorData);
        // Even if backend fails, we've cleared local state, so show a warning
        setNotification({
          message: 'Filters reset locally, but backend update may have failed. Please refresh if needed.',
          type: 'warning'
        });
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error resetting filters:', error);
      // Even if backend fails, we've cleared local state
      setNotification({
        message: 'Filters reset locally, but backend update failed. Please refresh if needed.',
        type: 'warning'
      });
      setTimeout(() => setNotification(null), 4000);
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

  useEffect(() => {
    if (savedFilterPresets.length === 0) {
      setGardenAction('create');
    } else if (gardenAction === 'create') {
      // keep as create unless user switches; do nothing
    } else if (!selectedPresetId) {
      setGardenAction('apply');
    }
  }, [savedFilterPresets, selectedPresetId, gardenAction]);

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

  const handleOpenGardenModal = () => {
    setIsGardenModalOpen(true);
    setIsEditingGardenEntry(false);
    if (savedFilterPresets.length > 0) {
      setGardenAction('apply');
      const current = selectedGardenEntry || savedFilterPresets[0];
      if (current) {
        setSelectedPresetId(current.id);
        setGardenNameInput(current.name || '');
        setGardenNotesInput(current.notes || '');
      }
    } else {
      setGardenAction('create');
      setGardenNameInput('');
      setGardenNotesInput('');
    }
    setGardenApplyMissingColumns([]);
    setGardenFeedback(null);
  };

  const handleSaveCurrentToGarden = async () => {
    if (!conversationId || !userId || isGuest || isManualFiltersDisabled) return;
    const payload = buildFilterPayloadFromState(filters, categoricalFilters);
    const colCount = Object.keys(payload).length;
    if (colCount === 0) {
      setGardenFeedback({ type: 'warning', message: 'Set at least one manual filter before saving.' });
      return;
    }
    if (!gardenNameInput || !gardenNameInput.trim()) {
      setGardenFeedback({ type: 'warning', message: 'Entry name is required.' });
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
      setGardenFeedback({ type: 'success', message: `Saved: "${data.name}".` });
      await loadSavedFilterPresets();
      if (data.id) setSelectedPresetId(data.id);
      setIsEditingGardenEntry(false);
    } catch (error) {
      setGardenFeedback({ type: 'error', message: error.message || 'Failed to save Filter Garden entry.' });
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleApplySelectedGarden = async () => {
    if (!conversationId || !userId || !selectedPresetId || isGuest || isManualFiltersDisabled) return;
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
          preset_id: selectedPresetId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to apply Filter Garden entry');
      if (!data.applied) {
        setGardenApplyMissingColumns(Array.isArray(data.missing_columns) ? data.missing_columns : []);
        setGardenFeedback({
          type: 'warning',
          message: 'Cannot apply this entry to this file. Missing columns are listed above.'
        });
        return;
      }
      setGardenApplyMissingColumns([]);
      const payload = data.active_filters || {};
      applyFilterPayloadToInputs(payload);
      setAppliedFilters(payload);
      setFilteredCount(data.filtered_count ?? null);
      setGardenFeedback({
        type: 'success',
        message: `${data.message || 'Applied.'} ${Number(data.filtered_count || 0).toLocaleString()} / ${Number(data.total_count || 0).toLocaleString()} variants.`
      });
      if (onFiltersChange) {
        onFiltersChange(payload, data.filtered_count, data.total_count);
      }
    } catch (error) {
      setGardenFeedback({ type: 'error', message: error.message || 'Failed to apply Filter Garden entry.' });
    } finally {
      setIsApplyingPreset(false);
    }
  };

  const handleDeleteSelectedGarden = async () => {
    if (!selectedPresetId || !userId || isGuest) return;
    if (!window.confirm('Delete this Filter Garden entry?')) return;
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const base = getApiOrigin();
      const response = await fetch(`${base}/api/saved-filters/${encodeURIComponent(selectedPresetId)}`, {
        method: 'DELETE',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Failed to delete Filter Garden entry');
      setGardenFeedback({ type: 'success', message: 'Entry deleted.' });
      await loadSavedFilterPresets();
    } catch (error) {
      setGardenFeedback({ type: 'error', message: error.message || 'Failed to delete Filter Garden entry.' });
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
      setGardenFeedback({ type: 'success', message: `Updated: "${data.name}".` });
      setIsEditingGardenEntry(false);
      await loadSavedFilterPresets();
    } catch (error) {
      setGardenFeedback({ type: 'error', message: error.message || 'Failed to update Filter Garden entry.' });
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
      setGardenFeedback({ type: 'success', message: data.message || 'ANNOVAR finished. Retry apply.' });
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
      setGardenFeedback({ type: 'error', message: error.message || 'Failed to try ANNOVAR.' });
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
      setNotification({
        message: 'Manual filters are active. Reset manual filters before applying a proprietary filter.',
        type: 'warning'
      });
      setTimeout(() => setNotification(null), 4000);
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
        
        setNotification({
          message: `${filterType === 'filter_1' ? ACMG_FILTER_DISPLAY_NAME : 'Functional Impact'} applied: ${filteredCount.toLocaleString()} variants`,
          type: 'success'
        });
        setTimeout(() => setNotification(null), 4000);
        
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
      setNotification({
        message: error.message || 'Failed to apply recommended filter',
        type: 'error'
      });
      setTimeout(() => setNotification(null), 5000);
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
          conversation_id: conversationId
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
        setNotification({
          message: 'Recommended filter removed',
          type: 'success'
        });
        setTimeout(() => setNotification(null), 4000);
        
        // Notify parent
        if (onFiltersChange) {
          onFiltersChange({ proprietary: null }, data.total_count, data.total_count);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to remove filter');
      }
    } catch (error) {
      console.error('[VariantFilterSidebar] Error removing proprietary filter:', error);
      setNotification({
        message: error.message || 'Failed to remove recommended filter',
        type: 'error'
      });
      setTimeout(() => setNotification(null), 5000);
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
        {/* Header */}
        <div className="sidebar-header flex items-center justify-between">
          <h3 className="text-[var(--text-primary)] flex items-center gap-1">
            <FileText className="w-5 h-5 text-[var(--text-secondary)] shrink-0" />
            Variant File Filters
          </h3>
          <div className="flex items-center gap-2">
            {/* Remove File Button - Show when variant data exists */}
            {(variantData && variantData.total_variants > 0) && (
              <button
                onClick={async () => {
                  if (window.confirm('Are you sure you want to remove this variant file? This will clear all filters and variant data.')) {
                    try {
                      await onUploadSuccess(null);
                      resetFilters();
                    } catch (error) {
                      console.error('[VariantFilterSidebar] Error removing file:', error);
                    }
                  }
                }}
                className="p-1 rounded transition-colors"
                style={{ color: 'var(--error)' }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--error-soft)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                aria-label="Remove variant file"
                title="Remove variant file"
              >
                <Trash2 className="w-5 h-5" style={{ color: 'var(--error)' }} />
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-1 hover:bg-[var(--bg-surface-hover)] rounded transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto sidebar-scroll flex flex-col space-y-3 relative">
          {/* Notification Toast */}
          {notification && (
            <div className={`absolute top-4 left-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border-2 animate-slide-in border-[var(--border-default)] text-[var(--text-primary)] sidebar-card`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">{notification.message}</span>
              </div>
            </div>
          )}

          {/* Recommended Filters Section */}
          {proprietaryFilterPreviews && (
            <div className="sidebar-card rounded-lg shadow-sm">
              <label className="block text-sm font-bold text-[var(--text-primary)] mb-3">
                Recommended Filters
              </label>
              
              {/* Filter 1 Button */}
              {proprietaryFilterPreviews.filter_1 && (
                <div className="mb-2 relative group">
                  <button
                    onClick={() => handleApplyProprietaryFilter('filter_1')}
                    disabled={
                      !proprietaryFilterPreviews.filter_1.can_apply ||
                      isApplyingProprietaryFilter ||
                      (hasAppliedManualFilters && activeProprietaryFilter !== 'filter_1')
                    }
                    className="w-full px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: activeProprietaryFilter === 'filter_1' ? 'var(--accent-teal-soft)' : 'var(--bg-surface-raised)',
                      borderColor: 'var(--accent-teal)'
                    }}
                    onMouseEnter={(e) => {
                      if (!e.target.disabled && activeProprietaryFilter !== 'filter_1') {
                        e.target.style.borderColor = 'var(--accent-teal-hover)';
                        e.target.style.backgroundColor = 'var(--accent-teal-soft)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.target.disabled && activeProprietaryFilter !== 'filter_1') {
                        e.target.style.borderColor = 'var(--accent-teal)';
                        e.target.style.backgroundColor = 'var(--bg-surface-raised)';
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--text-primary)]">
                        {ACMG_FILTER_DISPLAY_NAME}
                      </span>
                      {activeProprietaryFilter === 'filter_1' && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-teal)', color: 'var(--bg-app)' }}>
                          Active
                        </span>
                      )}
                      {!proprietaryFilterPreviews.filter_1.can_apply && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--error)' }}>
                          Missing columns
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        {proprietaryFilterPreviews.filter_1.preview_pending &&
                        activeProprietaryFilter !== 'filter_1' ? (
                          <>
                            <div className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                              Apply to load
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              from {proprietaryFilterPreviews.filter_1.total_count.toLocaleString()} rows
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold" style={{ color: 'var(--accent-teal)' }}>
                              {proprietaryFilterPreviews.filter_1.preview_count} variants
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              of {proprietaryFilterPreviews.filter_1.total_count}
                            </div>
                          </>
                        )}
                      </div>
                      <Info 
                        className="w-4 h-4 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-help"
                        onMouseEnter={(e) => e.stopPropagation()}
                      />
                    </div>
                  </button>
                  {/* Tooltip */}
                  <div className="absolute left-0 top-full mt-1 w-64 p-3 bg-[var(--bg-surface-raised)] border-2 border-[var(--border-default)] rounded-lg shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity pointer-events-none"
                    style={{ borderColor: 'var(--accent-teal)' }}>
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      {PROPRIETARY_FILTER_1_DESCRIPTION || "Filters for high-confidence clinically validated pathogenic variants using ClinVar annotations, functional predictions, and population frequency criteria."}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Filter 2 Button */}
              {proprietaryFilterPreviews.filter_2 && (
                <div className="relative group">
                  <button
                    onClick={() => handleApplyProprietaryFilter('filter_2')}
                    disabled={
                      !proprietaryFilterPreviews.filter_2.can_apply ||
                      isApplyingProprietaryFilter ||
                      (hasAppliedManualFilters && activeProprietaryFilter !== 'filter_2')
                    }
                    className="w-full px-4 py-3 rounded-lg border transition-all flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: activeProprietaryFilter === 'filter_2' ? 'var(--accent-teal-soft)' : 'var(--bg-surface-raised)',
                      borderColor: 'var(--accent-teal)'
                    }}
                    onMouseEnter={(e) => {
                      if (!e.target.disabled && activeProprietaryFilter !== 'filter_2') {
                        e.target.style.borderColor = 'var(--accent-teal-hover)';
                        e.target.style.backgroundColor = 'var(--accent-teal-soft)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.target.disabled && activeProprietaryFilter !== 'filter_2') {
                        e.target.style.borderColor = 'var(--accent-teal)';
                        e.target.style.backgroundColor = 'var(--bg-surface-raised)';
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--text-primary)]">
                        {proprietaryFilterPreviews.filter_2.name}
                      </span>
                      {activeProprietaryFilter === 'filter_2' && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-teal)', color: 'var(--bg-app)' }}>
                          Active
                        </span>
                      )}
                      {!proprietaryFilterPreviews.filter_2.can_apply && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--error)' }}>
                          Missing columns
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: 'var(--accent-teal)' }}>
                          {proprietaryFilterPreviews.filter_2.preview_count} variants
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          of {proprietaryFilterPreviews.filter_2.total_count}
                        </div>
                      </div>
                      <Info 
                        className="w-4 h-4 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-help"
                        onMouseEnter={(e) => e.stopPropagation()}
                      />
                    </div>
                  </button>
                  {/* Tooltip */}
                  <div className="absolute left-0 top-full mt-1 w-64 p-3 bg-[var(--bg-surface-raised)] border-2 border-[var(--border-default)] rounded-lg shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity pointer-events-none"
                    style={{ borderColor: 'var(--accent-teal)' }}>
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      {PROPRIETARY_FILTER_2_DESCRIPTION || "Filters for rare, potentially deleterious coding and regulatory variants, including novel candidates, using functional impact and population frequency criteria."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {variantData?.sample_only_ingest && (
            <div
              className="mx-4 mb-3 p-2.5 rounded-lg border text-xs leading-relaxed"
              style={{ backgroundColor: 'var(--accent-teal-soft)', borderColor: 'var(--accent-teal)', color: 'var(--text-primary)' }}
            >
              {variantData.s3_line_count_status === 'pending' || variantData.s3_line_count_status === 'running' ? (
                <>
                  Counting all variant rows in your file on the server (very large files can take several minutes).
                  Column mapping already used the first {variantData.interpretation_sample_rows || 50} rows.
                </>
              ) : annotatedRowBaseline > 0 ? (
                variantData?.annotated_row_count || variantData?.sample_only_ingest ? (
                  <>
                    Annotated variant file ({annotatedRowBaseline.toLocaleString()} rows). Each Apply re-scans this full
                    annotated file on S3 (all active filters combined). Uploaded VCF may list more rows before annotation.
                  </>
                ) : (
                  <>
                    Full file on cloud storage ({annotatedRowBaseline.toLocaleString()} data rows). Column mapping used the first{' '}
                    {variantData.interpretation_sample_rows || 50} rows only — not loaded into the database yet. Run ANNOVAR,
                    then apply the ACMG filter (or apply sidebar filters once) to load a working set. Use Reset to clear
                    filters and start over from the full file.
                  </>
                )
              ) : (
                <>
                  Full file on cloud storage. Column mapping used the first {variantData.interpretation_sample_rows || 50}{' '}
                  rows only. Run ANNOVAR, then apply the ACMG filter. Use Reset to reload the full file row count.
                </>
              )}
            </div>
          )}

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
            <div className="sidebar-card border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">Variants Under Consideration</span>
                <span className="text-sm font-bold" style={{ color: 'var(--accent-teal)' }}>
                  {underConsiderationCount.toLocaleString()}
                  <span className="text-[var(--text-secondary)] font-normal">
                    {hasActiveManualFilters
                      ? ` of ${displayTotalVariants.toLocaleString()} in annotated file`
                      : activeProprietaryFilter
                        ? ` of ${displayTotalVariants.toLocaleString()} loaded`
                        : ` of ${fileTotalVariants.toLocaleString()} in file`}
                  </span>
                </span>
              </div>
              {/* Graphical bar: full teal when no filter; teal (under consideration) + muted (filtered out) when filter applied */}
              <div
                className="w-full h-3 rounded-full overflow-hidden flex"
                style={{ backgroundColor: 'var(--bg-surface-hover)' }}
                title={
                  (hasActiveManualFilters || activeProprietaryFilter) &&
                  underConsiderationCount < displayTotalVariants
                    ? `${underConsiderationCount.toLocaleString()} under consideration, ${(displayTotalVariants - underConsiderationCount).toLocaleString()} filtered out`
                    : 'All loaded variants under consideration'
                }
              >
                <div
                  className="h-full rounded-l-full transition-all duration-300"
                  style={{
                    width: displayTotalVariants > 0
                      ? `${Math.max(0, Math.min(100, (underConsiderationCount / displayTotalVariants) * 100))}%`
                      : '0%',
                    backgroundColor: 'var(--accent-teal)',
                    minWidth: displayTotalVariants > 0 ? '4px' : 0
                  }}
                />
                {(hasActiveManualFilters || activeProprietaryFilter) &&
                  underConsiderationCount < displayTotalVariants && (
                  <div
                    className="h-full rounded-r-full flex-shrink-0"
                    style={{
                      width: `${Math.max(0, ((displayTotalVariants - underConsiderationCount) / displayTotalVariants) * 100)}%`,
                      backgroundColor: 'rgba(77,182,172,0.35)',
                      minWidth: displayTotalVariants - underConsiderationCount > 0 ? '4px' : 0
                    }}
                  />
                )}
              </div>
              {/* Legend when filter is applied */}
              {(hasActiveManualFilters || activeProprietaryFilter) &&
                underConsiderationCount < displayTotalVariants && (
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-teal)' }} />
                    Under consideration
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(77,182,172,0.35)' }} />
                    Filtered out
                  </span>
                </div>
              )}
            </div>
          )}

          {/* All Columns */}
          {allColumns.length > 0 && (
            <div className={`space-y-2 ${activeProprietaryFilter ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 px-1">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">All Columns</h4>
                {activeProprietaryFilter && (
                  <span className="text-xs text-[var(--text-tertiary)] italic">(Disabled - proprietary filter active)</span>
                )}
              </div>
              <div className="space-y-1">
              {allColumns.map((colName) => {
                // Check if this column is numeric (for filtering)
                const isNumeric = columnIsNumeric(colName);
                const filter = filters[colName] || {};
                
                // Check if this column is categorical (for filtering)
                const isCategorical = columnIsCategoricalOnly(colName);
                const selectedValues = categoricalFilters[colName] || [];
                // Columns flagged as having no valid values in interpretation
                const isColumnUnusable = noValidValuesColumns.includes(colName);
                
                // Count active filters for this column
                let filterCount = 0;
                if (isNumeric) {
                  if (filter.currentMin !== null && filter.currentMin !== undefined) filterCount++;
                  if (filter.currentMax !== null && filter.currentMax !== undefined) filterCount++;
                } else if (isCategorical) {
                  filterCount = selectedValues.length;
                }
                
                // Check if filters are applied (from Firestore)
                const appliedFilter = appliedFilters && appliedFilters[colName];
                if (appliedFilter) {
                  if (appliedFilter.min !== undefined || appliedFilter.max !== undefined) {
                    filterCount = (appliedFilter.min !== null && appliedFilter.min !== undefined ? 1 : 0) + 
                                  (appliedFilter.max !== null && appliedFilter.max !== undefined ? 1 : 0);
                  } else if (appliedFilter.values && Array.isArray(appliedFilter.values)) {
                    filterCount = appliedFilter.values.length;
                  }
                }
                
                return (
                  <button
                    key={colName}
                    onClick={() => {
                      if (!isManualFiltersDisabled && !isColumnUnusable) {
                        setOpenFilterPopup(colName);
                        setPopupSearchQuery(''); // Clear search when opening popup
                      }
                    }}
                    disabled={isManualFiltersDisabled || isColumnUnusable}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      (isManualFiltersDisabled || isColumnUnusable)
                        ? 'opacity-50 cursor-not-allowed bg-[var(--bg-surface)] border-[var(--border-default)]' 
                        : 'bg-[var(--bg-surface-raised)] border-[var(--border-default)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] cursor-pointer'
                    } ${openFilterPopup === colName ? 'border-2' : ''}`}
                    style={openFilterPopup === colName ? { borderColor: 'var(--accent-teal)' } : {}}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate flex-1" style={{ color: isColumnUnusable ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                        {colName}
                      </span>
                      {filterCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full text-[var(--bg-app)] flex-shrink-0" style={{ backgroundColor: 'var(--accent-teal)' }}>
                          {filterCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          )}
        </div>

        {/* Floating Filter Popup */}
        {openFilterPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => {
            setOpenFilterPopup(null);
            setPopupSearchQuery(''); // Clear search when closing
          }}>
            <div 
              className="bg-[var(--bg-surface-raised)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              style={{ margin: '20px' }}
            >
              {/* Popup Header */}
              <div className="sidebar-modal-header flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{openFilterPopup}</h3>
                <button
                  onClick={() => {
                    setOpenFilterPopup(null);
                    setPopupSearchQuery(''); // Clear search when closing
                  }}
                  className="p-1 rounded hover:bg-[var(--bg-surface-hover)] transition-colors"
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
                    const numericActive =
                      filter.currentMin != null || filter.currentMax != null;
                    return (
                      <div className="space-y-4">
                        <div className="text-sm text-[var(--text-secondary)]">
                          Data range in{' '}
                          {variantData?.parameter_ranges_from_full_file
                            ? 'full annotated file'
                            : 'interpretation sample'}
                          :{' '}
                          <span className="font-medium">
                            {range.min.toFixed(2)} – {range.max.toFixed(2)}
                          </span>
                        </div>
                        {!numericActive && (
                          <p className="text-xs rounded-lg px-3 py-2 sidebar-warning-banner border">
                            Drag the handles away from the full span (or type tighter min/max), then click{' '}
                            <span className="font-medium">Apply filters</span>. A full-width range does not
                            filter this column — the match count will stay the same until you narrow it.
                          </p>
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
                              <label key={value} className={`flex items-center gap-2 text-sm p-2 rounded ${
                                isManualFiltersDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-[var(--bg-surface-hover)]'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={selectedValues.includes(value)}
                                  onChange={(e) => !isManualFiltersDisabled && handleCategoricalChange(colName, value, e.target.checked)}
                                  disabled={isManualFiltersDisabled}
                                  className="rounded border-[var(--border-default)]"
                                  style={{ accentColor: 'var(--accent-teal)' }}
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
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                    isManualFiltersDisabled
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
                    className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 text-white ${
                      isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges
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
        <div className="sidebar-header border-t space-y-3">
          {/* Show pending filters (set but not yet applied) */}
          {(() => {
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

          {/* filter garden disabled for now */}
          {/* {!isGuest && (
            <div className="p-3 border rounded-lg space-y-2" style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}>
              <div className="text-xs font-semibold text-[var(--text-primary)]">Filter Garden</div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Save, apply, edit, and delete entries in one place.
                </div>
                <button
                  type="button"
                  onClick={handleOpenGardenModal}
                  disabled={isManualFiltersDisabled}
                  className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                    isManualFiltersDisabled
                      ? 'opacity-60 cursor-not-allowed bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                      : 'bg-[var(--bg-surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  Open Filter Garden
                </button>
              </div>
            </div>
          )} */}

          <div className="flex gap-2">
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
              className={`flex-1 px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium text-white ${
                isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:opacity-90'
              }`}
              style={{
                backgroundColor:
                  isApplying || isManualFiltersDisabled || !hasUnappliedFilterChanges ? 'var(--text-tertiary)' : 'var(--accent-teal)'
              }}
            >
              {isApplying ? (
                <>
                  <div className="w-4 h-4 border-2 border-[var(--bg-app)] border-t-transparent rounded-full animate-spin"></div>
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Apply Filters
                </>
              )}
            </button>

            <button
              onClick={resetFilters}
              disabled={isApplying || isManualFiltersDisabled}
              title={
                isGuest
                  ? 'Clear manual filters and restore all preview variants for chat'
                  : undefined
              }
              className={`px-4 py-2 bg-[var(--bg-surface-hover)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-hover)] flex items-center justify-center gap-2 text-sm font-medium ${
                isApplying || isManualFiltersDisabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>

          {filteredCount !== null && displayTotalVariants > 0 && (
            <div className="p-3 border rounded-lg" style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--accent-teal)' }}>
              <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                <span className="font-semibold">Filtered:</span> {filteredCount.toLocaleString()} / {displayTotalVariants.toLocaleString()} variants
              </div>
              {appliedFilters &&
                Object.keys(appliedFilters).filter((k) => k !== '_numeric_logic').length > 0 && (
                  <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-semibold">Active filters:</span>{' '}
                    {Object.keys(appliedFilters)
                      .filter((k) => k !== '_numeric_logic')
                      .join(', ')}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
      
      {isGardenModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[70]">
          <div className="bg-[var(--bg-surface-raised)] rounded-xl shadow-xl w-full max-w-2xl mx-4 border border-[var(--border-default)] sidebar-modal">
            <div className="sidebar-modal-header px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Filter Garden</h3>
              <button
                type="button"
                onClick={() => {
                  setIsGardenModalOpen(false);
                  setIsEditingGardenEntry(false);
                }}
                className="p-1 rounded hover:bg-[var(--bg-surface-hover)]"
                aria-label="Close Filter Garden"
              >
                <X className="w-5 h-5 text-[var(--text-secondary)]" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="sidebar-garden-step p-3 rounded-lg border">
                <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">Step 1: Choose action</div>
                <select
                  value={gardenAction}
                  onChange={(e) => {
                    setGardenAction(e.target.value);
                    setGardenFeedback(null);
                    setGardenApplyMissingColumns([]);
                  }}
                  className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--bg-surface-raised)]"
                >
                  <option value="create">Create new entry from current filters</option>
                  <option value="apply" disabled={savedFilterPresets.length === 0}>Apply existing entry</option>
                  <option value="edit" disabled={savedFilterPresets.length === 0}>Edit name/notes of existing entry</option>
                  <option value="delete" disabled={savedFilterPresets.length === 0}>Delete existing entry</option>
                </select>
              </div>

              {(gardenAction === 'apply' || gardenAction === 'edit' || gardenAction === 'delete') && (
                <div className="sidebar-garden-step p-3 rounded-lg border">
                  <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">Step 2: Choose existing entry</div>
                  <select
                    value={selectedPresetId}
                    onChange={(e) => {
                      setSelectedPresetId(e.target.value);
                      setIsEditingGardenEntry(false);
                    }}
                    className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--bg-surface-raised)]"
                  >
                    {savedFilterPresets.length === 0 ? (
                      <option value="">No entries yet</option>
                    ) : (
                      savedFilterPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {(gardenAction === 'create' || gardenAction === 'edit') && (
                <div className="p-3 rounded-lg border border-[var(--border-default)]">
                  <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">
                    Step 2: {gardenAction === 'create' ? 'Set new entry details' : 'Update selected entry details'}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={gardenNameInput}
                      onChange={(e) => setGardenNameInput(e.target.value)}
                      placeholder="Entry name (e.g. Rare pathogenic shortlist)"
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)]"
                    />
                    <textarea
                      value={gardenNotesInput}
                      onChange={(e) => setGardenNotesInput(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-teal)]"
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
              )}

              {selectedGardenEntry && (gardenAction === 'apply' || gardenAction === 'edit' || gardenAction === 'delete') && (
                <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] space-y-1">
                  <div><span className="font-semibold">Required columns:</span> {(selectedGardenEntry.required_columns || []).join(', ') || '—'}</div>
                  <div><span className="font-semibold">Genome (stored):</span> {selectedGardenEntry?.metadata?.genome_build || 'Not set'}</div>
                </div>
              )}

              {gardenAction === 'apply' && gardenApplyMissingColumns.length > 0 && (
                <div className="p-3 rounded-lg sidebar-warning-banner border text-xs space-y-1">
                  <div className="font-semibold">Cannot apply to this file.</div>
                  <div>Missing columns: {gardenApplyMissingColumns.join(', ')}</div>
                  <div>Try ANNOVAR, then retry.</div>
                </div>
              )}

              {gardenFeedback && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    gardenFeedback.type === 'success'
                      ? 'sidebar-feedback-success border'
                      : gardenFeedback.type === 'error'
                        ? 'sidebar-feedback-error border'
                        : 'sidebar-feedback-warning border'
                  }`}
                >
                  {gardenFeedback.message}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[var(--border-default)]">
              <div className="text-xs font-semibold text-[var(--text-primary)] mb-2">Step 3: Confirm action</div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {gardenAction === 'create' && (
                    <button
                      type="button"
                      onClick={handleSaveCurrentToGarden}
                      disabled={isSavingPreset || isManualFiltersDisabled}
                      className={`px-4 py-2 text-sm rounded-xl font-medium text-white shadow-sm ${
                        isSavingPreset || isManualFiltersDisabled ? 'opacity-60 cursor-not-allowed' : ''
                      }`}
                      style={{ backgroundColor: isSavingPreset || isManualFiltersDisabled ? 'var(--text-tertiary)' : 'var(--accent-teal)' }}
                    >
                      {isSavingPreset ? 'Saving...' : 'Save to Filter Garden'}
                    </button>
                  )}
                  {gardenAction === 'apply' && (
                    <button
                      type="button"
                      onClick={handleApplySelectedGarden}
                      disabled={isApplyingPreset || !selectedPresetId || isManualFiltersDisabled}
                      className={`px-4 py-2 text-sm rounded-xl font-medium text-white shadow-sm ${
                        isApplyingPreset || !selectedPresetId || isManualFiltersDisabled
                          ? 'opacity-60 cursor-not-allowed'
                          : ''
                      }`}
                      style={{
                        backgroundColor:
                          isApplyingPreset || !selectedPresetId || isManualFiltersDisabled ? 'var(--text-tertiary)' : 'var(--accent-teal)'
                      }}
                    >
                      {isApplyingPreset ? 'Applying...' : 'Apply selected entry'}
                    </button>
                  )}
                  {gardenAction === 'edit' && (
                    <button
                      type="button"
                      onClick={handleUpdateSelectedGarden}
                      disabled={!selectedPresetId || isManualFiltersDisabled}
                      className={`px-4 py-2 text-sm rounded-xl font-medium ${
                        !selectedPresetId || isManualFiltersDisabled
                          ? 'opacity-60 cursor-not-allowed bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                          : 'bg-[var(--bg-surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      Save entry edits
                    </button>
                  )}
                  {gardenAction === 'delete' && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedGarden}
                      disabled={!selectedPresetId || isManualFiltersDisabled}
                      className={`px-4 py-2 text-sm rounded-xl font-medium ${
                        !selectedPresetId || isManualFiltersDisabled
                          ? 'opacity-60 cursor-not-allowed bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                          : 'bg-[var(--bg-surface-raised)] border border-red-300 text-red-700 hover:bg-red-50'
                      }`}
                    >
                      Delete selected entry
                    </button>
                  )}
                  {gardenAction === 'apply' && gardenApplyMissingColumns.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRunAnnovarFromGarden}
                      disabled={isRunningAnnovar}
                      className={`px-4 py-2 text-sm rounded-xl font-medium ${
                        isRunningAnnovar
                          ? 'opacity-60 cursor-not-allowed bg-[var(--bg-surface-hover)] text-[var(--text-secondary)]'
                          : 'bg-[var(--bg-surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <img
                          src={qiagenLogo}
                          alt="Qiagen"
                          className="w-4 h-4 object-contain"
                          style={{ filter: isRunningAnnovar ? 'grayscale(100%) opacity(0.5)' : 'none' }}
                        />
                        {isRunningAnnovar ? 'Trying ANNOVAR...' : 'Try ANNOVAR'}
                      </span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsGardenModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-xl font-medium bg-[var(--bg-surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Notification */}
      <ProcessingNotification 
        message={isApplying ? 'Processing filters...' : null}
        isVisible={isApplying}
      />
    </div>
  );
};

export default VariantFilterSidebar;
