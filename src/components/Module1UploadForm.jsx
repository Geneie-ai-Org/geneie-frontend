import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { PillToggle } from '@/components/ui/pill-toggle';
import { MODULE1_BED_MAX_BYTES, MODULE1_FASTQ_MAX_BYTES } from '@/services/backendApi';
import { isRecognizedImportUrl, module1UrlErrorMessage, precheckBedChromStyle } from '@/services/backendApi';
import { cn } from '@/lib/utils';

const GENOME_OPTIONS = [
  { value: 'hg38', label: 'hg38 (GRCh38)' },
  { value: 'hg19', label: 'hg19 (GRCh37)', disabled: true, disabledReason: 'hg19 (GRCh37) references are coming soon.' },
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
  { value: 'Tumor-Normal Paired', label: 'Tumor-Normal Paired' },
  { value: 'Tumor-Only', label: 'Tumor-Only' },
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
  phenotype: '',
};

/**
 * Select whose unavailable options render as greyed-out rows that toast their reason on
 * click instead of using SelectItem's `disabled` (which sets pointer-events: none, so the
 * row could never report why it is unavailable).
 */
function SelectWithDisabledOptions({ value, onChange, placeholder, options, className = '', error = false }) {
  const items = Object.fromEntries((options || []).map((o) => [o.value, o.label]));
  return (
    <Select value={value || ''} onValueChange={onChange} items={items}>
      <SelectTrigger
        className={cn(
          'w-full !h-10 px-3 text-sm rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] data-placeholder:text-[var(--text-tertiary)]',
          className
        )}
        style={{ borderColor: error ? 'var(--error)' : 'var(--border-default)' }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="p-1.5">
        {(options || []).map((opt) =>
          opt.disabled ? (
            <div
              key={opt.value}
              role="option"
              aria-disabled="true"
              aria-selected="false"
              className="relative flex w-full cursor-not-allowed items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-sm select-none"
              style={{ color: 'var(--text-tertiary)' }}
              // Keep the popup open so the toast reads as a response to this row.
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toast.info(opt.disabledReason);
              }}
            >
              {opt.label}
            </div>
          ) : (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}

function FilePickerRow({ label, file, onSelect, progress, accept }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label} <span style={{ color: 'var(--error)' }}>*</span>
      </label>
      <label
        className="flex items-center gap-2 w-full px-3 h-10 border rounded-lg text-sm cursor-pointer transition-all"
        style={{ borderColor: 'var(--border-default)', background: 'var(--bg-input)', color: file ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
      >
        <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-teal)' }} />
        <span className="truncate">{file?.name || `Choose ${label} file…`}</span>
        <input type="file" accept={accept} className="hidden" onChange={(e) => onSelect(e.target.files?.[0] || null)} />
      </label>
      {progress != null && (
        <Progress value={progress} className="mt-1.5" />
      )}
    </div>
  );
}

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
 * URL field for one Module 1 role. Validates on blur/Enter rather than behind a button —
 * the resolved `file_url` + `file_name` from preflight are what the import call needs,
 * since Drive/Dropbox share links are not directly downloadable.
 */
function UrlPickerRow({ label, required = true, placeholder, state, onChange, onValidate }) {
  const size = formatBytes(state.meta?.content_length);
  const resolved = !state.checking && !state.error && !!state.meta;
  const resolvedName = resolved ? (state.meta.file_name || basenameFromUrl(state.meta.file_url) || 'Linked file') : '';
  const resolvedLabel = resolved ? `${resolvedName}${size ? ` · ${size}` : ''}` : '';
  return (
    <div>
      {(label || resolved) && (
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          {label ? (
            <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {label} {required && <span style={{ color: 'var(--error)' }}>*</span>}
            </label>
          ) : (
            <span aria-hidden="true" />
          )}
          {resolved && (
            <span className="flex items-center gap-1 min-w-0 text-2xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="truncate">{resolvedLabel}</span>
            </span>
          )}
        </div>
      )}
      <input
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
        className="w-full px-3 h-10 border rounded-lg text-sm focus:outline-none placeholder:text-[var(--text-tertiary)]"
        style={{
          borderColor: state.error ? 'var(--error)' : 'var(--border-default)',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
        }}
      />
      {state.checking && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-teal)' }} />
          <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>Checking link…</span>
        </div>
      )}
      {!state.checking && state.error && (
        <div className="flex items-start gap-1.5 mt-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
          <span className="text-2xs" style={{ color: 'var(--error)' }}>{state.error}</span>
        </div>
      )}
    </div>
  );
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
}) => {
  const [sampleName, setSampleName] = useState('');
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

  const isUrlMode = sourceMode === 'url';
  const anyUrlChecking = isUrlMode && Object.values(urlState).some((row) => row.checking);
  const readsResolved = isUrlMode ? !!urlState.r1.meta && !!urlState.r2.meta : !!r1File && !!r2File;
  const bedResolved =
    bedMode === 'catalog'
      ? !!bedCatalogId
      : isUrlMode
        ? !!urlState.bed.meta
        : customBedValidation?.ok === true && !!customBedS3Key;
  // `=== false` so an absent gate (degraded limits, still loading) never disables submit.
  const quotaBlocked = gate?.allowed === false;
  const gateMeter = gate?.meter;
  const gateMeterLabel = gateMeter?.tracked && !gateMeter.unlimited && gateMeter.remaining != null
    ? `${gateMeter.remaining} of ${gateMeter.limit} Module 1 runs left`
    : null;
  // Free stages the files and runs after upgrading, so the button says what will happen.
  const submitLabel = gate?.staging ? 'Stage files' : 'Start pipeline';
  const oversizedRead = [r1File, r2File].find((f) => f && f.size > MODULE1_FASTQ_MAX_BYTES) || null;

  const canSubmit =
    !!sampleName.trim() &&
    genome === 'hg38' &&
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
  const phenotypeMissing = isGermline && !sampleMetadata.phenotype.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setValidationAttempted(true);
    if (analysisTypeMissing || phenotypeMissing) return;
    const useCustomBed = bedMode === 'custom';
    startModule1Run({
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
              phenotype: sampleMetadata.phenotype.trim(),
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
    });
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
        <DialogContent
          showCloseButton
          className="!max-w-2xl w-full max-h-[min(96vh,900px)] flex flex-col p-0 gap-0 overflow-hidden ring-0 border"
          style={{ backgroundColor: 'var(--bg-surface-raised)', boxShadow: 'var(--shadow-lg)', borderColor: 'var(--border-default)' }}
        >
          <DialogTitle className="sr-only">Upload raw sequencing data (FASTQ)</DialogTitle>
          <DialogDescription className="sr-only">
            Upload paired FASTQ files to run the Module 1 variant-calling pipeline.
          </DialogDescription>

          <div className="flex-shrink-0 px-7 pt-6 pb-4">
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Upload raw sequencing data
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Upload paired FASTQ files (R1 + R2). Typical runtime: 2–4 hours — you can close this and keep using the app.
            </p>
            {module1SubmitError && (
              <div className="mt-4 p-3 border rounded-lg flex items-start gap-2" style={{ backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
                <p className="text-xs" style={{ color: 'var(--error)' }}>{module1SubmitError}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-7 pb-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sample name <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={sampleName}
                    onChange={(e) => setSampleName(e.target.value)}
                    className="w-full px-3 h-10 border rounded-lg text-sm"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    placeholder="e.g. EB74_S2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Genome <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <SelectWithDisabledOptions value={genome} onChange={setGenome} placeholder="Choose one" options={GENOME_OPTIONS} />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sequencing type <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <SelectWithDisabledOptions
                    value={sequencingType}
                    onChange={setSequencingType}
                    placeholder="Choose one"
                    options={SEQUENCING_TYPE_OPTIONS}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sample sex
                  </label>
                  <SelectWithDisabledOptions
                    value={sampleMetadata.sampleSex}
                    onChange={(val) => setSampleMetadata((prev) => ({ ...prev, sampleSex: val }))}
                    placeholder="Choose one"
                    options={SAMPLE_SEX_OPTIONS}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Analysis type <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <SelectWithDisabledOptions
                    value={sampleMetadata.analysisType}
                    onChange={(val) => setSampleMetadata((prev) => ({ ...prev, analysisType: val }))}
                    placeholder="Choose one"
                    options={ANALYSIS_TYPE_OPTIONS}
                    error={validationAttempted && analysisTypeMissing}
                  />
                  {validationAttempted && analysisTypeMissing && (
                    <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>
                      Select an analysis type.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sample source
                  </label>
                  <SelectWithDisabledOptions
                    value={sampleMetadata.sampleSource}
                    onChange={(val) => setSampleMetadata((prev) => ({ ...prev, sampleSource: val }))}
                    placeholder="Choose one"
                    options={SAMPLE_SOURCE_OPTIONS}
                  />
                </div>

              </div>

              {isGermline && (
                <div className="disclosure-enter border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
                  <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Germline analysis fields
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Sample role
                      </label>
                      <SelectWithDisabledOptions
                        value={sampleMetadata.sampleRole}
                        onChange={(val) => setSampleMetadata((prev) => ({ ...prev, sampleRole: val }))}
                        placeholder="Choose one"
                        options={SAMPLE_ROLE_OPTIONS}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Affected status
                      </label>
                      <SelectWithDisabledOptions
                        value={sampleMetadata.affectedStatus}
                        onChange={(val) => setSampleMetadata((prev) => ({ ...prev, affectedStatus: val }))}
                        placeholder="Choose one"
                        options={AFFECTED_STATUS_OPTIONS}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Inheritance model
                      </label>
                      <SelectWithDisabledOptions
                        value={sampleMetadata.inheritanceModel}
                        onChange={(val) => setSampleMetadata((prev) => ({ ...prev, inheritanceModel: val }))}
                        placeholder="Choose one"
                        options={INHERITANCE_MODEL_OPTIONS}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Phenotype <span style={{ color: 'var(--error)' }}>*</span>
                      </label>
                      <textarea
                        value={sampleMetadata.phenotype}
                        onChange={(e) => setSampleMetadata((prev) => ({ ...prev, phenotype: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                        style={{
                          borderColor: validationAttempted && phenotypeMissing ? 'var(--error)' : 'var(--border-default)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                        }}
                        placeholder="Describe the phenotype or clinical presentation…"
                      />
                      {validationAttempted && phenotypeMissing && (
                        <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>
                          Required for Germline analysis — used for Exomiser phenotype prioritization.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Raw data <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <PillToggle
                  className="mb-2"
                  value={sourceMode}
                  onChange={handleSourceModeChange}
                  options={[
                    { value: 'file', label: 'From computer' },
                    { value: 'url', label: 'From URL' },
                  ]}
                />
                {isUrlMode ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                      <UrlPickerRow
                        label="R1 link"
                        placeholder="https://…/sample_R1_001.fastq.gz"
                        state={urlState.r1}
                        onChange={(v) => setUrlValue('r1', v)}
                        onValidate={() => validateUrlRow('r1')}
                      />
                      <UrlPickerRow
                        label="R2 link"
                        placeholder="https://…/sample_R2_001.fastq.gz"
                        state={urlState.r2}
                        onChange={(v) => setUrlValue('r2', v)}
                        onValidate={() => validateUrlRow('r2')}
                      />
                    </div>
                    <p className="text-2xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                      Direct https links, Google Drive or Dropbox share links (
                      <span style={{ color: 'var(--text-secondary)' }}>&ldquo;Anyone with the link&rdquo;</span>), or
                      presigned S3 URLs. Files are copied server-side after you start the run.
                    </p>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                    <FilePickerRow
                      label="R1"
                      file={r1File}
                      onSelect={setR1File}
                      progress={module1UploadProgress?.r1}
                      accept=".fastq.gz,.fastq,.fq.gz,.fq"
                    />
                    <FilePickerRow
                      label="R2"
                      file={r2File}
                      onSelect={setR2File}
                      progress={module1UploadProgress?.r2}
                      accept=".fastq.gz,.fastq,.fq.gz,.fq"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Capture BED <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <PillToggle
                  className="mb-2"
                  value={bedMode}
                  onChange={setBedMode}
                  options={[
                    { value: 'catalog', label: 'Use catalog BED' },
                    { value: 'custom', label: isUrlMode ? 'Custom BED from URL' : 'Upload custom BED' },
                  ]}
                />

                {bedMode === 'catalog' ? (
                  <SelectWithDisabledOptions
                    value={bedCatalogId}
                    onChange={setBedCatalogId}
                    placeholder={bedCatalogLoading ? 'Loading…' : !bedCatalog?.genome_ready ? 'No catalog available for this genome' : 'Choose a BED file'}
                    options={(bedCatalog?.items || []).map((item) => ({ value: item.id, label: item.label || item.filename }))}
                  />
                ) : isUrlMode ? (
                  <div>
                    <UrlPickerRow
                      label={null}
                      placeholder="https://…/capture_targets.bed"
                      state={urlState.bed}
                      onChange={(v) => setUrlValue('bed', v)}
                      onValidate={() => validateUrlRow('bed')}
                    />
                    <p className="text-2xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      The BED is validated for {genome} contig style after it is imported.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label
                      className="flex items-center gap-2 w-full px-3 h-10 border rounded-lg text-sm cursor-pointer"
                      style={{ borderColor: 'var(--border-default)', background: 'var(--bg-input)', color: customBedFile ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                    >
                      <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-teal)' }} />
                      <span className="truncate">{customBedFile?.name || 'Choose .bed file…'}</span>
                      <input type="file" accept=".bed" className="hidden" onChange={(e) => handleCustomBedSelect(e.target.files?.[0] || null)} />
                    </label>
                    {customBedPrecheck?.ok === false && !customBedValidation && (
                      <p className="text-2xs mt-1" style={{ color: 'var(--warning)' }}>
                        First chromosome column ("{customBedPrecheck.sampleChrom}") doesn't look like hg38 style (expected e.g. "chr1").
                      </p>
                    )}
                    {isValidatingBed && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-teal)' }} />
                        <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>Validating BED file…</span>
                      </div>
                    )}
                    {customBedValidation && !isValidatingBed && (
                      <div className="flex items-start gap-1.5 mt-1.5">
                        {customBedValidation.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
                        )}
                        <span className="text-2xs" style={{ color: customBedValidation.ok ? 'var(--success)' : 'var(--error)' }}>
                          {customBedValidation.message ||
                            (customBedValidation.ok ? 'BED file looks valid for this genome.' : 'BED file failed validation.')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 px-7 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: 'var(--border-default)' }}>
              {(quotaBlocked || gateMeterLabel || oversizedRead) && (
                <p
                  className="text-2xs mr-auto min-w-0"
                  style={{ color: (quotaBlocked || oversizedRead) ? 'var(--error)' : 'var(--text-tertiary)' }}
                >
                  {oversizedRead
                    ? `${oversizedRead.name} is larger than the ${MODULE1_FASTQ_MAX_BYTES / 1024 ** 3} GB limit per FASTQ.`
                    : quotaBlocked ? gate.reason : gateMeterLabel}
                  {!oversizedRead && !quotaBlocked && gateMeterDetail && ` · ${gateMeterDetail}`}
                </p>
              )}
              {module1Submitting && module1ImportStatus && (
                <div className="flex items-center gap-1.5 mr-auto min-w-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--accent-teal)' }} />
                  <span className="text-2xs truncate" style={{ color: 'var(--text-tertiary)' }}>{module1ImportStatus}</span>
                  {/* A multi-GB import can run for many minutes*/}
                  {cancelModule1Import && isUrlMode && (
                    <button
                      type="button"
                      onClick={cancelModule1Import}
                      className="text-2xs underline flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => { cancelModule1Import?.(); onClose(); }}
                className="px-4 py-2 text-sm font-medium rounded-lg border"
                style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                title={quotaBlocked ? gate.reason : undefined}
                className="px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
              >
                {module1Submitting ? (isUrlMode ? 'Importing…' : 'Starting…') : submitLabel}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default Module1UploadForm;
