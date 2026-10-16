import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { AlertCircle, ArrowRight, ChevronLeft, Play, Upload, X } from 'lucide-react';
import { CountUp, HoldButton, StageMark, StateButton } from '@/components/motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { MODULE1_BED_MAX_BYTES, MODULE1_FASTQ_MAX_BYTES } from '@/services/backendApi';
import { isRecognizedImportUrl, module1UrlErrorMessage, precheckBedChromStyle } from '@/services/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import PhenotypeInputPanel, { PHENOTYPE_MODE_NOTE } from '@/components/PhenotypeInputPanel';
import GermlinePedigreeFields, { countPedigreeFieldsFilled } from '@/components/GermlinePedigreeFields';
import {
  EMPTY_PEDIGREE_FIELDS,
  pedigreeFieldsForSubmit,
} from '@/components/germlinePedigreeOptions';
import Module1ComputeChoice, {
  deriveModule1ComputeState,
  module1ComputeSubmitLabel,
} from '@/components/Module1ComputeChoice';
import Module1BedPicker from '@/components/Module1BedPicker';
import PipelineRunModeToggle, {
  PIPELINE_RUN_MANUAL,
  normalizePipelineRunMode,
  applyPipelineRunModeChange,
} from '@/components/PipelineRunModeToggle';
import {
  Disclosure,
  Field,
  FieldGroup,
  ICON_BTN_CLASS,
  MissingHint,
  QuietSummary,
  SegmentedPill,
  TEXT_INPUT_CLASS,
  UploadErrorBanner,
  WIZARD_DIALOG_CLASS,
  WizardPanes,
  WizardSelect,
  WizardStepper,
  inputBorderClass,
} from '@/components/UploadWizardKit';

const GENOME_OPTIONS = [
  { value: 'hg38', label: 'hg38 (GRCh38)' },
  { value: 'hg19', label: 'hg19 (GRCh37)' },
];

const EMPTY_URL_ROW = { url: '', meta: null, error: null, checking: false };
const EMPTY_URL_STATE = { r1: EMPTY_URL_ROW, r2: EMPTY_URL_ROW, bed: EMPTY_URL_ROW };

const SEQUENCING_TYPE_OPTIONS = [
  { value: 'WES', label: 'Whole Exome (WES)' },
  { value: 'WGS', label: 'Whole Genome (WGS)', disabled: true, disabledReason: 'Whole genome (WGS) analysis is coming soon.' },
  { value: 'Targeted', label: 'Targeted', disabled: true, disabledReason: 'Targeted panel analysis is coming soon.' },
];

const SAMPLE_SEX_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Unknown', label: 'Unknown' },
];

const ANALYSIS_TYPE_OPTIONS = [
  { value: 'Germline', label: 'Germline' },
  { value: 'Somatic', label: 'Somatic' },
  { value: 'Tumor-Normal Paired', label: 'Tumor-Normal Paired', disabled: true, disabledReason: 'Tumor-Normal Paired analysis is coming soon.' },
  { value: 'Tumor-Only', label: 'Tumor-Only', disabled: true, disabledReason: 'Tumor-Only analysis is coming soon.' },
  { value: 'IVF', label: 'IVF', disabled: true, disabledReason: 'IVF analysis is coming soon.' },
  { value: 'PGT', label: 'PGT', disabled: true, disabledReason: 'PGT analysis is coming soon.' },
  { value: 'Unknown', label: 'Unknown', disabled: true, disabledReason: 'Unknown analysis type is not supported yet.' },
];

const SAMPLE_SOURCE_OPTIONS = [
  { value: 'Tissue', label: 'Tissue' },
  { value: 'Blood', label: 'Blood' },
  { value: 'FFPE', label: 'FFPE' },
  { value: 'Other', label: 'Other' },
];

const SAMPLE_ROLE_OPTIONS = [
  { value: 'proband', label: 'Proband' },
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other', label: 'Other' },
];

const AFFECTED_STATUS_OPTIONS = [
  { value: 'affected', label: 'Affected' },
  { value: 'unaffected', label: 'Unaffected' },
];

const INHERITANCE_MODEL_OPTIONS = [
  { value: 'Autosomal Dominant', label: 'Autosomal Dominant' },
  { value: 'Autosomal Recessive', label: 'Autosomal Recessive' },
  { value: 'X-linked', label: 'X-linked' },
  { value: 'De novo', label: 'De novo' },
  { value: 'Unknown', label: 'Unknown' },
];

const EMPTY_SAMPLE_METADATA = {
  sampleSex: '',
  analysisType: '',
  sampleSource: '',
  // Germline only
  sampleRole: '',
  affectedStatus: '',
  inheritanceModel: '',
  ...EMPTY_PEDIGREE_FIELDS,
  phenotype: '',
  phenotype_mode: PHENOTYPE_MODE_NOTE,
  phenotype_findings: '',
  phenotype_disease: '',
  phenotype_note_clean: '',
  phenotype_run_mode: PIPELINE_RUN_MANUAL,
  pipeline_run_mode: PIPELINE_RUN_MANUAL,
  phenotype_hpo: null,
};

const SelectWithDisabledOptions = WizardSelect;

