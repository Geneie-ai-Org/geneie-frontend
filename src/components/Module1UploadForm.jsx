import React, { useEffect, useState } from 'react';
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

/**
 * Select whose unavailable options render as greyed-out rows that toast their reason on
 * click instead of using SelectItem's `disabled` (which sets pointer-events: none, so the
 * row could never report why it is unavailable).
 */
function SelectWithDisabledOptions({ value, onChange, placeholder, options, className = '' }) {
  const items = Object.fromEntries((options || []).map((o) => [o.value, o.label]));
  return (
    <Select value={value || ''} onValueChange={onChange} items={items}>
      <SelectTrigger
        className={cn(
          'w-full !h-10 px-3 text-sm rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] data-placeholder:text-[var(--text-tertiary)]',
          className
        )}
        style={{ borderColor: 'var(--border-default)' }}
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

function PillToggle({ options, value, onChange }) {
  return (
    <div className="flex gap-2 mb-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border"
          style={{
            borderColor: value === opt.value ? 'var(--accent-teal)' : 'var(--border-default)',
            color: value === opt.value ? 'var(--accent-teal)' : 'var(--text-secondary)',
            backgroundColor: value === opt.value ? 'var(--accent-teal-soft)' : 'transparent',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * URL field for one Module 1 role. Validates on blur/Enter rather than behind a button —
 * the resolved `file_url` + `file_name` from preflight are what the import call needs,
 * since Drive/Dropbox share links are not directly downloadable.
 */
function UrlPickerRow({ label, required = true, placeholder, state, onChange, onValidate }) {
  const size = formatBytes(state.meta?.content_length);
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          {label} {required && <span style={{ color: 'var(--error)' }}>*</span>}
        </label>
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
      {!state.checking && !state.error && state.meta && (
        <div className="flex items-start gap-1.5 mt-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
          <span className="text-2xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {state.meta.file_name}{size ? ` · ${size}` : ''}
          </span>
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

  const validateUrlRow = async (role) => {
    const row = urlState[role] || EMPTY_URL_ROW;
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
    patchUrlRow(role, { checking: true, error: null });
    try {
      const result = await preflightModule1Url({ role, fileUrl: url });
      patchUrlRow(role, { checking: false, meta: result, error: null });
    } catch (error) {
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
    if (file.size > 50 * 1024 * 1024) {
      setCustomBedValidation({ ok: false, message: 'BED file must be 50MB or smaller.' });
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
  const canSubmit =
    !!sampleName.trim() &&
    genome === 'hg38' &&
    sequencingType === 'WES' &&
    readsResolved &&
    bedResolved &&
    !module1Submitting &&
    !isValidatingBed &&
    !anyUrlChecking;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const useCustomBed = bedMode === 'custom';
    startModule1Run({
      sampleName: sampleName.trim(),
      genome,
      sequencingType,
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
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Raw data <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <PillToggle
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
              {module1Submitting && module1ImportStatus && (
                <div className="flex items-center gap-1.5 mr-auto min-w-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: 'var(--accent-teal)' }} />
                  <span className="text-2xs truncate" style={{ color: 'var(--text-tertiary)' }}>{module1ImportStatus}</span>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg border"
                style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
              >
                {module1Submitting ? (isUrlMode ? 'Importing…' : 'Starting…') : 'Start pipeline'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default Module1UploadForm;
