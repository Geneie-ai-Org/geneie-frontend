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
import { precheckBedChromStyle } from '@/services/backendApi';
import { cn } from '@/lib/utils';

const GENOME_OPTIONS = [
  { value: 'hg38', label: 'hg38 (GRCh38)' },
  { value: 'hg19', label: 'hg19 (GRCh37)', disabled: true, disabledReason: 'hg19 (GRCh37) references are coming soon.' },
];

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

const Module1UploadForm = ({
  open,
  onClose,
  bedCatalog,
  bedCatalogLoading,
  loadBedCatalog,
  module1UploadProgress,
  module1Submitting,
  module1SubmitError,
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
    loadBedCatalog?.('hg38');
  }, [open, loadBedCatalog]);

  useEffect(() => {
    if (!open || bedMode !== 'catalog') return;
    loadBedCatalog?.(genome);
    setBedCatalogId('');
  }, [genome, bedMode, open, loadBedCatalog]);

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

  const bedResolved = bedMode === 'catalog' ? !!bedCatalogId : customBedValidation?.ok === true && !!customBedS3Key;
  const canSubmit =
    !!sampleName.trim() &&
    genome === 'hg38' &&
    sequencingType === 'WES' &&
    !!r1File &&
    !!r2File &&
    bedResolved &&
    !module1Submitting &&
    !isValidatingBed;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    startModule1Run({
      sampleName: sampleName.trim(),
      genome,
      sequencingType,
      r1File,
      r2File,
      bedCatalogId: bedMode === 'catalog' ? bedCatalogId : undefined,
      customBedS3Key: bedMode === 'custom' ? customBedS3Key : undefined,
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

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Capture BED <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setBedMode('catalog')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border"
                    style={{
                      borderColor: bedMode === 'catalog' ? 'var(--accent-teal)' : 'var(--border-default)',
                      color: bedMode === 'catalog' ? 'var(--accent-teal)' : 'var(--text-secondary)',
                      backgroundColor: bedMode === 'catalog' ? 'var(--accent-teal-soft)' : 'transparent',
                    }}
                  >
                    Use catalog BED
                  </button>
                  <button
                    type="button"
                    onClick={() => setBedMode('custom')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border"
                    style={{
                      borderColor: bedMode === 'custom' ? 'var(--accent-teal)' : 'var(--border-default)',
                      color: bedMode === 'custom' ? 'var(--accent-teal)' : 'var(--text-secondary)',
                      backgroundColor: bedMode === 'custom' ? 'var(--accent-teal-soft)' : 'transparent',
                    }}
                  >
                    Upload custom BED
                  </button>
                </div>

                {bedMode === 'catalog' ? (
                  <SelectWithDisabledOptions
                    value={bedCatalogId}
                    onChange={setBedCatalogId}
                    placeholder={bedCatalogLoading ? 'Loading…' : !bedCatalog?.genome_ready ? 'No catalog available for this genome' : 'Choose a BED file'}
                    options={(bedCatalog?.items || []).map((item) => ({ value: item.id, label: item.label || item.filename }))}
                  />
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
                {module1Submitting ? 'Starting…' : 'Start pipeline'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default Module1UploadForm;
