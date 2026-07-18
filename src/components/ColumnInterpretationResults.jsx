import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, FileText, Info, ArrowRight, Trash2, Check, Filter, Stethoscope } from 'lucide-react';
import qiagenLogo from '../Qiagen.svg.png';
import { ACMG_FILTER_DISPLAY_NAME } from './VariantFilterSidebar';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/** Dark theme tokens — aligned with App.css */
const C = {
  surface: 'var(--bg-surface-raised)',
  surfaceCard: 'var(--bg-surface)',
  surfaceHover: 'var(--bg-surface-hover)',
  border: 'var(--border-default)',
  text: 'var(--text-primary)',
  textMuted: 'var(--text-secondary)',
  textDim: 'var(--text-tertiary)',
  success: 'var(--success)',
  successSoft: 'var(--success-soft)',
  warning: 'var(--accent-teal)',
  warningSoft: 'var(--accent-teal-soft)',
  warningText: 'var(--accent-teal)',
  info: 'var(--accent-blue)',
  infoSoft: 'var(--accent-blue-soft)',
  teal: 'var(--accent-teal)',
  tealSoft: 'var(--accent-teal-soft)',
  tealHover: 'var(--accent-teal-hover)',
  error: 'var(--error)',
  errorSoft: 'var(--error-soft)',
  track: 'var(--bg-surface-hover)',
  tooltip: 'var(--bg-surface-hover)',
  shadow: 'var(--shadow-xl)',
};