function formatBytes(bytes) {
  if (bytes == null) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function basenameFromUrl(fileUrl) {
  if (!fileUrl) return '';
  try {
    const { pathname } = new URL(fileUrl);
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    return '';
  }
}

/**
 * One file slot (FASTQ, custom BED): a pill-cornered drop target. Empty it is dashed teal and takes a
 * click or a drop; filled it shows a drawn check, the file name and size, and can be cleared.
 */
function FileSlot({ file, onSelect, accept, placeholder, error, onTouched, id, disabled = false }) {
  const [over, setOver] = useState(false);
  const reduce = useReducedMotion();
  return (
    <label
      data-drag={over || undefined}
      className={cn(
        'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-full border px-3 text-[13px] outline-none transition-[background-color,border-color,transform] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[hsl(var(--brand-500)/0.5)] motion-reduce:transition-none',
        file ? 'border-solid' : 'border-dashed',
        error
          ? 'border-[var(--error)] bg-[hsl(var(--wb-card))]'
          : over
            ? cn('border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-100))]', !reduce && 'scale-[1.015]')
            : file
              ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))]'
              : 'border-[hsl(var(--brand-300))] bg-[hsl(var(--wb-card))] hover:border-[hsl(var(--brand-500))] hover:bg-[hsl(var(--brand-50))]',
        disabled && 'pointer-events-none opacity-60'
      )}
      onClick={() => onTouched?.()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped && !disabled) { onTouched?.(); onSelect(dropped); }
      }}
    >
      {file ? (
        <StageMark state="done" size={22} className="shrink-0" />
      ) : (
        <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center text-[hsl(var(--brand-700))]">
          <Upload className="size-4" strokeWidth={1.8} />
        </span>
      )}
      <span className={cn('min-w-0 flex-1 truncate', file ? 'font-mono text-xs text-foreground' : 'text-muted-foreground')} title={file?.name}>
        {file?.name || (over ? 'Drop to add this file' : placeholder)}
      </span>
      {file ? (
        <>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(null); }}
            className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </>
      ) : (
        <span className="wb-chip shrink-0 !bg-transparent font-medium text-[hsl(var(--brand-700))]" data-tone="brand">Browse</span>
      )}
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => onSelect(e.target.files?.[0] || null)}
      />
    </label>
  );
}

/** Upload / import progress: slim pill track, tabular percent. */
function ProgressRow({ label, value }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{pct == null ? 'Waiting' : <><CountUp value={pct} duration={0.4} />%</>}</span>
      </div>
      <div className="wb-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}>
        <div className="wb-fill" style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

/** One FASTQ/BED file slot with its label, drop target and upload bar. */
function FilePickerRow({ label, file, onSelect, progress, accept, placeholder, error, onTouched, id }) {
  return (
    <Field label={label} required htmlFor={id} error={error}>
      <FileSlot
        id={id}
        file={file}
        onSelect={onSelect}
        accept={accept}
        placeholder={placeholder || `Choose ${label} file`}
        error={error}
        onTouched={onTouched}
      />
      {progress != null && (
        <div className="mt-2 px-1">
          <ProgressRow label={`${label} upload`} value={progress} />
        </div>
      )}
    </Field>
  );
}

/**
 * URL field for one Module 1 role. Validates on blur/Enter rather than behind a button —
 * the resolved `file_url` + `file_name` from preflight are what the import call needs,
 * since Drive/Dropbox share links are not directly downloadable.
 */
function UrlPickerRow({ label, required = true, placeholder, state, onChange, onValidate, id }) {
  const size = formatBytes(state.meta?.content_length);
  const resolved = !state.checking && !state.error && !!state.meta;
  const resolvedName = resolved ? (state.meta.file_name || basenameFromUrl(state.meta.file_url) || 'Linked file') : '';
  const resolvedLabel = resolved ? `${resolvedName}${size ? ` · ${size}` : ''}` : '';
  const input = (
    <>
      <input
        id={id}
        type="url"
        inputMode="url"
        value={state.url}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onValidate()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onValidate();
          }
        }}
        placeholder={placeholder}
        aria-invalid={state.error ? true : undefined}
        className={cn(TEXT_INPUT_CLASS, inputBorderClass(Boolean(state.error)))}
      />
      {state.checking && (
        <p className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground" role="status">
          <StageMark state="running" size={16} />
          Checking link
        </p>
      )}
      {resolved && (
        <p className="wb-pop mt-1.5 flex min-w-0 items-center gap-1.5 px-1 text-xs text-muted-foreground" role="status">
          <StageMark state="done" size={16} className="shrink-0" />
          <span className="truncate font-mono">{resolvedLabel}</span>
        </p>
      )}
    </>
  );
  if (!label) {
    return (
      <div>
        {input}
        {!state.checking && state.error && (
          <p role="alert" className="mt-1.5 flex items-start gap-1.5 px-1 text-xs text-[var(--error)]">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </p>
        )}
      </div>
    );
  }
  return (
    <Field label={label} required={required} htmlFor={id} error={!state.checking ? state.error : null}>
      {input}
    </Field>
  );
}

/** Per-file upload progress shown on the last step, where the user is when "Start" is pressed. */
function SubmitProgress({ progress, files, status, isUrlMode, onCancelImport }) {
  const rows = isUrlMode
    ? []
    : [
        { key: 'r1', label: 'Forward read (R1)', file: files.r1, value: progress?.r1 },
        { key: 'r2', label: 'Reverse read (R2)', file: files.r2, value: progress?.r2 },
        ...(files.bed ? [{ key: 'bed', label: 'Custom BED', file: files.bed, value: progress?.bed }] : []),
      ];
  // It appears below the fold on the last step, so bring it into view when the run starts.
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);
  return (
    <div ref={ref} className="wb-card wb-rise space-y-3 p-3.5" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <StageMark state="running" size={18} />
        {isUrlMode ? 'Importing files from your links' : 'Uploading your files'}
      </p>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      {rows.map((row) => (
        <ProgressRow key={row.key} label={row.label} value={row.value} />
      ))}
      {isUrlMode && onCancelImport ? (
        <Button type="button" variant="outline" size="sm" onClick={onCancelImport}>
          Cancel import
        </Button>
      ) : null}
    </div>
  );
}

