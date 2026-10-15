import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, FileText, Info, Trash2, Filter, Stethoscope, Tags, X } from 'lucide-react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

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
      className="inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-2xs font-medium"
      style={{ background: bg, color: fg }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: fg }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Inline notice: hairline border, soft status fill, readable foreground text. */
function Notice({ tone = 'info', icon: Icon = Info, children }) {
  const [bg, fg] = CHIP_TONES[tone] || CHIP_TONES.info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed"
      style={{ background: bg, borderColor: tint(fg, 30), color: C.text }}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: fg }} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
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
    ? `${annovarMeter.remaining} of ${annovarMeter.limit} Annotation runs left`
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
          .replace(/\bRun ANNOVAR\b/g, 'Run Annotation')
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

  /** Render a column group with exception-only display:
   *  - All found → single summary line + expandable detail
   *  - Has issues → show only the problematic columns directly */
  const renderColumnGroup = (sectionKey, label, columns, columnsNoValidValues = [], opts = {}) => {
    const entries = Object.entries(columns);
    if (!entries.length) return null;

    const found = entries.filter(([, c]) => c.found);

    // Missing columns that block the step read as errors. For "any N of these" groups
    // (`minFound`), they only do until enough are found; past that, the rest are extras.
    const groupSatisfied = opts.minFound != null && found.length >= opts.minFound;
    const missingColor = opts.missingColor || (groupSatisfied ? C.textDim : C.error);
    const issues = entries.filter(([colName, c]) => !c.found);
    const allFound = issues.length === 0;

    if (allFound) {
      /* Happy path: summary + expandable detail */
      return (
        <Accordion>
          <AccordionItem value={sectionKey} className="border-0">
            <AccordionTrigger className="py-0 text-xs font-normal hover:no-underline items-center">
              <span className="text-xs" style={{ color: C.textMuted }}>
                {label}: {found.length}/{entries.length} columns found
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entries.map(([colName, colInfo]) => {
                  const label = colInfo.matched_column || colName;
                  const roleDiffers = colInfo.matched_column && colInfo.matched_column !== colName;
                  return (
                    <span
                      key={colName}
                      title={roleDiffers ? `Role: ${colName}` : label}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border"
                      style={{
                        backgroundColor: C.successSoft,
                        borderColor: tint(C.success, 40),
                        color: C.success,
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      {label}
                    </span>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      );
    }

    /* Issues present: compact inline pills for missing, found behind expand */
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: missingColor }} />
          <span className="text-xs font-medium" style={{ color: C.text }}>
            {label}: {found.length}/{entries.length} found
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {issues.map(([colName]) => (
            <span
              key={colName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border"
              style={{
                backgroundColor: tint(missingColor, 8),
                borderColor: tint(missingColor, 40),
                color: missingColor,
              }}
            >
              {columnsNoValidValues.includes(colName) ? 'No values' : (opts.missingLabel || 'Missing')} · {colName}
            </span>
          ))}
          {found.map(([colName, colInfo]) => {
            const pillLabel = colInfo.matched_column || colName;
            return (
              <span
                key={colName}
                title={colInfo.matched_column && colInfo.matched_column !== colName ? `Role: ${colName}` : pillLabel}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border"
                style={{
                  backgroundColor: C.successSoft,
                  borderColor: tint(C.success, 40),
                  color: C.success,
                }}
              >
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                {pillLabel}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  /** Render conditional columns — found/missing with required/optional labels */
  const renderConditionalGroup = (sectionKey, label, columns) => {
    const entries = Object.entries(columns);
    if (!entries.length) return null;

    const found = entries.filter(([, c]) => c.found);
    const issues = entries.filter(([, c]) => !c.found);
    const allFound = issues.length === 0;

    if (allFound) {
      return (
        <Accordion>
          <AccordionItem value={sectionKey} className="border-0">
            <AccordionTrigger className="py-0 text-xs font-normal hover:no-underline items-center">
              <span className="text-xs" style={{ color: C.textMuted }}>
                {label}: {found.length}/{entries.length} columns found
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entries.map(([colName, colInfo]) => {
                  const pillLabel = colInfo.matched_column || colName;
                  const roleDiffers = colInfo.matched_column && colInfo.matched_column !== colName;
                  const tip = roleDiffers
                    ? `Role: ${colName}${colInfo.required ? ' (Required)' : ''}`
                    : colInfo.required
                      ? `${pillLabel} (Required)`
                      : pillLabel;
                  return (
                    <span
                      key={colName}
                      title={tip}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border"
                      style={{
                        backgroundColor: C.successSoft,
                        borderColor: tint(C.success, 40),
                        color: C.success,
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      {pillLabel}
                      {colInfo.required && <span className="opacity-70">•</span>}
                    </span>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      );
    }

    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: issues.some(([, c]) => c.required) ? C.error : C.textDim }} />
          <span className="text-xs font-medium" style={{ color: C.text }}>
            {label}: {found.length}/{entries.length} found
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-5">
          {issues.map(([colName, colInfo]) => (
            <span
              key={colName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border"
              style={{
                backgroundColor: colInfo.required ? tint(C.error, 8) : 'transparent',
                borderColor: colInfo.required ? tint(C.error, 40) : C.border,
                color: colInfo.required ? C.error : C.textDim,
              }}
            >
              {colInfo.required ? 'Missing' : 'Optional'} · {colName}
            </span>
          ))}
          {found.map(([colName, colInfo]) => {
            const pillLabel = colInfo.matched_column || colName;
            return (
              <span
                key={colName}
                title={colInfo.required ? `${pillLabel} (Required)` : pillLabel}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium border"
                style={{
                  backgroundColor: C.successSoft,
                  borderColor: tint(C.success, 40),
                  color: C.success,
                }}
              >
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                {pillLabel}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStepDetails = (stepNumber, stepData) => {
    if (stepNumber === 1) {
      const required = stepData.required_columns || {};
      const columnsNoValidValues = stepData.columns_no_valid_values || [];
      return (
        <div className="space-y-2 text-sm">
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
          {renderColumnGroup(`step2_required`, 'Required columns', required, columnsNoValidValues)}
          {renderColumnGroup(`step2_pathogenicity`, 'Pathogenicity predictors (at least 2 required)', pathogenicity_group, columnsNoValidValues, { missingLabel: 'Not found', minFound: 2 })}

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
          {renderColumnGroup(`step3_required`, 'Required columns', required, columnsNoValidValues)}
          {renderColumnGroup(`step3_genotype`, 'Sample genotype (any one required)', sample_genotype_group, columnsNoValidValues, { missingLabel: 'Not found', minFound: 1 })}
          {renderColumnGroup(`step3_pathscore`, 'Pathogenicity scores (any one required)', pathogenicity_score_group, columnsNoValidValues, { missingLabel: 'Not found', minFound: 1 })}
          {renderConditionalGroup(`step3_conditional`, 'Conditional columns', conditional)}
          {renderColumnGroup(`step3_optional`, 'Optional columns', optional, [], { missingLabel: 'Not found', missingColor: C.textDim })}

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

  const header = (
    <div className="flex-shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="file-analysis-title" className="text-sm font-semibold" style={{ color: C.text }}>
            File analysis
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: C.textMuted }}>
            {overall_status === 'passed' ? 'Your file is ready for analysis.' : 'Some features may be limited.'}
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
            ? 'Annotation is running in the background. You can leave this view and continue in chat. Progress shows in the pipeline bar.'
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
          {gbc.message || 'Could not verify the genome build. Double-check it before running Annotation.'}
        </Notice>
      )}

      {/* Steps */}
      <div role="tablist" aria-label="Analysis steps" className="grid grid-cols-3 gap-2">
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
              onClick={() => setExpandedStep(s.n)}
              className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55 max-md:min-h-11"
              style={{
                borderColor: isSel ? 'hsl(var(--primary))' : C.border,
                background: isSel ? C.tealSoft : 'transparent',
              }}
            >
              <span className="text-2xs tabular-nums" style={{ color: C.textDim }}>
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
          className="space-y-3 border-t border-border pt-4"
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
                      {annovarAlreadyRun ? 'Annotation complete' : 'Run Annotation'}
                    </Button>
                    {reason && (
                      <p className="text-xs" style={{ color: genomeMismatch || annovarQuotaBlocked ? C.error : C.textMuted }}>
                        {reason}
                      </p>
                    )}
                    {annovarMeterLabel && !annovarQuotaBlocked && (
                      <p className="text-2xs tabular-nums" style={{ color: C.textDim }}>
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
                    Run Annotation first. The ACMG filter needs ClinVar or InterVar annotations and gnomAD frequency.
                  </p>
                )}
                {(acmgMeterLabel || acmgQuotaBlocked) && !acmgFilterActive && (
                  <p className="text-2xs tabular-nums" style={{ color: acmgQuotaBlocked ? C.error : C.textDim }}>
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
                    : 'Run Annotation first. Phenotype prioritization needs an annotated file.';
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

              <p className="w-full text-xs" style={{ color: C.textDim }}>
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
            <AlertDialogCancel>Go back</AlertDialogCancel>
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
            <AlertDialogTitle>Run Annotation?</AlertDialogTitle>
            <AlertDialogDescription>
              All required columns are already in your file. Running Annotation adds more information to some
              columns and makes the analysis more streamlined.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                setShowAnnovarConfirm(false);
                onAnnovarClick?.();
              }}
            >
              Run Annotation
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