const ColumnInterpretationResults = ({
  interpretationResult,
  onClose,
  onAnnovarClick,
  onProprietaryFilterClick,
  isApplyingProprietaryFilter = false,
  acmgFilterActive = false,
  acmgFilterCanApply = false,
  filter2Active = false,
  filter2CanApply = false,
  showVcfTabHighlight,
  onDeleteDocument,
  onTryVcfUpload,
  onConvertToVcf,
  isConvertingToVcf = false,
  isVcfFile = false,
  chatAllowed = true,
  chatBlockedMessage,
  onChatBlocked,
  isRunningAnnovar = false,
  hasAnnotatedFile = false,
  initialStep = null,
}) => {
  const [expandedStep, setExpandedStep] = useState(initialStep ?? (hasAnnotatedFile ? 2 : null)); // Track which step is expanded
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Explicit remove-file confirmation only
  const [showAnnovarConfirm, setShowAnnovarConfirm] = useState(false); // Confirm ANNOVAR when all columns present

  const backgroundJobActive = isRunningAnnovar || isApplyingProprietaryFilter;
  const genomeMismatch = interpretationResult?.genome_build_check?.status === 'mismatch';

  if (!interpretationResult) return null;

  const { step1, step2, step3, overall_status, recommendations } = interpretationResult;

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
  const allRecommendations = recommendations || [];
  
  // Get primary recommendation (first one, usually most important)
  const primaryRecommendation = allRecommendations.length > 0 ? allRecommendations[0] : null;
  
  // Determine which button is recommended based on step status
  const getRecommendedButton = () => {
    if (!step1?.passed) {
      // For TSV/CSV, recommend VCF upload. For VCF uploads, Step 1 failure
      // means essential VCF columns are missing; we don't have a raw-data
      // upload button yet, so we don't highlight any primary action here.
      return isVcfFile ? null : 'vcf';
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

  const getStepColor = (status) => {
    if (status === 'passed') return C.success;
    if (status === 'pending') return C.info;
    return C.warning;
  };

  const getStepBadgeStyle = (status) => {
    if (status === 'passed') return { backgroundColor: C.successSoft, color: C.success };
    if (status === 'pending') return { backgroundColor: C.infoSoft, color: C.info };
    return { backgroundColor: C.warningSoft, color: C.warning };
  };

  const tooltipStyle = {
    backgroundColor: C.tooltip,
    color: C.text,
    fontSize: '12px',
    fontWeight: '500',
    border: `1px solid ${C.border}`,
    boxShadow: C.shadow,
  };

  const tooltipArrowStyle = {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: C.tooltip,
  };

  /** Render a column group with exception-only display:
   *  - All found → single summary line + expandable detail
   *  - Has issues → show only the problematic columns directly */
  const renderColumnGroup = (sectionKey, label, columns, columnsNoValidValues = [], opts = {}) => {
    const entries = Object.entries(columns);
    if (!entries.length) return null;

    const found = entries.filter(([, c]) => c.found);
    const issues = entries.filter(([colName, c]) => !c.found);
    const allFound = issues.length === 0;

    if (allFound) {
      /* Happy path: summary + expandable detail */
      return (
        <Accordion>
          <AccordionItem value={sectionKey} className="border-0">
            <AccordionTrigger className="py-0 text-xs font-normal hover:no-underline items-center">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.success }} />
                <span className="text-xs" style={{ color: C.textMuted }}>
                  {label}: {found.length}/{entries.length} columns found
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="mt-2 ml-5 flex flex-wrap gap-1.5">
                {entries.map(([colName, colInfo]) => {
                  const label = colInfo.matched_column || colName;
                  const roleDiffers = colInfo.matched_column && colInfo.matched_column !== colName;
                  return (
                    <span
                      key={colName}
                      title={roleDiffers ? `Role: ${colName}` : label}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                      style={{
                        backgroundColor: C.successSoft || `${C.success}18`,
                        borderColor: `${C.success}40`,
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
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: opts.missingColor || C.warning }} />
          <span className="text-xs font-medium" style={{ color: C.text }}>
            {label}: {found.length}/{entries.length} found
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-5">
          {issues.map(([colName]) => (
            <span
              key={colName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
              style={{
                backgroundColor: C.warningSoft || `${C.warning}18`,
                borderColor: `${(opts.missingColor || C.warning)}40`,
                color: opts.missingColor || C.warning,
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                style={{
                  backgroundColor: C.successSoft || `${C.success}18`,
                  borderColor: `${C.success}40`,
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
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.success }} />
                <span className="text-xs" style={{ color: C.textMuted }}>
                  {label}: {found.length}/{entries.length} columns found
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0">
              <div className="mt-2 ml-5 flex flex-wrap gap-1.5">
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
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                      style={{
                        backgroundColor: C.successSoft || `${C.success}18`,
                        borderColor: `${C.success}40`,
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
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: C.warning }} />
          <span className="text-xs font-medium" style={{ color: C.text }}>
            {label}: {found.length}/{entries.length} found
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-5">
          {issues.map(([colName, colInfo]) => (
            <span
              key={colName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
              style={{
                backgroundColor: colInfo.required ? (C.warningSoft || `${C.warning}18`) : 'transparent',
                borderColor: colInfo.required ? `${C.warning}40` : C.border,
                color: colInfo.required ? C.warning : C.textDim,
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                style={{
                  backgroundColor: C.successSoft || `${C.success}18`,
                  borderColor: `${C.success}40`,
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
          {renderColumnGroup(`step1_required`, 'Required Columns', required, columnsNoValidValues)}
        </div>
      );
    } else if (stepNumber === 2) {
      if (stepData.not_implemented) {
        return (
          <div className="mt-3 p-2 rounded text-sm" style={{ backgroundColor: C.infoSoft, color: C.info, border: `1px solid ${C.info}` }}>
            Column definitions pending. Proprietary filters will be unavailable until column list is provided.
          </div>
        );
      }

      const required = stepData.required_columns || {};
      const pathogenicity_group = stepData.pathogenicity_predictor_group || {};
      const missing_groups = stepData.missing_groups || [];
      const columnsNoValidValues = stepData.columns_no_valid_values || [];

      return (
        <div className="space-y-3 text-sm">
          {renderColumnGroup(`step2_required`, 'Required Columns', required, columnsNoValidValues)}
          {renderColumnGroup(`step2_pathogenicity`, 'Pathogenicity Predictors (At Least 2 Required)', pathogenicity_group, columnsNoValidValues, { missingLabel: 'Not found', missingColor: C.textDim })}

          {missing_groups.length > 0 && (
            <div className="p-2 rounded" style={{ backgroundColor: C.warningSoft, border: `1px solid ${C.warning}` }}>
              <p className="font-semibold mb-1" style={{ color: C.warning }}>Missing Groups:</p>
              <ul className="list-disc list-inside" style={{ color: C.warningText }}>
                {missing_groups.map((group, idx) => (
                  <li key={idx}>{group}</li>
                ))}
              </ul>
            </div>
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
          {renderColumnGroup(`step3_required`, 'Required Columns', required, columnsNoValidValues)}
          {renderColumnGroup(`step3_genotype`, 'Sample Genotype (Any One Required)', sample_genotype_group, columnsNoValidValues, { missingLabel: 'Not found', missingColor: C.textDim })}
          {renderColumnGroup(`step3_pathscore`, 'Pathogenicity Scores (Any One Required)', pathogenicity_score_group, columnsNoValidValues, { missingLabel: 'Not found', missingColor: C.textDim })}
          {renderConditionalGroup(`step3_conditional`, 'Conditional Columns', conditional)}
          {renderColumnGroup(`step3_optional`, 'Optional Columns', optional, [], { missingLabel: 'Not found', missingColor: C.textDim })}

          {missing_groups.length > 0 && (
            <div className="p-2 rounded" style={{ backgroundColor: C.warningSoft, border: `1px solid ${C.warning}` }}>
              <p className="font-semibold mb-1" style={{ color: C.warning }}>Missing Column Groups:</p>
              <ul className="list-disc list-inside" style={{ color: C.warningText }}>
                {missing_groups.map((group, idx) => (
                  <li key={idx}>{group}</li>
                ))}
              </ul>
            </div>
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
    onClose();
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  // --- Stepper model (horizontal stepper + detail layout) ---
  const stepperSteps = [
    {
      n: 1,
      name: isVcfFile ? 'ANNOVAR ready' : 'VCF Reconstruction',
      icon: FileText,
      status: step1Status,
      progress: step1Progress,
      data: step1,
    },
    {
      n: 2,
      name: step2?.step_name || 'Annotation Stage',
      icon: Filter,
      status: step2Status,
      progress: step2Progress,
      data: step2,
    },
    {
      n: 3,
      name: 'Clinical Decision',
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
  const goToStep = (n) => setExpandedStep(Math.max(1, Math.min(stepperSteps.length, n)));

  return (
    <>
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <div 
            className="rounded-2xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface, boxShadow: C.shadow }}
          >
            <div className="px-6 py-4 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
              <Trash2 className="w-4 h-4" />
              <h2 className="text-base font-semibold" style={{ color: C.text }}>Remove file?</h2>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: C.textMuted }}>
                This removes the uploaded file from this conversation. Annotation and filters in progress will stop. This cannot be undone.
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl" style={{ borderColor: C.border }}>
              <button
                onClick={handleCancelDelete}
                className="px-6 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                style={{ 
                  backgroundColor: C.surfaceCard, 
                  border: `1px solid ${C.border}`, 
                  color: C.textMuted,
                }}
                onMouseEnter={(e) => { 
                  e.target.style.backgroundColor = C.surfaceHover; 
                  e.target.style.color = C.text; 
                }}
                onMouseLeave={(e) => { 
                  e.target.style.backgroundColor = C.surfaceCard; 
                  e.target.style.color = C.textMuted; 
                }}
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-6 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center gap-2"
                style={{ 
                  backgroundColor: C.errorSoft, 
                  color: C.error,
                  border: `1px solid ${C.error}`,
                }}
                onMouseEnter={(e) => { 
                  e.target.style.backgroundColor = C.error; 
                  e.target.style.color = C.text; 
                }}
                onMouseLeave={(e) => { 
                  e.target.style.backgroundColor = C.errorSoft; 
                  e.target.style.color = C.error; 
                }}
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANNOVAR Confirmation - When all required columns already present */}
      {showAnnovarConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <div 
            className="rounded-2xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface, boxShadow: C.shadow }}
          >
            <div className="px-6 py-4 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
              <Info className="w-5 h-5" style={{ color: C.teal }} />
              <h2 className="text-base font-semibold" style={{ color: C.text }}>Run ANNOVAR?</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: C.textMuted }}>
                All required columns are already present in your file. Do you really want to proceed?
              </p>
              <p className="text-sm" style={{ color: C.textMuted }}>
                Running ANNOVAR will add more information to some columns and make the analysis more streamlined.
              </p>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3 rounded-b-2xl" style={{ borderColor: C.border }}>
              <button
                onClick={() => setShowAnnovarConfirm(false)}
                className="px-6 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowAnnovarConfirm(false);
                  onAnnovarClick?.();
                }}
                className="px-6 py-2 text-sm font-semibold rounded-xl transition-colors"
                style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
              >
                Run ANNOVAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Modal — backdrop does not close (avoids stacked-modal mis-clicks); use X or Continue */}
      <div className="fixed inset-0 flex items-center justify-center z-50" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", backgroundColor: 'rgba(0,0,0,0.72)' }}>
        <div 
          className="rounded-2xl max-w-2xl w-full mx-4 max-h-[min(90vh,900px)] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface, boxShadow: C.shadow }}
        >
        {/* Header — matches Sample Metadata style: plain title + subtitle, no divider */}
        <div className="flex-shrink-0 px-6 pt-5 pb-3 relative">
          {onDeleteDocument && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="absolute top-4 right-4 transition-colors p-1.5 rounded-lg"
              style={{ color: C.textMuted }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.error; e.currentTarget.style.backgroundColor = C.errorSoft; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.backgroundColor = 'transparent'; }}
              aria-label="Remove file"
              title="Remove file"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <h2 className="text-sm font-semibold pr-8" style={{ color: C.text }}>File Analysis</h2>
          <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>
            {overall_status === 'passed' ? 'Your file is ready for analysis.' : 'Some features may be limited.'}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-3 space-y-4">
          {backgroundJobActive && (
            <div
              className="p-3 rounded-lg text-xs"
              style={{ backgroundColor: C.successSoft, border: `1px solid ${C.success}`, color: C.text }}
            >
              {isRunningAnnovar
                ? 'ANNOVAR is running in the background. You can close this window and continue in chat, progress appears in the pipeline bar at the top.'
                : 'The ACMG filter is running in the background. You can close this window and continue in chat.'}
            </div>
          )}

          {/* Single-line warning: total rows that may have data quality issues */}
          {(() => {
            const r = interpretationResult || {};
            const total = (r.variants_skipped_invalid_alleles || 0) + (r.variants_skipped_invalid_predictors || 0) + (r.variants_skipped_invalid_genotype || 0) + (r.variants_skipped_invalid_mandatory_annotation || 0);
            return total > 0 ? (
              <p className="text-xs" style={{ color: C.textMuted }}>
                <span className="font-medium" style={{ color: C.warning }}>{total.toLocaleString()}</span> rows flagged for quality review. All stored.
              </p>
            ) : null;
          })()}

          {/* Genome build mismatch warning */}
          {(() => {
            const gbc = interpretationResult?.genome_build_check;
            if (!gbc) return null;
            if (gbc.status === 'mismatch') {
              return (
                <div
                  className="p-3 rounded-lg text-xs flex items-start gap-2"
                  style={{ backgroundColor: C.errorSoft, border: `1px solid ${C.error}`, color: C.text }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.error }} />
                  <div>
                    <span className="font-semibold" style={{ color: C.error }}>Genome mismatch</span>
                    <span className="ml-1">{gbc.message || `You selected ${(gbc.declared || '').toUpperCase()}, but coordinates match ${(gbc.likely || '').toUpperCase()}. ANNOVAR and Exomiser cannot run until this is resolved — update the genome in sample information or re-upload.`}</span>
                  </div>
                </div>
              );
            }
            if (gbc.status === 'match') {
              return (
                <p className="text-xs flex items-center gap-1.5" style={{ color: C.textMuted }}>
                  Genome build verified: {(gbc.declared || '').toUpperCase()}
                </p>
              );
            }
            if (gbc.status === 'inconclusive') {
              return (
                <p className="text-xs flex items-center gap-1.5" style={{ color: C.textMuted }}>
                  <AlertCircle className="w-3.5 h-3.5" style={{ color: C.warning }} />
                  {gbc.message || `Could not verify genome build — double-check before running ANNOVAR.`}
                </p>
              );
            }
            return null;
          })()}

          {/* Horizontal stepper */}
          <div className="flex items-start p-4">
            {stepperSteps.map((s, i) => {
              const isSel = s.n === selectedStep;
              const passed = s.status === 'passed';
              const attention = s.status === 'failed' || s.status === 'partial';
              const color = getStepColor(s.status);
              const prevDone = i > 0 && stepperSteps[i - 1].status === 'passed';
              const StepIcon = s.icon;

              let nodeStyle;
              let iconColor;
              let NodeGlyph = StepIcon;
              if (passed) {
                nodeStyle = { backgroundColor: C.success, border: 'none' };
                iconColor = '#0F0F0F';
                NodeGlyph = Check;
              } else if (isSel) {
                nodeStyle = { backgroundColor: attention ? C.warning : C.teal, border: 'none' };
                iconColor = '#0F0F0F';
              } else if (attention) {
                nodeStyle = { backgroundColor: 'transparent', border: `1.5px solid ${color}` };
                iconColor = color;
              } else {
                nodeStyle = { backgroundColor: C.surfaceCard, border: `1.5px solid ${C.border}` };
                iconColor = C.textDim;
              }
              const ringColor = passed ? C.successSoft : (attention ? C.warningSoft : C.tealSoft);

              return (
                <React.Fragment key={s.n}>
                  {i > 0 && (
                    <div
                      className="flex-1 h-px mt-5 -mx-4 rounded-full transition-colors"
                      style={{ backgroundColor: prevDone ? C.success : C.border }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedStep(s.n)}
                    className="flex flex-col items-center gap-2.5 flex-shrink-0 px-2 group whitespace-nowrap"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                      style={{ ...nodeStyle, boxShadow: isSel ? `0 0 0 8px ${ringColor}` : 'none' }}
                    >
                      <NodeGlyph className="w-[16px] h-[16px]" style={{ color: iconColor }} strokeWidth={2} />
                    </div>
                    <div className="text-center">
                      <div
                        className="text-[13px] font-semibold leading-tight"
                        style={{ color: isSel || passed ? C.text : C.textMuted }}
                      >
                        {s.name}
                      </div>
                      <div
                        className="text-[11px] leading-tight mt-1"
                        style={{ color: passed ? C.success : (attention && isSel ? C.warning : C.textDim) }}
                      >
                        {getStepSubtitle(s.status)}
                      </div>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Selected step detail panel */}
          {selectedStepData && (
            <Card className="bg-transparent ring-0 border rounded-lg py-0 gap-0" style={{ borderColor: C.border }}>
              <CardContent className="p-4">
                {renderStepDetails(selectedStepData.n, selectedStepData.data) || (
                  <p className="mt-3 text-sm" style={{ color: C.textMuted }}>
                    No column details available for this step yet.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Limitation: not all Pathog predictor columns present (Step 2) */}
          {step2?.pathogenicity_predictor_limitation && (
            <div className="p-3 rounded-lg border" style={{ backgroundColor: C.warningSoft, borderColor: C.warning }}>
              <p className="text-sm font-medium" style={{ color: C.textMuted }}>
                All the needed columns for Pathog predictor are not present. Filtering is allowed using the available predictors (e.g. SIFT, PolyPhen); results may be limited.
              </p>
            </div>
          )}

          {/* Tools — per-step actions */}
          <div className="pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.textDim }}>
              {selectedStep === 1 ? 'Review' : selectedStep === 2 ? 'Annotate' : 'Apply filters'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
            {selectedStep === 1 && (
              <>
              {/* VCF Upload Button - Highlighted when recommended */}
              {showVcfTabHighlight && (
                <>
                  <div className="relative group">
                    <button
                      onClick={() => {
                        if (recommendedButton === 'vcf' && onTryVcfUpload) {
                          onTryVcfUpload();
                        }
                      }}
                      className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                        recommendedButton === 'vcf' ? 'animate-pulse ring-2 ring-offset-2' : ''
                      }`}
                      style={{
                        backgroundColor: recommendedButton === 'vcf' ? C.tealSoft : C.surfaceCard,
                        color: recommendedButton === 'vcf' ? C.teal : C.textMuted,
                        border: recommendedButton === 'vcf' ? `2px solid ${C.teal}` : `1px solid ${C.border}`,
                      }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = C.tealSoft; e.target.style.borderColor = C.teal; }}
                      onMouseLeave={(e) => {
                        if (recommendedButton === 'vcf') { e.target.style.backgroundColor = C.tealSoft; e.target.style.borderColor = C.teal; }
                        else { e.target.style.backgroundColor = C.surfaceCard; e.target.style.borderColor = C.border; }
                      }}
                    >
                      {isVcfFile ? 'Upload raw data for better results' : 'Try VCF upload for better results'}
                    </button>
                    {primaryRecommendation && recommendedButton === 'vcf' && (
                      <div
                        className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10"
                        style={{ ...tooltipStyle, maxWidth: '250px', whiteSpace: 'normal', textAlign: 'left' }}
                      >
                        {primaryRecommendation}
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4" style={tooltipArrowStyle} />
                      </div>
                    )}
                  </div>
                  {!isVcfFile && onConvertToVcf && (
                    <button
                      type="button"
                      onClick={() => onConvertToVcf()}
                      disabled={isConvertingToVcf || backgroundJobActive}
                      className="px-4 py-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
                      style={{ backgroundColor: C.surfaceCard, color: C.teal, border: `1px solid ${C.teal}` }}
                    >
                      {isConvertingToVcf ? 'Converting…' : 'Convert file to VCF'}
                    </button>
                  )}
                </>
              )}

              {!showVcfTabHighlight && step1?.passed && (
                <p className="text-xs" style={{ color: C.textMuted }}>
                  All required columns present, proceed to the next step.
                </p>
              )}
              </>
            )}

            {selectedStep === 2 && (
              <>
              {/* ANNOVAR complete indicator */}
              {hasAnnotatedFile && (
                <div className="flex items-center gap-2">
                  {/* <span
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border"
                    style={{
                      backgroundColor: C.successSoft || `${C.success}18`,
                      borderColor: `${C.success}40`,
                      color: C.success,
                    }}
                  >
                    ANNOVAR complete
                  </span> */}
                  <p className="text-xs" style={{ color: C.success }}>
                    Columns added, proceed to the next step to apply filters.
                  </p>
                </div>
              )}

              {/* Run ANNOVAR — shown when step2 has missing columns */}
              {!hasAnnotatedFile && !step2?.passed && (
              <div className="relative group">
                <button
                  onClick={(step1?.passed && !genomeMismatch) ? () => {
                    const allComplete = step1?.passed && step2?.passed && step3?.passed;
                    if (allComplete) { setShowAnnovarConfirm(true); } else { onAnnovarClick?.(); }
                  } : undefined}
                  disabled={!step1?.passed || genomeMismatch}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    (step1?.passed && !genomeMismatch) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                  style={{
                    backgroundColor: (step1?.passed && !genomeMismatch) ? C.surfaceCard : C.surfaceHover,
                    border: `1px solid ${genomeMismatch ? C.error : C.border}`,
                    color: (step1?.passed && !genomeMismatch) ? C.textMuted : C.textDim,
                  }}
                  onMouseEnter={(e) => { if (step1?.passed && !genomeMismatch) { e.target.style.backgroundColor = C.surfaceHover; e.target.style.color = C.text; } }}
                  onMouseLeave={(e) => { if (step1?.passed && !genomeMismatch) { e.target.style.backgroundColor = C.surfaceCard; e.target.style.color = C.textMuted; } }}
                >
                  <img src={qiagenLogo} alt="Qiagen" className="w-5 h-5 object-contain" style={{ filter: (step1?.passed && !genomeMismatch) ? 'none' : 'grayscale(100%) opacity(0.5)' }} />
                  Run ANNOVAR
                </button>
                {genomeMismatch && (
                  <div className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" style={{ ...tooltipStyle, maxWidth: '250px', whiteSpace: 'normal', textAlign: 'left' }}>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: C.error }} />
                      <span>ANNOVAR and Exomiser require a matching genome build. Please fix the mismatch first.</span>
                    </div>
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4" style={tooltipArrowStyle} />
                  </div>
                )}
                {!step1?.passed && !genomeMismatch && (
                  <div className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" style={{ ...tooltipStyle, maxWidth: '250px', whiteSpace: 'normal', textAlign: 'left' }}>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      <span>{isVcfFile ? 'Essential VCF columns are missing. Please upload raw data when available.' : 'Upload VCF to enable'}</span>
                    </div>
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4" style={tooltipArrowStyle} />
                  </div>
                )}
                {primaryRecommendation && recommendedButton === 'annovar' && step1?.passed && (
                  <div className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" style={{ ...tooltipStyle, maxWidth: '250px', whiteSpace: 'normal', textAlign: 'left' }}>
                    {primaryRecommendation}
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4" style={tooltipArrowStyle} />
                  </div>
                )}
              </div>
              )}

              {/* Step 2 all passed, no ANNOVAR needed */}
              {!hasAnnotatedFile && step2?.passed && (
                <p className="text-xs" style={{ color: C.textMuted }}>
                  All annotation columns present — proceed to the next step.
                </p>
              )}
              </>
            )}

            {selectedStep === 3 && (
              <>
              {/* ACMG Filter */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onProprietaryFilterClick?.('filter_1')}
                  disabled={!acmgFilterCanApply || isApplyingProprietaryFilter || acmgFilterActive}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    acmgFilterCanApply && !acmgFilterActive && !isApplyingProprietaryFilter ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                  style={{
                    backgroundColor: acmgFilterActive ? C.tealSoft : acmgFilterCanApply ? C.surfaceCard : C.surfaceHover,
                    border: acmgFilterActive ? `1px solid ${C.teal}` : `1px solid ${C.border}`,
                    color: acmgFilterCanApply ? C.teal : C.textDim,
                  }}
                  onMouseEnter={(e) => { if (acmgFilterCanApply && !acmgFilterActive && !isApplyingProprietaryFilter) { e.target.style.backgroundColor = C.surfaceHover; } }}
                  onMouseLeave={(e) => { if (acmgFilterCanApply && !acmgFilterActive && !isApplyingProprietaryFilter) { e.target.style.backgroundColor = C.surfaceCard; } }}
                >
                  {isApplyingProprietaryFilter ? 'Applying…' : acmgFilterActive ? `${ACMG_FILTER_DISPLAY_NAME} applied` : `Apply ${ACMG_FILTER_DISPLAY_NAME}`}
                </button>
                {!acmgFilterCanApply && !acmgFilterActive && step1?.passed && (
                  <div className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" style={{ ...tooltipStyle, maxWidth: '280px', whiteSpace: 'normal', textAlign: 'left' }}>
                    Run ANNOVAR first — the ACMG filter needs ClinVar or InterVar annotations and gnomAD frequency.
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4" style={tooltipArrowStyle} />
                  </div>
                )}
              </div>

              {/* Functional Impact Filter */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onProprietaryFilterClick?.('filter_2')}
                  disabled={!filter2CanApply || isApplyingProprietaryFilter || filter2Active}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    filter2CanApply && !filter2Active && !isApplyingProprietaryFilter ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                  style={{
                    backgroundColor: filter2Active ? C.tealSoft : filter2CanApply ? C.surfaceCard : C.surfaceHover,
                    border: filter2Active ? `1px solid ${C.teal}` : `1px solid ${C.border}`,
                    color: filter2CanApply ? C.teal : C.textDim,
                  }}
                  onMouseEnter={(e) => { if (filter2CanApply && !filter2Active && !isApplyingProprietaryFilter) { e.target.style.backgroundColor = C.surfaceHover; } }}
                  onMouseLeave={(e) => { if (filter2CanApply && !filter2Active && !isApplyingProprietaryFilter) { e.target.style.backgroundColor = C.surfaceCard; } }}
                >
                  {isApplyingProprietaryFilter ? 'Applying…' : filter2Active ? 'Functional Impact applied' : 'Apply Functional Impact'}
                </button>
                {!filter2CanApply && !filter2Active && step1?.passed && (
                  <div className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10" style={{ ...tooltipStyle, maxWidth: '280px', whiteSpace: 'normal', textAlign: 'left' }}>
                    Run ANNOVAR first — the Functional Impact filter needs predictor annotations (SIFT, PolyPhen, etc.) and population frequency.
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4" style={tooltipArrowStyle} />
                  </div>
                )}
              </div>

              <p className="text-xs w-full mt-1" style={{ color: C.textDim }}>
                You can also skip filters and chat directly.
              </p>
              </>
            )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={() => goToStep(selectedStep - 1)}
            disabled={!canGoBack}
            className="px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted }}
            onMouseEnter={(e) => { if (canGoBack) e.currentTarget.style.backgroundColor = C.surfaceHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            ← Previous
          </button>
          <div className="flex items-center gap-2">
            {canGoForward ? (
              <button
                type="button"
                onClick={() => goToStep(selectedStep + 1)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.surfaceHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDismiss}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors"
                style={{ backgroundColor: 'var(--accent-teal)', border: 'none', color: '#0F0F0F' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-teal-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-teal)'; }}
              >
                {backgroundJobActive ? 'Continue in background' : chatAllowed ? 'Continue Chatting' : 'Continue to chat'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default ColumnInterpretationResults;
