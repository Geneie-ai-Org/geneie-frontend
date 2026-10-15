import React, { useState, useEffect, useId } from 'react';
import { CheckCircle2, AlertCircle, ChevronRight, FileText, Info, Minus, Trash2, Filter, Stethoscope, Tags, X } from 'lucide-react';
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

const CHIP_TONES = {
  success: [C.successSoft, C.success],
  info: [C.infoSoft, C.info],
  warning: [C.warningSoft, C.warning],
  error: [C.errorSoft, C.error],
  neutral: [C.track, C.textMuted],
};

/** Status as a word plus a small dot. */
function Chip({ tone = 'neutral', children }) {
  const [bg, fg] = CHIP_TONES[tone] || CHIP_TONES.neutral;
  return (
    <span
      className="inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium"
      style={{ background: bg, color: fg }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: fg }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Inline notice: flat soft status fill, readable foreground text. */
function Notice({ tone = 'info', icon: Icon = Info, children }) {
  const [bg, fg] = CHIP_TONES[tone] || CHIP_TONES.info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed"
      style={{ background: bg, color: C.text }}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: fg }} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
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

/** One column, one 32px row: status icon, the role we need, the file's column, and a status word. */
function ColumnRow({ role, matched, tone = 'success', word, note }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Minus;
  const color = tone === 'success' ? C.success : tone === 'error' ? C.error : C.textMuted;
  return (
    <li className="flex h-8 items-center gap-2 border-b border-[var(--border-subtle)] px-4 text-[13px] sm:px-6 max-md:min-h-11">
      <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate" style={{ color: C.text }} title={note || role}>
        {role}
      </span>
      {matched ? (
        <span className="max-w-[40%] shrink-0 truncate font-mono text-[12px]" style={{ color: C.textMuted }} title={`Column in your file: ${matched}`}>
          {matched}
        </span>
      ) : null}
      <span className="w-16 shrink-0 text-right text-[12px]" style={{ color }}>
        {word}
      </span>
    </li>
  );
}

/** Disclosure group with a sticky 32px header carrying the found / missing counts. */
function ColumnGroup({ label, found, missing, open, onToggle, children }) {
  const panelId = useId();
  return (
    <section>
      <h4 className="sticky top-0 z-10 m-0 border-b border-[var(--border-subtle)] bg-background">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex h-8 w-full items-center gap-2 px-4 text-left text-[12px] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55 sm:px-6 max-md:min-h-11"
        >
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
            style={{ color: C.textDim }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate" style={{ color: C.text }}>{label}</span>
          <span className="shrink-0 tabular-nums" style={{ color: C.textMuted }}>
            <span style={{ color: C.success }}>{found} found</span>
            {missing > 0 ? (
              <>
                {' '}&middot; <span style={{ color: C.error }}>{missing} missing</span>
              </>
            ) : null}
          </span>
        </button>
      </h4>
      {open ? (
        <ul id={panelId} className="m-0 list-none p-0">
          {children}
        </ul>
      ) : null}
    </section>
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
}) => {
  const [expandedStep, setExpandedStep] = useState(initialStep ?? (hasAnnotatedFile ? 2 : null)); // Track which step is expanded
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Explicit remove-file confirmation only
  const [showAnnovarConfirm, setShowAnnovarConfirm] = useState(false); // Confirm Annotation when all columns present
  const [openGroups, setOpenGroups] = useState({}); // sectionKey -> open (unset = open only when something is missing)

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

  const backgroundJobActive = isRunningAnnovar || isApplyingProprietaryFilter;
  const genomeMismatch = interpretationResult?.genome_build_check?.status === 'mismatch';

  if (!interpretationResult) return null;

  const { step1, step2, step3, overall_status, recommendations } = interpretationResult;
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

  // Determine status for each step
  const step1Status = step1?.passed ? 'passed' : 'failed';
  const step2Req = step2?.required_columns || {};
  const step2AcmgReady = Boolean(
    step2Req.CLNSIG?.found || step2Req.InterVar_automated?.found
  );
  const step2Status = step2?.not_implemented
    ? 'pending'
    : step2?.passed
      ? 'passed'
      : step2?.partially_passed
        ? 'partial'
        : 'failed';
  const step3Status = step3?.not_implemented ? 'pending' : (step3?.passed ? 'passed' : 'failed');

  // Calculate Step 1 progress percentage based on found columns
  const step1Progress = (() => {
    if (step1?.passed) return 100;
    const required = step1?.required_columns || {};
    const totalRequired = Object.keys(required).length;
    if (totalRequired === 0) return 0;
    const foundCount = Object.values(required).filter(col => col.found).length;
    return Math.round((foundCount / totalRequired) * 100);
  })();

  // Calculate Step 2 progress (proprietary filter columns + pathogenicity predictors)
  const step2Progress = (() => {
    if (step2?.passed) return 100;
    if (step2?.not_implemented) return 0;

    const required = step2?.required_columns || {};
    const predictors = step2?.pathogenicity_predictor_group || {};
    const requiredFound = Object.values(required).filter((col) => col.found).length;
    const totalRequired = Object.keys(required).length;
    const predictorFound = Object.values(predictors).filter((col) => col.found).length;
    const minPredictors = 2;

    let progress = totalRequired > 0 ? (requiredFound / totalRequired) * 70 : 0;
    progress += Math.min(predictorFound / minPredictors, 1) * 30;
    return Math.round(Math.min(progress, 99));
  })();

  // Calculate Step 3 progress percentage based on found columns
  const step3Progress = (() => {
    if (step3?.passed) return 100;
    if (step3?.not_implemented) return 0;
    
    const required = step3?.required_columns || {};
    const sample_genotype_group = step3?.sample_genotype_group || {};
    const pathogenicity_score_group = step3?.pathogenicity_score_group || {};
    const conditional = step3?.conditional_columns || {};
    
    // Count required columns found
    const requiredFound = Object.values(required).filter(col => col.found).length;
    const totalRequired = Object.keys(required).length;
    
    // Check if at least one from each group is found
    const hasGenotype = Object.values(sample_genotype_group).some(col => col.found);
    const hasScore = Object.values(pathogenicity_score_group).some(col => col.found);
    
    // Count conditional columns that are required and found
    // Conditional columns are marked with col.required = true if they're actually required
    const conditionalEntries = Object.entries(conditional);
    const conditionalRequired = conditionalEntries.filter(([_, col]) => col.required && col.found).length;
    const totalConditionalRequired = conditionalEntries.filter(([_, col]) => col.required).length;
    
    // Step 3 needs: all required + 1 genotype + 1 score + required conditionals
    // Each component is weighted equally
    const components = [];
    
    // Required columns component (0-100% based on found/total)
    if (totalRequired > 0) {
      components.push((requiredFound / totalRequired) * 100);
    }
    
    // Genotype group component (0 or 100%)
    components.push(hasGenotype ? 100 : 0);
    
    // Score group component (0 or 100%)
    components.push(hasScore ? 100 : 0);
    
    // Conditional required component (0-100% based on found/total)
    if (totalConditionalRequired > 0) {
      components.push((conditionalRequired / totalConditionalRequired) * 100);
    }
    
    // Average all components
    if (components.length === 0) return 0;
    const average = components.reduce((sum, val) => sum + val, 0) / components.length;
    return Math.round(average);
  })();

  // Get overall recommendations (now generated at top level, not per-step)
  // Recommendations are now short and prioritized:
  // - TSV/CSV:
  //     - If Step 1 fails: "Upload a VCF file (VCF tab) to enable ANNOVAR annotation."
  // - VCF:
  //     - If Step 1 fails: Essential VCF columns missing → recommend raw data upload (no ANNOVAR).
  // - Any source:
  //     - If Step 1 passes but Step 2/3 fails: "Run ANNOVAR to add missing columns."
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
  
  // Get primary recommendation (first one, usually most important)
  const primaryRecommendation = allRecommendations.length > 0 ? allRecommendations[0] : null;
  
  // Determine which button is recommended based on step status
  const getRecommendedButton = () => {
    if (!step1?.passed) {
      // For TSV/CSV, recommend VCF upload. For VCF uploads, Step 1 failure means
      // essential VCF columns are missing — recommend raw sequencing (FASTQ) upload.
      return isVcfFile ? 'fastq' : 'vcf';
    } else if (!step2?.passed) {
      return 'annovar';
    } else if (!step3?.passed) {
      return null;
    }
    return null; // No specific recommendation, all passed
  };
  
  const recommendedButton = getRecommendedButton();

  const getStepLabel = (status) => {
    if (status === 'passed') return 'Complete';
    if (status === 'pending') return 'Pending';
    return 'Incomplete';
  };

  // Short status line shown under each stepper node.
  const getStepSubtitle = (status) => {
    if (status === 'passed') return 'Complete';
    if (status === 'pending') return 'Pending';
    if (status === 'partial') return 'Partially met';
    return 'Needs columns';
  };

  /** One group of columns as a list: a sticky header with the counts, then one 32px row per column.
   *  Groups with nothing missing start collapsed; groups with a problem start open. */
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
            role={colName}
            tone={missingTone}
            word={columnsNoValidValues.includes(colName) ? 'No values' : opts.missingLabel || 'Missing'}
          />
        ))}
        {found.map(([colName, colInfo]) => (
          <ColumnRow
            key={colName}
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
            role={colName}
            tone={colInfo.required ? 'error' : 'neutral'}
            word={colInfo.required ? 'Missing' : 'Optional'}
          />
        ))}
        {found.map(([colName, colInfo]) => (
          <ColumnRow
            key={colName}
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

  const renderStepDetails = (stepNumber, stepData) => {
    if (stepNumber === 1) {
      const required = stepData.required_columns || {};
      const columnsNoValidValues = stepData.columns_no_valid_values || [];
      return (
        <div className="-mx-4 sm:-mx-6">
          {renderColumnGroup(`step1_required`, 'Required columns', required, columnsNoValidValues)}
        </div>
      );
    } else if (stepNumber === 2) {
      if (stepData.not_implemented) {
        return (
          <Notice tone="info" icon={Info}>
            Column definitions are pending. Proprietary filters stay unavailable until the column list is provided.
          </Notice>
        );
      }

      const required = stepData.required_columns || {};
      const pathogenicity_group = stepData.pathogenicity_predictor_group || {};
      const missing_groups = stepData.missing_groups || [];
      const columnsNoValidValues = stepData.columns_no_valid_values || [];

      return (
        <div className="space-y-3 text-sm">
          <div className="-mx-4 sm:-mx-6">
          {renderColumnGroup(`step2_required`, 'Required columns', required, columnsNoValidValues)}
          {renderColumnGroup(`step2_pathogenicity`, 'Pathogenicity predictors (at least 2 required)', pathogenicity_group, columnsNoValidValues, { missingLabel: 'Not found', minFound: 2 })}
          </div>

          {missing_groups.length > 0 && (
            <Notice tone="error" icon={AlertCircle}>
              <p className="font-medium">Missing groups</p>
              <ul className="mt-1 list-inside list-disc">
                {missing_groups.map((group, idx) => (
                  <li key={idx}>{group}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      );
    } else if (stepNumber === 3) {
      if (stepData.not_implemented) {
        return null;
      }

      const required = stepData.required_columns || {};
      const sample_genotype_group = stepData.sample_genotype_group || {};
      const pathogenicity_score_group = stepData.pathogenicity_score_group || {};
      const conditional = stepData.conditional_columns || {};
      const columnsNoValidValues = stepData.columns_no_valid_values || [];
      const optional = stepData.optional_columns || {};
      const missing_groups = stepData.missing_groups || [];

      return (
        <div className="space-y-3 text-sm">
          <div className="-mx-4 sm:-mx-6">
          {renderColumnGroup(`step3_required`, 'Required columns', required, columnsNoValidValues)}
          {renderColumnGroup(`step3_genotype`, 'Sample genotype (any one required)', sample_genotype_group, columnsNoValidValues, { missingLabel: 'Not found', minFound: 1 })}
          {renderColumnGroup(`step3_pathscore`, 'Pathogenicity scores (any one required)', pathogenicity_score_group, columnsNoValidValues, { missingLabel: 'Not found', minFound: 1 })}
          {renderConditionalGroup(`step3_conditional`, 'Conditional columns', conditional)}
          {renderColumnGroup(`step3_optional`, 'Optional columns', optional, [], { missingLabel: 'Not found', optional: true })}
          </div>

          {missing_groups.length > 0 && (
            <Notice tone="warning" icon={AlertCircle}>
              <p className="font-medium">Missing column groups</p>
              <ul className="mt-1 list-inside list-disc">
                {missing_groups.map((group, idx) => (
                  <li key={idx}>{group}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      );
    }
    return null;
  };

  /** Close dialog only — file stays on the conversation (Phase F background UX). */
  const handleDismiss = () => {
    onClose?.();
  };

  const handleConfirmDelete = async () => {
    if (onDeleteDocument) {
      await onDeleteDocument();
    }
    setShowDeleteConfirm(false);
    onClose?.();
  };

  // --- Stepper model ---
  const stepperSteps = [
    {
      n: 1,
      name: isVcfFile ? 'Ready for annotation' : 'VCF reconstruction',
      icon: FileText,
      status: step1Status,
      progress: step1Progress,
      data: step1,
    },
    {
      n: 2,
      name: step2?.step_name || 'Annotation stage',
      icon: Filter,
      status: step2Status,
      progress: step2Progress,
      data: step2,
    },
    {
      n: 3,
      name: 'Clinical decision',
      icon: Stethoscope,
      status: step3Status,
      progress: step3Progress,
      data: step3,
    },
  ];

  // Always start on Step 1 — users walk through the pipeline in order via Next/Prev.
  const selectedStep = expandedStep ?? 1;
  const selectedStepData = stepperSteps.find((s) => s.n === selectedStep);
  const canGoBack = selectedStep > 1;
  const canGoForward = selectedStep < stepperSteps.length;
  const nextIsPrimary = selectedStepData?.status !== 'failed';
  const goToStep = (n) => setExpandedStep(Math.max(1, Math.min(stepperSteps.length, n)));

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

  const stepTone = (status) =>
    status === 'passed' ? 'success' : status === 'pending' ? 'info' : status === 'partial' ? 'warning' : 'error';

  const columnTotals = [step1, step2, step3].map(summarizeStep).reduce(
    (acc, t) => ({ found: acc.found + t.found, missing: acc.missing + t.missing }),
    { found: 0, missing: 0 }
  );

  // Arrow keys, Home and End move between the step tabs (roving tabindex, automatic activation).
  const onStepTabKeyDown = (e) => {
    const last = stepperSteps.length;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = selectedStep >= last ? 1 : selectedStep + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = selectedStep <= 1 ? last : selectedStep - 1;
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = last;
    if (next == null) return;
    e.preventDefault();
    setExpandedStep(next);
    document.getElementById(`file-step-tab-${next}`)?.focus();
  };

  const header = (
    <div className="flex-shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="file-analysis-title" className="text-sm font-semibold" style={{ color: C.text }}>
            File analysis
          </h2>
          <p className="mt-0.5 text-[13px]" style={{ color: C.textMuted }}>
            {overall_status === 'passed' ? 'Your file is ready for analysis.' : 'Some features may be limited.'}
          </p>
          <p className="mt-1 text-[13px] tabular-nums" style={{ color: C.textMuted }}>
            <span style={{ color: C.success }}>{columnTotals.found.toLocaleString()} found</span>
            {' '}&middot;{' '}
            <span style={{ color: columnTotals.missing > 0 ? C.error : C.textMuted }}>
              {columnTotals.missing.toLocaleString()} missing
            </span>
            {' '}across {stepperSteps.length} steps
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone={overall_status === 'passed' ? 'success' : 'warning'}>
            {overall_status === 'passed' ? 'Ready' : 'Limited'}
          </Chip>
          {!embedded && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onClose?.()}
              aria-label="Close"
              className="-mr-1.5 max-md:size-11"
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
      {backgroundJobActive && (
        <Notice tone="info" icon={Info}>
          {isRunningAnnovar
            ? 'Annotation is running in the background. You can leave this view and continue in chat. Progress shows in the Pipeline tab.'
            : 'The ACMG filter is running in the background. You can leave this view and continue in chat.'}
        </Notice>
      )}

      {rowsFlagged > 0 && (
        <Notice tone="warning" icon={AlertCircle}>
          <span className="font-medium tabular-nums">{rowsFlagged.toLocaleString()}</span> rows flagged for quality
          review. All stored.
        </Notice>
      )}

      {gbc?.status === 'mismatch' && (
        <Notice tone="error" icon={AlertCircle}>
          <span className="font-medium">Genome mismatch.</span>{' '}
          {gbc.message ||
            `You selected ${(gbc.declared || '').toUpperCase()}, but coordinates match ${(gbc.likely || '').toUpperCase()}. Annotation and phenotype prioritization cannot run until this is resolved. Update the genome in sample information or re-upload.`}
        </Notice>
      )}
      {gbc?.status === 'match' && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: C.textMuted }}>
          <CheckCircle2 className="size-3.5" style={{ color: C.success }} aria-hidden />
          Genome build verified: {(gbc.declared || '').toUpperCase()}
        </p>
      )}
      {gbc?.status === 'inconclusive' && (
        <Notice tone="warning" icon={AlertCircle}>
          {gbc.message || 'Could not verify the genome build. Double-check it before running annotation.'}
        </Notice>
      )}

      {/* Steps */}
      <div role="tablist" aria-label="Analysis steps" aria-orientation="horizontal" onKeyDown={onStepTabKeyDown} className="grid grid-cols-3 gap-2">
        {stepperSteps.map((s) => {
          const isSel = s.n === selectedStep;
          const tone = stepTone(s.status);
          return (
            <button
              key={s.n}
              type="button"
              role="tab"
              id={`file-step-tab-${s.n}`}
              aria-selected={isSel}
              aria-controls="file-step-panel"
              tabIndex={isSel ? 0 : -1}
              onClick={() => setExpandedStep(s.n)}
              className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55 max-md:min-h-11"
              style={{
                borderColor: isSel ? 'hsl(var(--primary))' : C.border,
                background: isSel ? C.tealSoft : 'transparent',
              }}
            >
              <span className="text-[12px] tabular-nums" style={{ color: C.textMuted }}>
                Step {s.n}
              </span>
              <span className="text-[13px] font-medium leading-tight" style={{ color: C.text }}>
                {s.name}
              </span>
              <Chip tone={tone}>{getStepSubtitle(s.status)}</Chip>
              <span
                aria-hidden
                className="block h-1 w-full overflow-hidden rounded-full"
                style={{ background: C.track }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${s.progress}%`,
                    background: s.status === 'passed' ? C.success : s.status === 'failed' ? C.error : C.teal,
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected step detail */}
      {selectedStepData && (
        <div
          role="tabpanel"
          id="file-step-panel"
          aria-labelledby={`file-step-tab-${selectedStepData.n}`}
          tabIndex={0}
          className="space-y-3 border-t border-border pt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <h3 className="text-[13px] font-semibold" style={{ color: C.text }}>
            {selectedStepData.name}
          </h3>
          {renderStepDetails(selectedStepData.n, selectedStepData.data) || (
            <p className="text-xs" style={{ color: C.textMuted }}>
              No column details available for this step yet.
            </p>
          )}
        </div>
      )}

      {/* Limitation: not all Pathog predictor columns present (Step 2) */}
      {step2?.pathogenicity_predictor_limitation && (
        <Notice tone="warning" icon={AlertCircle}>
          Not all pathogenicity predictor columns are present. Filtering works with the predictors you have
          (for example SIFT, PolyPhen); results may be limited.
        </Notice>
      )}

      {/* Actions for this step. Reasons are plain text under the button, never hover-only. */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium" style={{ color: C.textMuted }}>
          {selectedStep === 1 ? 'Review' : selectedStep === 2 ? 'Annotate' : 'Apply filters'}
        </p>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
          {selectedStep === 1 && (
            <>
              {showVcfTabHighlight && (
                <>
                  <div className="max-w-xs space-y-1">
                    <Button
                      type="button"
                      variant={recommendedButton === 'vcf' || recommendedButton === 'fastq' ? 'default' : 'outline'}
                      onClick={() => {
                        if (recommendedButton === 'vcf' && onTryVcfUpload) {
                          onTryVcfUpload();
                        } else if (recommendedButton === 'fastq' && onUploadRawSequencing) {
                          onUploadRawSequencing();
                        }
                      }}
                      className="max-md:h-11"
                    >
                      {isVcfFile ? 'Upload raw sequencing data' : 'Try VCF upload for better results'}
                    </Button>
                    {primaryRecommendation && (recommendedButton === 'vcf' || recommendedButton === 'fastq') && (
                      <p className="text-xs" style={{ color: C.textMuted }}>
                        {primaryRecommendation}
                      </p>
                    )}
                  </div>
                  {!isVcfFile && onConvertToVcf && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onConvertToVcf()}
                      disabled={isConvertingToVcf || backgroundJobActive}
                      className="max-md:h-11"
                    >
                      {isConvertingToVcf ? 'Converting…' : 'Convert file to VCF'}
                    </Button>
                  )}
                </>
              )}

              {!showVcfTabHighlight && step1?.passed && (
                <p className="text-xs" style={{ color: C.textMuted }}>
                  All required columns are present. Continue to the next step.
                </p>
              )}
            </>
          )}

          {selectedStep === 2 && (
            <>
              {hasAnnotatedFile && (
                <p className="w-full text-xs" style={{ color: C.success }}>
                  Columns added. Continue to apply filters.
                </p>
              )}

              {/* Run Annotation stays on screen once the file is annotated, disabled, so the
                * step keeps the same shape before and after the run. */}
              {(() => {
                const annovarAlreadyRun = hasAnnotatedFile || step2?.passed;
                const annovarActionable = annovarEnabled && !annovarAlreadyRun;
                const reason = genomeMismatch
                  ? 'Annotation and phenotype prioritization need a matching genome build. Fix the mismatch first.'
                  : !step1?.passed
                    ? isVcfFile
                      ? 'Essential VCF columns are missing. Upload raw data when available.'
                      : 'Upload a VCF to enable annotation.'
                    : annovarQuotaBlocked
                      ? annovarGate.reason
                      : annovarAlreadyRun
                        ? 'Already run on this file.'
                        : recommendedButton === 'annovar'
                          ? primaryRecommendation
                          : null;
                return (
                  <div className="max-w-xs space-y-1">
                    <Button
                      type="button"
                      variant={annovarActionable && !nextIsPrimary ? 'default' : 'outline'}
                      onClick={
                        annovarActionable
                          ? () => {
                              const allComplete = step1?.passed && step2?.passed && step3?.passed;
                              if (allComplete) setShowAnnovarConfirm(true);
                              else onAnnovarClick?.();
                            }
                          : undefined
                      }
                      disabled={!annovarActionable}
                      className="max-md:h-11"
                    >
                      <Tags aria-hidden />
                      {annovarAlreadyRun ? 'Annotation done' : 'Run annotation'}
                    </Button>
                    {reason && (
                      <p className="text-xs" style={{ color: genomeMismatch || annovarQuotaBlocked ? C.error : C.textMuted }}>
                        {reason}
                      </p>
                    )}
                    {annovarMeterLabel && !annovarQuotaBlocked && (
                      <p className="text-[12px] tabular-nums" style={{ color: C.textMuted }}>
                        {annovarMeterLabel}
                        {annovarMeterDetail && <span> · {annovarMeterDetail}</span>}
                      </p>
                    )}
                  </div>
                );
              })()}

              {!hasAnnotatedFile && step2?.passed && (
                <p className="w-full text-xs" style={{ color: C.textMuted }}>
                  All annotation columns are present. Continue to the next step.
                </p>
              )}
            </>
          )}

          {selectedStep === 3 && (
            <>
              <div className="max-w-xs space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onProprietaryFilterClick?.('filter_1')}
                  disabled={!acmgFilterCanApply || isApplyingProprietaryFilter || acmgFilterActive}
                  className="max-md:h-11"
                  style={acmgFilterActive ? { borderColor: 'hsl(var(--primary))', background: C.tealSoft } : undefined}
                >
                  {isApplyingProprietaryFilter ? 'Applying…' : acmgFilterActive ? 'ACMG applied' : 'ACMG'}
                </Button>
                {/* Quota and readiness are different problems, so they get different copy. */}
                {!acmgFilterCanApply && !acmgFilterActive && step1?.passed && !acmgQuotaBlocked && (
                  <p className="text-xs" style={{ color: C.textMuted }}>
                    Run annotation first. The ACMG filter needs ClinVar or InterVar annotations and gnomAD frequency.
                  </p>
                )}
                {(acmgMeterLabel || acmgQuotaBlocked) && !acmgFilterActive && (
                  <p className="text-[12px] tabular-nums" style={{ color: acmgQuotaBlocked ? C.error : C.textMuted }}>
                    {acmgQuotaBlocked ? acmgExomiserGate.reason : acmgMeterLabel}
                    {!acmgQuotaBlocked && acmgMeterDetail && <span> · {acmgMeterDetail}</span>}
                  </p>
                )}
              </div>

              {/* Exomiser needs an annotated file; remaining eligibility (phenotype, germline) is checked in the sidebar tab */}
              {onOpenExomiser && (() => {
                // Exomiser applies draw on the same metered budget as ACMG.
                const exomiserEnabled =
                  exomiserCanApply && !genomeMismatch && !acmgQuotaBlocked && !phenotypeMissing;
                const reason = genomeMismatch
                  ? 'Annotation and phenotype prioritization need a matching genome build. Fix the mismatch first.'
                  : phenotypeMissing
                    ? 'Add a phenotype description in sample info to enable phenotype-driven prioritization. Everything else runs without one.'
                    : 'Run annotation first. Phenotype prioritization needs an annotated file.';
                return (
                  <div className="max-w-xs space-y-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenExomiser()}
                      disabled={!exomiserEnabled}
                      className="max-md:h-11"
                    >
                      <PhenotypeAiLabel variant="inline" />
                    </Button>
                    {!exomiserEnabled && step1?.passed && (
                      <p className="text-xs" style={{ color: genomeMismatch ? C.error : C.textMuted }}>
                        {reason}
                      </p>
                    )}
                  </div>
                );
              })()}

              <p className="w-full text-xs" style={{ color: C.textMuted }}>
                You can also skip filters and chat directly.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 sm:px-6">
      <Button
        type="button"
        variant="outline"
        onClick={() => goToStep(selectedStep - 1)}
        disabled={!canGoBack}
        className="max-md:h-11"
      >
        Previous
      </Button>
      {canGoForward ? (
        <Button
          type="button"
          variant={nextIsPrimary ? 'default' : 'outline'}
          onClick={() => goToStep(selectedStep + 1)}
          className="max-md:h-11"
        >
          Next
        </Button>
      ) : (
        <Button type="button" onClick={handleDismiss} className="max-md:h-11">
          {backgroundJobActive ? 'Continue in background' : chatAllowed ? 'Continue' : 'Continue to chat'}
        </Button>
      )}
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
            <Button type="button" variant="destructive" onClick={handleConfirmDelete}>
              <Trash2 aria-hidden /> Remove file
            </Button>
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
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          {header}
          {content}
          {footer}
        </div>
      ) : (
        // Modal mode (current ChatPage mount). The backdrop does not close, which avoids
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
