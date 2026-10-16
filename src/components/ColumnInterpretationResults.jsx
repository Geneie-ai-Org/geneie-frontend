import React, { useState, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, AlertCircle, ArrowRight, ChevronRight, ClipboardCheck, FileText, Info, Trash2, Filter, Stethoscope, Tags, X } from 'lucide-react';
import { usePopOnChange } from '@/components/PipelineJobCard';
import { Collapse, CountUp, HoldButton, StateButton, Turn } from '@/components/workspace/motion';
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

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

const LINE = 'hsl(var(--wb-line))';

const CHIP_TONES = {
  success: [C.successSoft, C.success],
  info: [C.infoSoft, C.info],
  warning: [C.warningSoft, C.warning],
  error: [C.errorSoft, C.error],
  neutral: [C.track, C.textMuted],
};

// Tone -> the shared status-pill state (done = brand teal, failed = red, pending = neutral).
const TONE_STATE = { success: 'done', error: 'failed', info: 'pending', neutral: 'pending' };

/** Status as a word plus a small dot, in the shared pill shape. */
function Chip({ tone = 'neutral', children }) {
  const state = TONE_STATE[tone];
  const sig = `${tone}|${typeof children === 'string' ? children : ''}`;
  const pop = usePopOnChange(sig);
  return (
    <span
      key={sig}
      className={`wb-status max-w-full shrink-0 ${pop}`}
      data-state={state}
      style={tone === 'warning' ? { background: C.warningSoft, color: C.warning, borderColor: 'transparent' } : undefined}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Inline notice: a soft status card with a hairline in the status colour and readable text. */
function Notice({ tone = 'info', icon: Icon = Info, children }) {
  const [bg, fg] = CHIP_TONES[tone] || CHIP_TONES.info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-5"
      style={{ background: bg, color: C.text, borderColor: tint(fg, 22) }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" style={{ color: fg }} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** False on the first paint, true a frame later: lets bars and counters play from empty on open. */
function useSettled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

/** Counter that rolls up from zero the first time it shows, then follows its value. */
function RollUp({ value }) {
  const settled = useSettled();
  return <CountUp value={settled ? value : 0} />;
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

/** One column per row: the role we need, the column it was matched to in the file (a mono pill), and a status pill. */
function ColumnRow({ role, matched, tone = 'success', word, note }) {
  const reduce = useReducedMotion();
  return (
    <li className="flex min-h-10 items-center gap-2 border-t px-3 py-1.5 text-[13px] first:border-t-0 max-md:min-h-11" style={{ borderColor: LINE }}>
      <span className="min-w-0 flex-1 truncate" style={{ color: C.text }} title={note || role}>
        {role}
      </span>
      {matched ? (
        <>
          {/* The mapping slides in from the left when a column gets matched. */}
          <motion.span
            className="flex min-w-0 max-w-[48%] shrink items-center gap-2"
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {matched !== role ? <ArrowRight className="size-3 shrink-0" style={{ color: C.textDim }} aria-hidden /> : null}
            <span className="wb-chip min-w-0 shrink font-mono text-[12px]" title={`Column in your file: ${matched}`}>
              <span className="truncate">{matched}</span>
            </span>
          </motion.span>
        </>
      ) : null}
      <span className="wb-status shrink-0" data-state={TONE_STATE[tone] || 'pending'}>
        {word}
      </span>
    </li>
  );
}

/** Disclosure group: a pill-cornered block whose header carries the found / missing counts. */
function ColumnGroup({ label, found, missing, open, onToggle, children }) {
  const panelId = useId();
  return (
    <section className="overflow-hidden rounded-2xl border" style={{ borderColor: LINE }}>
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex min-h-10 w-full items-center gap-2 bg-[hsl(var(--wb-pill))] px-3 py-1.5 text-left text-[13px] font-medium transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] motion-reduce:transition-none max-md:min-h-11 ${FOCUS} focus-visible:-outline-offset-2`}
        >
          <Turn open={open} className="shrink-0">
            <ChevronRight className="size-3.5" style={{ color: C.textDim }} aria-hidden />
          </Turn>
          <span className="min-w-0 flex-1 truncate" style={{ color: C.text }}>{label}</span>
          <span className="wb-status shrink-0 tabular-nums" data-state="done">{found} found</span>
          {missing > 0 ? <span className="wb-status shrink-0 tabular-nums" data-state="failed">{missing} missing</span> : null}
        </button>
      </h4>
      <Collapse open={open} id={panelId}>
        <ul className="m-0 list-none border-t p-0" style={{ borderColor: LINE }}>
          {children}
        </ul>
      </Collapse>
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
  const settled = useSettled(); // bars start empty on open and glide to their value
  const reduceMotion = useReducedMotion();
  // Direction of travel between steps (1 = forward). Only recomputed when the step actually changes.
  const stepNav = useRef({ step: initialStep ?? (hasAnnotatedFile ? 2 : 1), dir: 1 });

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

  if (!interpretationResult) {
    // Modal mode renders nothing without a result; the workspace tab explains itself instead.
    return embedded ? (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 px-8 text-center text-foreground">
        <span className="mb-1 flex size-10 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
          <ClipboardCheck className="size-5" />
        </span>
        <p className="text-[15px] font-medium">No file check yet</p>
        <p className="max-w-xs text-[13px] leading-5" style={{ color: C.textMuted }}>
          Geneie checks the columns of a variants file as soon as you add one. The result appears here.
        </p>
      </div>
    ) : null;
  }

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
    if (status === 'pending') return 'Not started';
    if (status === 'partial') return 'Partly met';
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
        <div className="space-y-2">
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
          <div className="space-y-2">
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
          <div className="space-y-2">
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
  if (stepNav.current.step !== selectedStep) {
    stepNav.current = { step: selectedStep, dir: selectedStep > stepNav.current.step ? 1 : -1 };
  }
  const stepDir = stepNav.current.dir;
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

  const totalColumns = columnTotals.found + columnTotals.missing;
  const foundPct = totalColumns > 0 ? Math.round((columnTotals.found / totalColumns) * 100) : 0;
  const summaryCard = (
    <section className="wb-card p-4" aria-labelledby="file-analysis-title">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]"
          aria-hidden="true"
        >
          <ClipboardCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="file-analysis-title" className="m-0 text-[15px] font-medium leading-6" style={{ color: C.text }}>
            File check
          </h2>
          <p className="m-0 mt-0.5 text-[13px] leading-5" style={{ color: C.textMuted }}>
            {overall_status === 'passed' ? 'Your file is ready for analysis.' : 'Some features may be limited.'}
          </p>
        </div>
        <Chip tone={overall_status === 'passed' ? 'success' : 'warning'}>
          {overall_status === 'passed' ? 'Ready' : 'Limited'}
        </Chip>
      </div>
      <div className="mt-4 rounded-xl bg-[hsl(var(--brand-50))] px-3.5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-[28px] font-medium leading-none tabular-nums tracking-tight text-[hsl(var(--brand-700))]">
            <RollUp value={columnTotals.found} />
          </span>
          <span className="text-[13px]" style={{ color: C.textMuted }}>
            {columnTotals.found === 1 ? 'column' : 'columns'} recognised
            {columnTotals.missing > 0 ? (
              <>
                , <span className="font-medium tabular-nums" style={{ color: C.error }}><RollUp value={columnTotals.missing} /></span> need a look
              </>
            ) : null}
          </span>
        </div>
        {totalColumns > 0 ? (
          <div
            className="wb-track mt-3"
            role="progressbar"
            aria-label="Columns recognised"
            aria-valuemin={0}
            aria-valuemax={totalColumns}
            aria-valuenow={columnTotals.found}
          >
            <div className="wb-fill" style={{ width: `${settled ? Math.max(foundPct, 2) : 0}%` }} />
          </div>
        ) : null}
        <p className="m-0 mt-2 text-xs tabular-nums" style={{ color: C.textMuted }}>
          Across {stepperSteps.length} steps
        </p>
      </div>
    </section>
  );

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
    <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${embedded ? 'px-4 pb-4 pt-1' : 'px-4 py-4 sm:px-6'}`}>
      {embedded && summaryCard}

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
        <p className="m-0 flex items-center gap-1.5 px-1 text-xs" style={{ color: C.textMuted }}>
          <CheckCircle2 className="size-3.5" style={{ color: C.success }} aria-hidden />
          Genome build verified: {(gbc.declared || '').toUpperCase()}
        </p>
      )}
      {gbc?.status === 'inconclusive' && (
        <Notice tone="warning" icon={AlertCircle}>
          {gbc.message || 'Could not verify the genome build. Double-check it before running annotation.'}
        </Notice>
      )}

      {/* Steps: three pill cards, one per stage. */}
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
              className={`flex min-w-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-colors duration-150 motion-reduce:transition-none max-md:min-h-11 ${FOCUS} ${
                isSel
                  ? 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]'
                  : 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] hover:border-[hsl(var(--brand-300))] hover:bg-[hsl(var(--brand-50))]'
              }`}
            >
              <span className="text-xs tabular-nums" style={{ color: isSel ? 'hsl(var(--brand-700))' : C.textMuted }}>
                Step {s.n}
              </span>
              <span className="text-[13px] font-medium leading-snug" style={{ color: C.text }}>
                {s.name}
              </span>
              <Chip tone={tone}>{getStepSubtitle(s.status)}</Chip>
              <span aria-hidden className="wb-track w-full" style={isSel ? { background: 'hsl(var(--wb-card))' } : undefined}>
                <span
                  className="wb-fill block"
                  style={{
                    width: `${settled ? s.progress : 0}%`,
                    background: s.status === 'failed' ? C.error : undefined,
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* Step detail and its actions travel together: they slide 8px in the direction of travel. */}
      <AnimatePresence mode="wait" initial={false} custom={stepDir}>
        <motion.div
          key={selectedStep}
          custom={stepDir}
          className="space-y-3"
          variants={{
            enter: (d) => ({ opacity: 0, x: reduceMotion ? 0 : d * 8 }),
            center: { opacity: 1, x: 0, transition: { duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] } },
            exit: (d) => ({ opacity: 0, x: reduceMotion ? 0 : d * -8, transition: { duration: reduceMotion ? 0 : 0.12, ease: [0.4, 0, 1, 1] } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
        >
      {/* Selected step detail */}
      {selectedStepData && (
        <div
          role="tabpanel"
          id="file-step-panel"
          aria-labelledby={`file-step-tab-${selectedStepData.n}`}
          tabIndex={0}
          className={`wb-card space-y-3 p-4 ${FOCUS}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-[13px] font-medium" style={{ color: C.text }}>
              {selectedStepData.name}
            </h3>
            {(() => {
              const t = summarizeStep(selectedStepData.data);
              return t.found + t.missing > 0 ? (
                <span className="shrink-0 text-xs tabular-nums" style={{ color: C.textMuted }}>
                  {t.found} found{t.missing > 0 ? `, ${t.missing} missing` : ''}
                </span>
              ) : null;
            })()}
          </div>
          {renderStepDetails(selectedStepData.n, selectedStepData.data) || (
            <p className="m-0 text-xs" style={{ color: C.textMuted }}>
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
      <div className="wb-card space-y-3 p-4">
        <p className="wb-card-title m-0">
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
                    <StateButton
                      state={isConvertingToVcf ? 'running' : 'idle'}
                      labels={{ idle: 'Convert file to VCF', running: 'Converting' }}
                      icon={FileText}
                      variant="outline"
                      onClick={() => onConvertToVcf()}
                      disabled={isConvertingToVcf || backgroundJobActive}
                      className="max-md:h-11"
                    />
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
                    <StateButton
                      state={isRunningAnnovar ? 'running' : annovarAlreadyRun ? 'done' : 'idle'}
                      labels={{ idle: 'Run annotation', running: 'Running annotation', done: 'Annotation done' }}
                      icon={Tags}
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
                      disabled={!annovarActionable && !isRunningAnnovar}
                      className="max-md:h-11"
                    />
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
                <StateButton
                  state={isApplyingProprietaryFilter ? 'running' : acmgFilterActive ? 'done' : 'idle'}
                  labels={{ idle: 'ACMG', running: 'Applying', done: 'ACMG applied' }}
                  icon={Filter}
                  variant="outline"
                  onClick={() => onProprietaryFilterClick?.('filter_1')}
                  disabled={!acmgFilterCanApply || isApplyingProprietaryFilter || acmgFilterActive}
                  className="max-md:h-11"
                  style={acmgFilterActive ? { borderColor: 'hsl(var(--brand-300))', background: 'hsl(var(--brand-100))', color: 'hsl(var(--brand-700))' } : undefined}
                />
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
        </motion.div>
      </AnimatePresence>
    </div>
  );

  const footer = (
    <div
      className={`flex flex-shrink-0 items-center justify-between gap-3 border-t px-4 py-3 ${embedded ? '' : 'bg-background sm:px-6'}`}
      style={{ borderColor: LINE }}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => goToStep(selectedStep - 1)}
        disabled={!canGoBack}
        className="max-md:h-11"
      >
        Previous
      </Button>
      <span className="text-xs tabular-nums" style={{ color: C.textMuted }} aria-live="polite">
        Step {selectedStep} of {stepperSteps.length}
      </span>
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
            <HoldButton tone="danger" icon={Trash2} doneLabel="Removing" onConfirm={handleConfirmDelete}>
              Hold to delete file
            </HoldButton>
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
        <div className="flex h-full min-h-0 flex-col text-foreground">
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