/** "49 of 10 runs left" is a data quirk (pool vs monthly limit): never show remaining above the limit. */
export function module1RunsLeftLabel(meter) {
  if (!meter?.tracked || meter.unlimited || meter.remaining == null) return null;
  const remaining = Number(meter.remaining);
  if (!Number.isFinite(remaining)) return null;
  const limit = Number(meter.limit);
  if (!Number.isFinite(limit) || remaining > limit) return `${remaining} runs left`;
  return `${remaining} of ${limit} Module 1 runs left`;
}

const Module1UploadForm = ({
  open,
  onClose,
  bedCatalog,
  bedCatalogLoading,
  loadBedCatalog,
  module1UploadProgress,
  module1Submitting,
  module1SubmitError,
  module1ImportStatus,
  preflightModule1Url,
  uploadAndValidateCustomBed,
  startModule1Run,
  cancelModule1Import,
  gate,
  gateMeterDetail,
  capacity = null,
  capacityStatus = 'unavailable',
}) => {
  const { limits } = useAuth();
  const [sampleName, setSampleName] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Live text in the phenotype box, for the "Skip phenotype" label.
  const [phenotypeDraft, setPhenotypeDraft] = useState('');
  const [genome, setGenome] = useState('hg38');
  const [sequencingType, setSequencingType] = useState('WES');
  const [r1File, setR1File] = useState(null);
  const [r2File, setR2File] = useState(null);
  const [bedMode, setBedMode] = useState('catalog'); // 'catalog' | 'custom'
  const [bedCatalogId, setBedCatalogId] = useState('');
  const [customBedFile, setCustomBedFile] = useState(null);
  const [customBedS3Key, setCustomBedS3Key] = useState(null);
  const [customBedValidation, setCustomBedValidation] = useState(null); // { ok, message, lines_checked, example_chroms }
  const [customBedPrecheck, setCustomBedPrecheck] = useState(null);
  const [isValidatingBed, setIsValidatingBed] = useState(false);
  const [sourceMode, setSourceMode] = useState('file'); // 'file' | 'url'
  const [urlState, setUrlState] = useState(EMPTY_URL_STATE);
  const [sampleMetadata, setSampleMetadata] = useState(EMPTY_SAMPLE_METADATA);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [touched, setTouched] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Failure thrown from startModule1Run itself, and the error value the user has dismissed. */
  const [localError, setLocalError] = useState(null);
  const [dismissedError, setDismissedError] = useState(null);
  /** Steps: essentials → optional clinical details → (phenotype and) run. The same three for every analysis type. */
  const [metadataStep, setMetadataStep] = useState('sample'); // 'sample' | 'analysis' | 'phenotype'
  /** GPU/CPU card the user picked; null until they touch the cards (the live default applies). */
  const [computeChoice, setComputeChoice] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSampleName('');
    setGenome('hg38');
    setSequencingType('WES');
    setR1File(null);
    setR2File(null);
    setBedMode('catalog');
    setBedCatalogId('');
    setCustomBedFile(null);
    setCustomBedS3Key(null);
    setCustomBedValidation(null);
    setCustomBedPrecheck(null);
    setSourceMode('file');
    setUrlState(EMPTY_URL_STATE);
    setSampleMetadata(EMPTY_SAMPLE_METADATA);
    setValidationAttempted(false);
    setTouched({});
    setDetailsOpen(false);
    setLocalError(null);
    setDismissedError(null);
    setMetadataStep('sample');
    setComputeChoice(null);
    setPhenotypeDraft('');
    loadBedCatalog?.('hg38');
  }, [open, loadBedCatalog]);

  useEffect(() => {
    if (!open || bedMode !== 'catalog') return;
    loadBedCatalog?.(genome);
    setBedCatalogId('');
  }, [genome, bedMode, open, loadBedCatalog]);

  const patchUrlRow = (role, patch) =>
    setUrlState((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));

  const setUrlValue = (role, url) => patchUrlRow(role, { url, meta: null, error: null });

  /* Monotonic per-role request id. Two preflights can overlap (blur then Enter, or fast edits),
   * and without this the slower response wins and stamps `meta` for a URL the user has already
   * replaced — which would then be sent to /from-urls. */
  const urlRequestIdRef = useRef({ r1: 0, r2: 0, bed: 0 });

  const validateUrlRow = async (role) => {
    // Read through the state updater rather than the render closure: onBlur and onKeyDown can
    // fire in the same tick as an onChange, in which case `urlState[role]` here is one edit
    // stale and we would validate the previous URL.
    let row = EMPTY_URL_ROW;
    setUrlState((prev) => {
      row = prev[role] || EMPTY_URL_ROW;
      return prev;
    });

    const url = (row.url || '').trim();
    // meta is cleared on every edit, so its presence means this exact URL already passed.
    if (row.checking || row.meta) return;
    if (!url) {
      patchUrlRow(role, { meta: null, error: null });
      return;
    }
    if (!isRecognizedImportUrl(url)) {
      patchUrlRow(role, { meta: null, error: 'Enter a full https:// URL, or a Google Drive / Dropbox share link.' });
      return;
    }

    const requestId = (urlRequestIdRef.current[role] ?? 0) + 1;
    urlRequestIdRef.current[role] = requestId;

    patchUrlRow(role, { checking: true, error: null });
    try {
      const result = await preflightModule1Url({ role, fileUrl: url });
      if (urlRequestIdRef.current[role] !== requestId) return; // superseded
      patchUrlRow(role, { checking: false, meta: result, error: null });
    } catch (error) {
      if (urlRequestIdRef.current[role] !== requestId) return;
      patchUrlRow(role, { checking: false, meta: null, error: module1UrlErrorMessage(error, 'URL validation failed.') });
    }
  };

  /** Switching source drops the other mode's selections so a stale s3_key can never reach /run. */
  const handleSourceModeChange = (next) => {
    if (next === sourceMode) return;
    setSourceMode(next);
    setR1File(null);
    setR2File(null);
    setUrlState(EMPTY_URL_STATE);
    urlRequestIdRef.current = { r1: 0, r2: 0, bed: 0 };
    setCustomBedFile(null);
    setCustomBedS3Key(null);
    setCustomBedValidation(null);
    setCustomBedPrecheck(null);
  };

  const handleCustomBedSelect = async (file) => {
    setCustomBedFile(file);
    setCustomBedS3Key(null);
    setCustomBedValidation(null);
    setCustomBedPrecheck(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.bed')) {
      setCustomBedValidation({ ok: false, message: 'File must have a .bed extension.' });
      return;
    }
    if (file.size > MODULE1_BED_MAX_BYTES) {
      setCustomBedValidation({
        ok: false,
        message: `BED file must be ${MODULE1_BED_MAX_BYTES / 1024 ** 2}MB or smaller.`,
      });
      return;
    }
    const precheck = await precheckBedChromStyle(file).catch(() => null);
    setCustomBedPrecheck(precheck);

    setIsValidatingBed(true);
    try {
      const { s3Key, validation } = await uploadAndValidateCustomBed(file, genome);
      setCustomBedS3Key(validation.ok ? s3Key : null);
      setCustomBedValidation(validation);
    } catch (error) {
      setCustomBedValidation({ ok: false, message: error.message || 'BED upload/validation failed.' });
    } finally {
      setIsValidatingBed(false);
    }
  };

  const touch = (field) => setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  const showError = (field, missing, message) => ((validationAttempted || touched[field]) && missing ? message : null);

  const isUrlMode = sourceMode === 'url';
  const anyUrlChecking = isUrlMode && Object.values(urlState).some((row) => row.checking);
  const r1Resolved = isUrlMode ? !!urlState.r1.meta : !!r1File;
  const r2Resolved = isUrlMode ? !!urlState.r2.meta : !!r2File;
  const readsResolved = r1Resolved && r2Resolved;
  const bedResolved =
    bedMode === 'catalog'
      ? !!bedCatalogId
      : isUrlMode
        ? !!urlState.bed.meta
        : customBedValidation?.ok === true && !!customBedS3Key;
  // `=== false` so an absent gate (degraded limits, still loading) never disables submit.
  const quotaBlocked = gate?.allowed === false;
  const runsLeftLabel = module1RunsLeftLabel(gate?.meter);
  // Free stages the files and runs after upgrading — nothing is queued now, so there is no
  // compute choice or credit line on that path, and the button says what will happen.
  const isStaging = Boolean(gate?.staging);
  const computeState = deriveModule1ComputeState(capacity, capacityStatus);
  // Until the user touches the cards, follow the live default (re-derived on every 15 s poll).
  const effectiveComputeChoice = computeChoice ?? computeState.defaultChoice;
  const submitLabel = isStaging ? 'Stage files' : module1ComputeSubmitLabel(effectiveComputeChoice, computeState);
  const oversizedRead = [r1File, r2File].find((f) => f && f.size > MODULE1_FASTQ_MAX_BYTES) || null;

  // Honor backend MODULE1_GENOMES_READY via bed-catalog.genome_ready (hg38 + hg19).
  // Require catalog payload to match the selected genome so a stale hg38 response
  // cannot unlock submit while hg19 is still loading.
  const genomeReady =
    !bedCatalogLoading &&
    !!bedCatalog &&
    bedCatalog.genome === genome &&
    bedCatalog.genome_ready === true;

  const canSubmit =
    !!sampleName.trim() &&
    genomeReady &&
    sequencingType === 'WES' &&
    readsResolved &&
    bedResolved &&
    !module1Submitting &&
    !isValidatingBed &&
    !anyUrlChecking &&
    !quotaBlocked &&
    !oversizedRead;

  const isGermline = sampleMetadata.analysisType === 'Germline';
  const analysisTypeMissing = !sampleMetadata.analysisType;
  const isFinalStep = metadataStep === 'phenotype';
  const stepIndex = metadataStep === 'phenotype' ? 2 : metadataStep === 'analysis' ? 1 : 0;
  const showComputeChoice = isFinalStep && !isStaging;
  const steps = [
    { id: 'sample', label: 'Files and essentials' },
    { id: 'analysis', label: 'Clinical details', optional: true },
    { id: 'phenotype', label: isGermline || analysisTypeMissing ? 'Phenotype and run' : 'Run' },
  ];

  /** What still blocks the essentials page, from the same predicates as `canSubmit`. */
  const essentialsMissing = [
    !sampleName.trim() && 'sample name',
    !genomeReady && (bedCatalogLoading ? 'reference data (loading)' : 'reference data for this genome'),
    sequencingType !== 'WES' && 'sequencing type',
    analysisTypeMissing && 'analysis type',
    !r1Resolved && (isUrlMode ? 'R1 link' : 'R1 file'),
    !r2Resolved && (isUrlMode ? 'R2 link' : 'R2 file'),
    !bedResolved && 'capture BED',
    isValidatingBed && 'BED validation to finish',
    anyUrlChecking && 'link checks to finish',
  ].filter(Boolean);
  const essentialsReady = essentialsMissing.length === 0;

  const skippingPhenotype =
    !isStaging &&
    isGermline &&
    isFinalStep &&
    !phenotypeDraft.trim() &&
    !(sampleMetadata.phenotype || '').trim();
  const finalSubmitLabel = skippingPhenotype
    ? `Skip phenotype and ${submitLabel.charAt(0).toLowerCase()}${submitLabel.slice(1)}`
    : submitLabel;

  const detailsFilledCount =
    [
      sampleMetadata.sampleSex,
      sampleMetadata.sampleSource,
      ...(isGermline
        ? [sampleMetadata.sampleRole, sampleMetadata.affectedStatus, sampleMetadata.inheritanceModel]
        : []),
    ].filter(Boolean).length + (isGermline ? countPedigreeFieldsFilled(sampleMetadata) : 0);
  const notProvided = [
    !sampleMetadata.sampleSex && 'sample sex',
    !sampleMetadata.sampleSource && 'sample source',
    isGermline && !sampleMetadata.sampleRole && 'sample role',
    isGermline && !sampleMetadata.affectedStatus && 'affected status',
    isGermline && !sampleMetadata.inheritanceModel && 'inheritance model',
    isGermline && !(sampleMetadata.phenotype || '').trim() && !phenotypeDraft.trim() && 'phenotype',
  ].filter(Boolean);

  const setAnalysisType = (val) => {
    setSampleMetadata((prev) => ({ ...prev, analysisType: val }));
  };

  /** Everything the run needs is in state; this is the only place the run is started. */
  const submitRun = () => {
    const useCustomBed = bedMode === 'custom';
    setLocalError(null);
    setDismissedError(null);
    const started = startModule1Run({
      sampleName: sampleName.trim(),
      genome,
      sequencingType,
      sampleMetadata: {
        sampleSex: sampleMetadata.sampleSex,
        analysisType: sampleMetadata.analysisType,
        sampleSource: sampleMetadata.sampleSource,
        // Dropped unless Germline, so a type switch cannot leave stale pedigree fields behind.
        ...(isGermline
          ? {
              sampleRole: sampleMetadata.sampleRole,
              affectedStatus: sampleMetadata.affectedStatus,
              inheritanceModel: sampleMetadata.inheritanceModel,
              ...pedigreeFieldsForSubmit(sampleMetadata),
              phenotype: sampleMetadata.phenotype.trim(),
              phenotype_mode: sampleMetadata.phenotype_mode || PHENOTYPE_MODE_NOTE,
              phenotype_findings: sampleMetadata.phenotype_findings || '',
              phenotype_disease: sampleMetadata.phenotype_disease || '',
              phenotype_note_clean: sampleMetadata.phenotype_note_clean || '',
              phenotype_run_mode: normalizePipelineRunMode(
                sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
              ),
              pipeline_run_mode: normalizePipelineRunMode(
                sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
              ),
              phenotype_hpo: sampleMetadata.phenotype_hpo || null,
              selected_panels: sampleMetadata.selected_panels || [],
              selected_panel_gene_list: sampleMetadata.selected_panel_gene_list || [],
              selected_panel_include_amber:
                sampleMetadata.selected_panel_include_amber !== false,
            }
          : {}),
      },
      sourceMode,
      ...(isUrlMode
        ? {
            // Send the preflight-resolved URL/name — a raw Drive/Dropbox share link is not
            // directly downloadable server-side.
            r1Url: urlState.r1.meta.file_url,
            r2Url: urlState.r2.meta.file_url,
            r1FileName: urlState.r1.meta.file_name,
            r2FileName: urlState.r2.meta.file_name,
            bedUrl: useCustomBed ? urlState.bed.meta?.file_url : undefined,
            bedFileName: useCustomBed ? urlState.bed.meta?.file_name : undefined,
          }
        : { r1File, r2File, customBedS3Key: useCustomBed ? customBedS3Key : undefined }),
      bedCatalogId: bedMode === 'catalog' ? bedCatalogId : undefined,
      // "auto" only when live queue info is missing and the user left the cards alone.
      ...(isStaging ? {} : { computePreference: effectiveComputeChoice || 'auto' }),
    });
    // The hook reports most failures through `module1SubmitError`; a rejection it lets escape
    // is shown here instead of becoming a silent unhandled promise.
    Promise.resolve(started).catch((error) => setLocalError(error || 'Could not start the run.'));
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    setValidationAttempted(true);

    if (metadataStep === 'sample') {
      if (!essentialsReady) return;
      setMetadataStep('analysis');
      return;
    }
    if (metadataStep === 'analysis') {
      setMetadataStep('phenotype');
      return;
    }
    // phenotype / run → start pipeline
    if (!canSubmit || analysisTypeMissing) return;
    submitRun();
  };

  const submitError = localError || module1SubmitError;
  const showSubmitError = submitError && submitError !== dismissedError;
  const finalBlockers = [
    oversizedRead && `${oversizedRead.name} is larger than the ${MODULE1_FASTQ_MAX_BYTES / 1024 ** 3} GB limit per FASTQ.`,
    quotaBlocked && gate?.reason,
  ].filter(Boolean);

  const closeNow = () => {
    cancelModule1Import?.();
    onClose?.();
  };

  const individualFields = (
    <FieldGroup title="Individual">
      <Field label="Sample sex" htmlFor="m1-sex">
        <SelectWithDisabledOptions
          id="m1-sex"
          value={sampleMetadata.sampleSex}
          onChange={(val) => setSampleMetadata((prev) => ({ ...prev, sampleSex: val }))}
          placeholder="Choose one"
          options={SAMPLE_SEX_OPTIONS}
        />
      </Field>
      <Field label="Sample source" htmlFor="m1-source">
        <SelectWithDisabledOptions
          id="m1-source"
          value={sampleMetadata.sampleSource}
          onChange={(val) => setSampleMetadata((prev) => ({ ...prev, sampleSource: val }))}
          placeholder="Choose one"
          options={SAMPLE_SOURCE_OPTIONS}
        />
      </Field>
      {isGermline && (
        <>
          <Field label="Sample role" htmlFor="m1-role">
            <SelectWithDisabledOptions
              id="m1-role"
              value={sampleMetadata.sampleRole}
              onChange={(val) => setSampleMetadata((prev) => ({ ...prev, sampleRole: val }))}
              placeholder="Choose one"
              options={SAMPLE_ROLE_OPTIONS}
            />
          </Field>
          <Field label="Affected status" htmlFor="m1-affected">
            <SelectWithDisabledOptions
              id="m1-affected"
              value={sampleMetadata.affectedStatus}
              onChange={(val) => setSampleMetadata((prev) => ({ ...prev, affectedStatus: val }))}
              placeholder="Choose one"
              options={AFFECTED_STATUS_OPTIONS}
            />
          </Field>
          <Field label="Inheritance model" htmlFor="m1-inheritance">
            <SelectWithDisabledOptions
              id="m1-inheritance"
              value={sampleMetadata.inheritanceModel}
              onChange={(val) => setSampleMetadata((prev) => ({ ...prev, inheritanceModel: val }))}
              placeholder="Choose one"
              options={INHERITANCE_MODEL_OPTIONS}
            />
          </Field>
        </>
      )}
    </FieldGroup>
  );

  return (
    <TooltipProvider>
      {/* Outside click / Esc ask before dropping the form; the × and Cancel close directly. */}
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          if (next) return;
          if (details?.reason === 'outside-press' || details?.reason === 'escape-key') {
            setShowDiscardConfirm(true);
            return;
          }
          onClose?.();
        }}
      >
        {/* Pinned to the top rather than centred: the steps grow as results load, and a
          * centred dialog jumped up each time it did. Full-height sheet on phones. */}
        <DialogContent showCloseButton={false} className={WIZARD_DIALOG_CLASS}>
          <div className="flex-shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold leading-snug text-foreground">Upload raw sequencing data</DialogTitle>
                <DialogDescription className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Paired FASTQ (R1 and R2). About 20–30 min on GPU, about 2 h on CPU. You can close this tab; we will notify you.
                </DialogDescription>
              </div>
              <button
                type="button"
                onClick={closeNow}
                aria-label="Close"
                className={cn(ICON_BTN_CLASS, '-mr-1')}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <WizardStepper steps={steps} current={stepIndex} className="mt-4" />
            {showSubmitError && (
              <UploadErrorBanner
                className="mt-4"
                error={submitError}
                devices={limits?.devices}
                onRetry={isFinalStep && canSubmit && !analysisTypeMissing ? submitRun : null}
                onDismiss={() => setDismissedError(submitError)}
                retrying={module1Submitting}
              />
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div data-wizard-scroll className="flex-1 overflow-x-hidden overflow-y-auto px-5 pb-4 pt-1 sm:px-7">
             <WizardPanes step={metadataStep} index={stepIndex} className="space-y-5">
              {metadataStep === 'sample' && (
                <>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                    <Field
                      label="Sample name"
                      required
                      htmlFor="m1-name"
                      error={showError('name', !sampleName.trim(), 'Enter a sample name.')}
                    >
                      <input
                        id="m1-name"
                        type="text"
                        value={sampleName}
                        onChange={(e) => setSampleName(e.target.value)}
                        onBlur={() => touch('name')}
                        aria-invalid={showError('name', !sampleName.trim(), 'x') ? true : undefined}
                        className={cn(TEXT_INPUT_CLASS, inputBorderClass(Boolean(showError('name', !sampleName.trim(), 'x'))))}
                        placeholder="e.g. EB74_S2"
                      />
                    </Field>

                    <Field label="Genome build" required htmlFor="m1-genome">
                      <SelectWithDisabledOptions id="m1-genome" value={genome} onChange={setGenome} placeholder="Choose one" options={GENOME_OPTIONS} />
                    </Field>

                    <Field label="Sequencing type" required htmlFor="m1-seq">
                      <SelectWithDisabledOptions
                        id="m1-seq"
                        value={sequencingType}
                        onChange={setSequencingType}
                        placeholder="Choose one"
                        options={SEQUENCING_TYPE_OPTIONS}
                      />
                    </Field>

                    <Field
                      label="Analysis type"
                      required
                      htmlFor="m1-analysis"
                      error={showError('analysisType', analysisTypeMissing, 'Choose an analysis type.')}
                    >
                      <SelectWithDisabledOptions
                        id="m1-analysis"
                        value={sampleMetadata.analysisType}
                        onChange={setAnalysisType}
                        onTouched={() => touch('analysisType')}
                        placeholder="Choose one"
                        options={ANALYSIS_TYPE_OPTIONS}
                        error={Boolean(showError('analysisType', analysisTypeMissing, 'x'))}
                      />
                    </Field>
                  </div>

                  <section aria-labelledby="m1-raw-title" className="wb-card space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 id="m1-raw-title" className="text-[13px] font-semibold text-foreground">
                        Raw data
                      </h4>
                      <SegmentedPill
                        ariaLabel="Where the raw data is"
                        value={sourceMode}
                        onChange={handleSourceModeChange}
                        options={[
                          { value: 'file', label: 'From computer' },
                          { value: 'url', label: 'From URL' },
                        ]}
                      />
                    </div>
                    {isUrlMode ? (
                      <>
                        <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                          <UrlPickerRow
                            id="m1-r1-url"
                            label="Forward read (R1) link"
                            placeholder="https://…/sample_R1_001.fastq.gz"
                            state={urlState.r1}
                            onChange={(v) => setUrlValue('r1', v)}
                            onValidate={() => validateUrlRow('r1')}
                          />
                          <UrlPickerRow
                            id="m1-r2-url"
                            label="Reverse read (R2) link"
                            placeholder="https://…/sample_R2_001.fastq.gz"
                            state={urlState.r2}
                            onChange={(v) => setUrlValue('r2', v)}
                            onValidate={() => validateUrlRow('r2')}
                          />
                        </div>
                        <p className="px-1 text-xs text-muted-foreground">
                          Direct https links, Google Drive or Dropbox share links (&ldquo;Anyone with the link&rdquo;), or
                          presigned S3 URLs. Files are copied server-side after you start the run.
                        </p>
                      </>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                        <FilePickerRow
                          id="m1-r1"
                          label="Forward read (R1)"
                          placeholder="Choose or drop R1 file"
                          file={r1File}
                          onSelect={setR1File}
                          progress={module1UploadProgress?.r1}
                          accept=".fastq.gz,.fastq,.fq.gz,.fq"
                          onTouched={() => touch('r1')}
                          error={showError('r1', !r1File, 'Choose the forward read file.')}
                        />
                        <FilePickerRow
                          id="m1-r2"
                          label="Reverse read (R2)"
                          placeholder="Choose or drop R2 file"
                          file={r2File}
                          onSelect={setR2File}
                          progress={module1UploadProgress?.r2}
                          accept=".fastq.gz,.fastq,.fq.gz,.fq"
                          onTouched={() => touch('r2')}
                          error={showError('r2', !r2File, 'Choose the reverse read file.')}
                        />
                      </div>
                    )}
                  </section>

                  <section aria-labelledby="m1-bed-title" className="wb-card space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 id="m1-bed-title" className="flex items-baseline gap-2 text-[13px] font-semibold text-foreground">
                        Capture BED
                        <span className="text-xs font-normal text-muted-foreground">Required</span>
                      </h4>
                      <SegmentedPill
                        ariaLabel="Capture BED source"
                        value={bedMode}
                        onChange={setBedMode}
                        options={[
                          { value: 'catalog', label: 'Catalog' },
                          { value: 'custom', label: isUrlMode ? 'Custom from URL' : 'Upload custom' },
                        ]}
                      />
                    </div>

                    {bedMode === 'catalog' ? (
                      <Field
                        label="Capture panel"
                        htmlFor="m1-bed"
                        error={showError('bed', !bedCatalogId && genomeReady, 'Choose a capture panel.')}
                        className="[&>div:first-child]:sr-only"
                      >
                        <Module1BedPicker
                          id="m1-bed"
                          items={bedCatalog?.items || []}
                          value={bedCatalogId}
                          onChange={setBedCatalogId}
                          loading={bedCatalogLoading}
                          ready={Boolean(bedCatalog?.genome_ready)}
                          onTouched={() => touch('bed')}
                          error={Boolean(showError('bed', !bedCatalogId && genomeReady, 'x'))}
                        />
                      </Field>
                    ) : isUrlMode ? (
                      <div>
                        <UrlPickerRow
                          id="m1-bed-url"
                          label={null}
                          placeholder="https://…/capture_targets.bed"
                          state={urlState.bed}
                          onChange={(v) => setUrlValue('bed', v)}
                          onValidate={() => validateUrlRow('bed')}
                        />
                        <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                          The BED is validated for {genome} contig style after it is imported.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <FileSlot
                          id="m1-bed-file"
                          file={customBedFile}
                          accept=".bed"
                          placeholder="Choose or drop a .bed file"
                          error={customBedValidation && !customBedValidation.ok && !isValidatingBed}
                          onSelect={handleCustomBedSelect}
                        />
                        {customBedPrecheck?.ok === false && !customBedValidation && (
                          <p className="mt-1.5 flex items-start gap-1.5 px-1 text-xs text-[var(--warning)]">
                            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>First chromosome column ("{customBedPrecheck.sampleChrom}") doesn't look like hg38 style (expected e.g. "chr1").</span>
                          </p>
                        )}
                        {isValidatingBed && (
                          <p className="mt-1.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground" role="status">
                            <StageMark state="running" size={16} />
                            Validating BED file
                          </p>
                        )}
                        {customBedValidation && !isValidatingBed && (
                          <p
                            className={cn(
                              'wb-pop mt-1.5 flex items-start gap-1.5 px-1 text-xs',
                              customBedValidation.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'
                            )}
                            role={customBedValidation.ok ? 'status' : 'alert'}
                          >
                            <StageMark state={customBedValidation.ok ? 'done' : 'failed'} size={16} className="shrink-0" />
                            <span>
                              {customBedValidation.message ||
                                (customBedValidation.ok ? 'BED file looks valid for this genome.' : 'BED file failed validation.')}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </section>

                  <PipelineRunModeToggle
                    value={sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode}
                    onChange={(mode) =>
                      setSampleMetadata((prev) => applyPipelineRunModeChange(prev, mode))
                    }
                  />
                </>
              )}

              {metadataStep === 'analysis' && (
                <div className="space-y-4">
                  <p className="text-[13px] text-muted-foreground">
                    Nothing here is required. Clinical context sharpens prioritisation, and you can add it
                    later from Edit sample info.
                  </p>
                  <Disclosure
                    label="Add clinical details (optional)"
                    summary={detailsFilledCount > 0 ? `${detailsFilledCount} added` : null}
                    open={detailsOpen}
                    onToggle={() => setDetailsOpen((v) => !v)}
                  >
                    {individualFields}
                    {isGermline && (
                      <GermlinePedigreeFields
                        value={sampleMetadata}
                        onChange={(fields) => setSampleMetadata((prev) => ({ ...prev, ...fields }))}
                        Select={SelectWithDisabledOptions}
                      />
                    )}
                  </Disclosure>
                  {detailsFilledCount === 0 && !detailsOpen && <QuietSummary>No clinical details added.</QuietSummary>}
                </div>
              )}

              {metadataStep === 'phenotype' && (
                <div className="space-y-6">
                  {isGermline && (
                    <PhenotypeInputPanel
                      hideLabel
                      onDraftChange={setPhenotypeDraft}
                      value={{
                        phenotype_mode: sampleMetadata.phenotype_mode || PHENOTYPE_MODE_NOTE,
                        phenotype_findings: sampleMetadata.phenotype_findings || '',
                        phenotype_disease: sampleMetadata.phenotype_disease || '',
                        phenotype_note_clean: sampleMetadata.phenotype_note_clean || '',
                        phenotype_run_mode: normalizePipelineRunMode(
                          sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
                        ),
                        pipeline_run_mode: normalizePipelineRunMode(
                          sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
                        ),
                        phenotype: sampleMetadata.phenotype || '',
                        phenotype_hpo: sampleMetadata.phenotype_hpo,
                        selected_panels: sampleMetadata.selected_panels,
                        selected_panel_gene_list: sampleMetadata.selected_panel_gene_list,
                        selected_panel_include_amber: sampleMetadata.selected_panel_include_amber,
                      }}
                      onChange={(fields) =>
                        setSampleMetadata((prev) => {
                          const mode = normalizePipelineRunMode(
                            prev.pipeline_run_mode ||
                              prev.phenotype_run_mode ||
                              fields.pipeline_run_mode ||
                              fields.phenotype_run_mode
                          );
                          return {
                            ...prev,
                            ...fields,
                            pipeline_run_mode: mode,
                            phenotype_run_mode: mode,
                          };
                        })
                      }
                    />
                  )}

                  {showComputeChoice && (
                    <Module1ComputeChoice
                      value={effectiveComputeChoice}
                      onChange={setComputeChoice}
                      state={computeState}
                      disabled={module1Submitting}
                    />
                  )}

                  {isStaging && (
                    <p className="text-[13px] text-muted-foreground">
                      Your plan stages these files now. The run starts after you upgrade; nothing is queued yet.
                    </p>
                  )}

                  {module1Submitting && (
                    <SubmitProgress
                      progress={module1UploadProgress}
                      files={{ r1: r1File, r2: r2File, bed: bedMode === 'custom' && !isUrlMode ? customBedFile : null }}
                      status={module1ImportStatus}
                      isUrlMode={isUrlMode}
                      onCancelImport={cancelModule1Import}
                    />
                  )}
                </div>
              )}
             </WizardPanes>
            </div>

            <div className="flex-shrink-0 space-y-2.5 border-t border-[hsl(var(--wb-line))] px-5 py-3 sm:px-7 sm:py-4">
              {metadataStep === 'sample' && !essentialsReady && <MissingHint items={essentialsMissing} />}
              {metadataStep === 'sample' && finalBlockers.length > 0 && (
                <p className="text-xs text-[var(--error)]">{finalBlockers.join(' ')}</p>
              )}
              {isFinalStep && finalBlockers.length > 0 && (
                <p className="text-xs text-[var(--error)]" role="alert">{finalBlockers.join(' ')}</p>
              )}
              {isFinalStep && !isStaging && notProvided.length > 0 && !module1Submitting && (
                <QuietSummary>
                  Not provided: {notProvided.join(', ')}. You can add these later from Edit sample info.
                </QuietSummary>
              )}
              {/* Phones: the primary action first and full width, then Cancel, then Back. */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  {metadataStep !== 'sample' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      onClick={() => setMetadataStep(metadataStep === 'phenotype' ? 'analysis' : 'sample')}
                      disabled={module1Submitting}
                      className="max-sm:h-11 max-sm:w-full"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                      Back
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 max-sm:items-stretch">
                  <div className="flex items-center gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={closeNow}
                      className="max-sm:h-11 max-sm:w-full"
                    >
                      Cancel
                    </Button>
                    {!isFinalStep ? (
                      <Button
                        type="submit"
                        size="lg"
                        disabled={metadataStep === 'sample' ? !essentialsReady : false}
                        title={
                          metadataStep === 'sample' && !essentialsReady
                            ? `Still needed: ${essentialsMissing.join(', ')}`
                            : undefined
                        }
                        className="max-sm:h-11 max-sm:w-full"
                      >
                        Continue
                        <ArrowRight className="size-4" aria-hidden />
                      </Button>
                    ) : (
                      <StateButton
                        type="submit"
                        size="lg"
                        state={module1Submitting ? 'running' : 'idle'}
                        icon={Play}
                        labels={{ idle: finalSubmitLabel, running: isUrlMode ? 'Importing' : 'Uploading' }}
                        disabled={!canSubmit || analysisTypeMissing}
                        title={finalBlockers.length ? finalBlockers.join(' ') : undefined}
                        className="max-sm:h-11 max-sm:w-full"
                      />
                    )}
                  </div>
                </div>
              </div>
              {isFinalStep && showComputeChoice && (
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  Uses 1 run credit when results are delivered.
                  {runsLeftLabel ? ` ${runsLeftLabel}` : ''}
                  {gateMeterDetail ? ` ${gateMeterDetail}` : ''}
                </p>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={showDiscardConfirm} onOpenChange={(next) => { if (!next) setShowDiscardConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              The files and the details you entered will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <HoldButton
              holdMs={900}
              doneLabel="Discarded"
              onConfirm={() => {
                setShowDiscardConfirm(false);
                onClose?.();
              }}
            >
              Hold to discard upload
            </HoldButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default Module1UploadForm;
