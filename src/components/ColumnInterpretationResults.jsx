import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, X, FileText, ChevronDown, ChevronUp, Info, ArrowRight, Trash2 } from 'lucide-react';
import qiagenLogo from '../Qiagen.svg.png';
import { ACMG_FILTER_DISPLAY_NAME } from './VariantFilterSidebar';

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
  warning: 'var(--warning)',
  warningSoft: 'var(--warning-soft)',
  warningText: 'var(--warning)',
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
  onAcmgFilterClick,
  isApplyingAcmgFilter = false,
  acmgFilterActive = false,
  acmgFilterCanApply = false,
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
}) => {
  const [expandedStep, setExpandedStep] = useState(null); // Track which step is expanded
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Explicit remove-file confirmation only
  const [showAnnovarConfirm, setShowAnnovarConfirm] = useState(false); // Confirm ANNOVAR when all columns present

  const backgroundJobActive = isRunningAnnovar || isApplyingAcmgFilter;
  
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

  const toggleStep = (stepNumber) => {
    setExpandedStep(expandedStep === stepNumber ? null : stepNumber);
  };

  const getStepIcon = (status) => {
    if (status === 'passed') {
      return <CheckCircle2 className="w-5 h-5" style={{ color: C.success }} />;
    }
    if (status === 'pending') {
      return <Info className="w-5 h-5" style={{ color: C.info }} />;
    }
    return <AlertCircle className="w-5 h-5" style={{ color: C.warning }} />;
  };

  const getStepLabel = (status) => {
    if (status === 'passed') return 'Complete';
    if (status === 'pending') return 'Pending';
    return 'Incomplete';
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

  const stepCardHandlers = {
    onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = C.surfaceHover; },
    onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = C.surfaceCard; },
  };

  const chevronBtnHandlers = {
    onMouseEnter: (e) => { e.currentTarget.style.backgroundColor = C.surfaceHover; },
    onMouseLeave: (e) => { e.currentTarget.style.backgroundColor = 'transparent'; },
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

  const renderStepDetails = (stepNumber, stepData) => {
    if (stepNumber === 1) {
      const required = stepData.required_columns || {};
      const columnsNoValidValues = stepData.columns_no_valid_values || [];
      
      return (
        <div className="mt-3 space-y-2 text-sm">
          <div className="space-y-1">
            {Object.entries(required).map(([colName, colInfo]) => (
              <div key={colName} className="flex items-center justify-between">
                <span style={{ color: C.textMuted }}>{colName}:</span>
                {colInfo.found ? (
                  <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column}</span>
                ) : columnsNoValidValues.includes(colName) ? (
                  <span className="font-medium text-xs" style={{ color: C.warningText }}>○ No valid values</span>
                ) : (
                  <span className="font-medium text-xs" style={{ color: C.warning }}>○ Missing</span>
                )}
              </div>
            ))}
          </div>
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
        <div className="mt-3 space-y-3 text-sm">
          {Object.keys(required).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Required Columns:</p>
              <div className="space-y-1">
                {Object.entries(required).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column || 'Found'}</span>
                    ) : columnsNoValidValues.includes(colName) ? (
                      <span className="font-medium text-xs" style={{ color: C.warningText }}>○ No valid values</span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: C.warning }}>○ Missing</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(pathogenicity_group).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Pathogenicity Predictors (At Least 2 Required):</p>
              <div className="space-y-1">
                {Object.entries(pathogenicity_group).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column || 'Found'}</span>
                    ) : columnsNoValidValues.includes(colName) ? (
                      <span className="font-medium text-xs" style={{ color: C.warningText }}>○ No valid values</span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: C.textDim }}>○ Not found</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
        return null; // Don't show pending message
      }
      
      const required = stepData.required_columns || {};
      const sample_genotype_group = stepData.sample_genotype_group || {};
      const pathogenicity_score_group = stepData.pathogenicity_score_group || {};
      const conditional = stepData.conditional_columns || {};
      const columnsNoValidValues = stepData.columns_no_valid_values || [];
      const optional = stepData.optional_columns || {};
      const missing_groups = stepData.missing_groups || [];
      
      return (
        <div className="mt-3 space-y-3 text-sm">
          {/* Required Columns */}
          {Object.keys(required).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Required Columns:</p>
              <div className="space-y-1">
                {Object.entries(required).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column || 'Found'}</span>
                    ) : columnsNoValidValues.includes(colName) ? (
                      <span className="font-medium text-xs" style={{ color: C.warningText }}>○ No valid values</span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: C.warning }}>○ Missing</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Sample Genotype Group */}
          {Object.keys(sample_genotype_group).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Sample Genotype (Any One Required):</p>
              <div className="space-y-1">
                {Object.entries(sample_genotype_group).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column || 'Found'}</span>
                    ) : columnsNoValidValues.includes(colName) ? (
                      <span className="font-medium text-xs" style={{ color: C.warningText }}>○ No valid values</span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: C.textDim }}>○ Not found</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Pathogenicity Score Group */}
          {Object.keys(pathogenicity_score_group).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Pathogenicity Scores (Any One Required):</p>
              <div className="space-y-1">
                {Object.entries(pathogenicity_score_group).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column || 'Found'}</span>
                    ) : columnsNoValidValues.includes(colName) ? (
                      <span className="font-medium text-xs" style={{ color: C.warningText }}>○ No valid values</span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: C.textDim }}>○ Not found</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Conditional Columns */}
          {Object.keys(conditional).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Conditional Columns:</p>
              <div className="space-y-1">
                {Object.entries(conditional).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>
                        ✓ {colInfo.matched_column || 'Found'}
                        {colInfo.required && <span className="ml-1 text-xs">(Required)</span>}
                      </span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: colInfo.required ? C.warning : C.textDim }}>
                        {colInfo.required ? '○ Missing (Required)' : '○ Not found (Optional)'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Optional Columns */}
          {Object.keys(optional).length > 0 && (
            <div>
              <p className="font-semibold mb-2" style={{ color: C.text }}>Optional Columns:</p>
              <div className="space-y-1">
                {Object.entries(optional).map(([colName, colInfo]) => (
                  <div key={colName} className="flex items-center justify-between">
                    <span style={{ color: C.textMuted }}>{colName}:</span>
                    {colInfo.found ? (
                      <span className="font-medium text-xs" style={{ color: C.success }}>✓ {colInfo.matched_column || 'Found'}</span>
                    ) : (
                      <span className="font-medium text-xs" style={{ color: C.textDim }}>○ Not found</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Missing Groups */}
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

  return (
    <>
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <div 
            className="rounded-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface, boxShadow: C.shadow }}
          >
            <div className="p-6 rounded-t-xl" style={{ backgroundColor: C.tealSoft, borderBottom: `1px solid ${C.teal}` }}>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6" style={{ color: C.teal }} />
                <h2 className="text-2xl font-bold" style={{ color: C.text }}>Remove file?</h2>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: C.textMuted }}>
                This removes the uploaded file from this conversation. Annotation and filters in progress will stop. This cannot be undone.
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3 rounded-b-xl" style={{ borderColor: C.border, backgroundColor: C.surfaceCard }}>
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
                <Trash2 className="w-4 h-4" />
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
            className="rounded-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface, boxShadow: C.shadow }}
          >
            <div className="p-6 rounded-t-xl" style={{ backgroundColor: C.tealSoft, borderBottom: `1px solid ${C.teal}` }}>
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6" style={{ color: C.teal }} />
                <h2 className="text-xl font-bold" style={{ color: C.text }}>Run ANNOVAR?</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: C.textMuted }}>
                All required columns are already present in your file. Do you really want to proceed?
              </p>
              <p className="text-sm" style={{ color: C.textMuted }}>
                Running ANNOVAR will add more information to some columns and make the analysis more streamlined.
              </p>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3 rounded-b-xl" style={{ borderColor: C.border, backgroundColor: C.surfaceCard }}>
              <button
                onClick={() => setShowAnnovarConfirm(false)}
                className="px-6 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                style={{ backgroundColor: C.surfaceCard, border: `1px solid ${C.border}`, color: C.textMuted }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowAnnovarConfirm(false);
                  onAnnovarClick?.();
                }}
                className="px-6 py-2 text-sm font-semibold rounded-xl shadow-sm"
                style={{ backgroundColor: C.teal, color: 'var(--bg-app)' }}
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
          className="rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          style={{ border: `1px solid ${C.border}`, backgroundColor: C.surface, boxShadow: C.shadow }}
        >
        <div className="p-6 rounded-t-xl" style={{ backgroundColor: C.tealSoft, borderBottom: `1px solid ${C.teal}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6" style={{ color: C.teal }} />
              <h2 className="text-2xl font-bold" style={{ color: C.text }}>File Analysis</h2>
            </div>
            <button
              onClick={handleDismiss}
              className="transition-colors p-1 rounded-lg"
              style={{ color: C.textMuted }}
              onMouseEnter={(e) => { e.currentTarget.style.color = C.text; e.currentTarget.style.backgroundColor = C.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.backgroundColor = 'transparent'; }}
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {backgroundJobActive && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{ backgroundColor: C.successSoft, border: `1px solid ${C.success}`, color: C.text }}
            >
              {isRunningAnnovar
                ? 'ANNOVAR is running in the background. You can close this window and continue in chat — progress appears in the pipeline bar at the top.'
                : 'The ACMG filter is running in the background. You can close this window and continue in chat.'}
            </div>
          )}

          {/* Overall Status */}
          <div className="text-center pb-4 border-b" style={{ borderColor: C.border }}>
            {overall_status === 'passed' ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-10 h-10" style={{ color: C.success }} />
                <h3 className="text-lg font-bold" style={{ color: C.text }}>Analysis Complete</h3>
                <p className="text-sm" style={{ color: C.textMuted }}>Your file is ready for analysis</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <AlertCircle className="w-10 h-10" style={{ color: C.warning }} />
                <h3 className="text-lg font-bold" style={{ color: C.text }}>Partial Analysis</h3>
                <p className="text-sm" style={{ color: C.textMuted }}>Some features may be limited</p>
              </div>
            )}
          </div>

          {/* Single-line warning: total rows that may have data quality issues */}
          {(() => {
            const r = interpretationResult || {};
            const total = (r.variants_skipped_invalid_alleles || 0) + (r.variants_skipped_invalid_predictors || 0) + (r.variants_skipped_invalid_genotype || 0) + (r.variants_skipped_invalid_mandatory_annotation || 0);
            return total > 0 ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-l-4" style={{ backgroundColor: C.warningSoft, borderColor: C.warning, borderLeftColor: C.warning }}>
                <span className="font-semibold" style={{ color: C.warning }}>{total.toLocaleString()}</span>
                <span className="text-sm" style={{ color: C.textMuted }}>variant row(s) may have data quality issues. All rows stored.</span>
              </div>
            ) : null;
          })()}

          {/* Limitation: not all Pathog predictor columns present (Step 2) */}
          {step2?.pathogenicity_predictor_limitation && (
            <div className="p-3 rounded-lg border" style={{ backgroundColor: C.warningSoft, borderColor: C.warning }}>
              <p className="text-sm font-medium" style={{ color: C.textMuted }}>
                All the needed columns for Pathog predictor are not present. Filtering is allowed using the available predictors (e.g. SIFT, PolyPhen); results may be limited.
              </p>
            </div>
          )}

          {/* Step Progress Bars */}
          <div className="space-y-3">
            {/* Step 1 */}
            <div className="border rounded-lg p-4 transition-colors" style={{ borderColor: C.border, backgroundColor: C.surfaceCard }} {...stepCardHandlers}>
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleStep(1)}
              >
                <div className="flex items-center gap-3 flex-1">
                  {getStepIcon(step1Status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold" style={{ color: C.text }}>Step 1: {isVcfFile ? 'ANNOVAR ready' : 'VCF Reconstruction'}</span>
                      <span 
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={getStepBadgeStyle(step1Status)}
                      >
                        {getStepLabel(step1Status)}
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: C.track }}>
                      <div 
                        className="h-2 rounded-full transition-all"
                        style={{ 
                          width: `${step1Progress}%`,
                          backgroundColor: getStepColor(step1Status)
                        }}
                      />
                    </div>
                  </div>
                </div>
                <button className="ml-3 p-1 rounded transition-colors" {...chevronBtnHandlers}>
                  {expandedStep === 1 ? (
                    <ChevronUp className="w-5 h-5" style={{ color: C.textMuted }} />
                  ) : (
                    <ChevronDown className="w-5 h-5" style={{ color: C.textMuted }} />
                  )}
                </button>
              </div>
              {expandedStep === 1 && renderStepDetails(1, step1)}
            </div>

            {/* Step 2 */}
            <div className="border rounded-lg p-4 transition-colors" style={{ borderColor: C.border, backgroundColor: C.surfaceCard }} {...stepCardHandlers}>
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleStep(2)}
              >
                <div className="flex items-center gap-3 flex-1">
                  {getStepIcon(step2Status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold" style={{ color: C.text }}>Step 2: {step2?.step_name || 'Proprietary Filters'}</span>
                      <span 
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={getStepBadgeStyle(step2Status)}
                      >
                        {getStepLabel(step2Status)}
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: C.track }}>
                      <div 
                        className="h-2 rounded-full transition-all"
                        style={{ 
                          width: `${step2Progress}%`,
                          backgroundColor: getStepColor(step2Status)
                        }}
                      />
                    </div>
                  </div>
                </div>
                <button className="ml-3 p-1 rounded transition-colors" {...chevronBtnHandlers}>
                  {expandedStep === 2 ? (
                    <ChevronUp className="w-5 h-5" style={{ color: C.textMuted }} />
                  ) : (
                    <ChevronDown className="w-5 h-5" style={{ color: C.textMuted }} />
                  )}
                </button>
              </div>
              {expandedStep === 2 && renderStepDetails(2, step2)}
            </div>

            {/* Step 3 */}
            <div className="border rounded-lg p-4 transition-colors" style={{ borderColor: C.border, backgroundColor: C.surfaceCard }} {...stepCardHandlers}>
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleStep(3)}
              >
                <div className="flex items-center gap-3 flex-1">
                  {getStepIcon(step3Status)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold" style={{ color: C.text }}>Step 3: Clinical Decision</span>
                      <span 
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={getStepBadgeStyle(step3Status)}
                      >
                        {getStepLabel(step3Status)}
                      </span>
                    </div>
                    <div className="w-full rounded-full h-2" style={{ backgroundColor: C.track }}>
                      <div 
                        className="h-2 rounded-full transition-all"
                        style={{ 
                          width: `${step3Progress}%`,
                          backgroundColor: getStepColor(step3Status)
                        }}
                      />
                    </div>
                  </div>
                </div>
                <button className="ml-3 p-1 rounded transition-colors" {...chevronBtnHandlers}>
                  {expandedStep === 3 ? (
                    <ChevronUp className="w-5 h-5" style={{ color: C.textMuted }} />
                  ) : (
                    <ChevronDown className="w-5 h-5" style={{ color: C.textMuted }} />
                  )}
                </button>
              </div>
              {expandedStep === 3 && renderStepDetails(3, step3)}
            </div>
          </div>
        </div>

        {/* Actions - Graphical recommendations with hover tooltips */}
        <div className="px-6 py-4 border-t flex items-center justify-between rounded-b-xl" style={{ borderColor: C.border, backgroundColor: C.surfaceCard }}>
          {/* VCF Upload Button - Highlighted when recommended */}
          {showVcfTabHighlight && (
            <div className="flex flex-wrap items-center gap-2">
            <div className="relative group">
              <button
                onClick={() => {
                  if (recommendedButton === 'vcf' && onTryVcfUpload) {
                    onTryVcfUpload(); // Close this modal, open upload modal, switch to VCF tab
                  }
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm ${
                  recommendedButton === 'vcf' 
                    ? 'animate-pulse ring-2 ring-offset-2' 
                    : ''
                }`}
                style={{ 
                  backgroundColor: recommendedButton === 'vcf' ? C.tealSoft : C.surfaceCard,
                  color: recommendedButton === 'vcf' ? C.teal : C.textMuted,
                  border: recommendedButton === 'vcf' ? `2px solid ${C.teal}` : `1px solid ${C.border}`,
                }}
                onMouseEnter={(e) => { 
                  e.target.style.backgroundColor = C.tealSoft;
                  e.target.style.borderColor = C.teal;
                }}
                onMouseLeave={(e) => { 
                  if (recommendedButton === 'vcf') {
                    e.target.style.backgroundColor = C.tealSoft;
                    e.target.style.borderColor = C.teal;
                  } else {
                    e.target.style.backgroundColor = C.surfaceCard;
                    e.target.style.borderColor = C.border;
                  }
                }}
              >
                {isVcfFile
                  ? 'Upload raw data for better results'
                  : 'Try VCF upload for better results'}
              </button>
              {/* Hover tooltip with recommendation */}
              {primaryRecommendation && recommendedButton === 'vcf' && (
                <div 
                  className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10"
                  style={{ 
                    backgroundColor: C.tooltip,
                    color: C.text,
                    fontSize: '12px',
                    fontWeight: '500',
                    maxWidth: '250px',
                    whiteSpace: 'normal',
                    textAlign: 'left',
                    border: `1px solid ${C.border}`,
                    boxShadow: C.shadow,
                  }}
                >
                  {primaryRecommendation}
                  <div 
                    className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4"
                    style={{ 
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderTopColor: C.tooltip,
                    }}
                  />
                </div>
              )}
            </div>
            {!isVcfFile && onConvertToVcf && (
              <button
                type="button"
                onClick={() => onConvertToVcf()}
                disabled={isConvertingToVcf || backgroundJobActive}
                className="px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-60"
                style={{
                  backgroundColor: C.surfaceCard,
                  color: C.teal,
                  border: `1px solid ${C.teal}`,
                }}
              >
                {isConvertingToVcf ? 'Converting…' : 'Convert file to VCF'}
              </button>
            )}
            </div>
          )}
          
          <div className="flex items-center gap-2 ml-auto justify-end">
            {onDeleteDocument && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors"
                style={{ color: C.error, border: `1px solid ${C.error}`, backgroundColor: C.errorSoft }}
              >
                Remove file
              </button>
            )}

            {/* Dismiss modal — never deletes the file */}
            <button
              type="button"
              onClick={handleDismiss}
              className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors shadow-sm"
              style={{
                backgroundColor: C.teal,
                border: 'none',
                color: 'var(--bg-app)',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = C.tealHover;
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = C.teal;
              }}
            >
              {backgroundJobActive
                ? 'Continue in background'
                : chatAllowed
                  ? 'Continue Chatting'
                  : 'Continue to chat'}
            </button>

            {/* ANNOVAR Button - Optional (secondary) */}
            <div className="relative group">
              <button
                onClick={step1?.passed ? () => {
                  const allComplete = step1?.passed && step2?.passed && step3?.passed;
                  if (allComplete) {
                    setShowAnnovarConfirm(true);
                  } else {
                    onAnnovarClick?.();
                  }
                } : undefined}
                disabled={!step1?.passed}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center gap-2 ${
                  step1?.passed
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-50'
                }`}
                style={{ 
                  backgroundColor: step1?.passed ? C.surfaceCard : C.surfaceHover,
                  border: `1px solid ${C.border}`,
                  color: step1?.passed ? C.textMuted : C.textDim,
                }}
                onMouseEnter={(e) => { 
                  if (step1?.passed) {
                    e.target.style.backgroundColor = C.surfaceHover;
                    e.target.style.color = C.text;
                  }
                }}
                onMouseLeave={(e) => { 
                  if (step1?.passed) {
                    e.target.style.backgroundColor = C.surfaceCard;
                    e.target.style.color = C.textMuted;
                  }
                }}
              >
                <img 
                  src={qiagenLogo} 
                  alt="Qiagen" 
                  className="w-5 h-5 object-contain"
                  style={{ filter: step1?.passed ? 'none' : 'grayscale(100%) opacity(0.5)' }}
                />
                Run ANNOVAR
              </button>
              
              {/* Tooltip when disabled */}
              {!step1?.passed && (
                <div 
                  className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap"
                  style={tooltipStyle}
                >
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-3 h-3" />
                    <span>
                      {isVcfFile
                        ? 'Essential VCF columns are missing. Please upload raw data when available.'
                        : 'Upload VCF to enable'}
                    </span>
                  </div>
                  <div 
                    className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4"
                    style={tooltipArrowStyle}
                  />
                </div>
              )}
              
              {primaryRecommendation && recommendedButton === 'annovar' && step1?.passed && (
                <div 
                  className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10"
                  style={{ ...tooltipStyle, maxWidth: '250px', whiteSpace: 'normal', textAlign: 'left' }}
                >
                  {primaryRecommendation}
                  <div 
                    className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4"
                    style={tooltipArrowStyle}
                  />
                </div>
              )}
            </div>

            <div className="relative group">
              <button
                type="button"
                onClick={() => onAcmgFilterClick?.()}
                disabled={!acmgFilterCanApply || isApplyingAcmgFilter || acmgFilterActive}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center gap-2 ${
                  acmgFilterCanApply && !acmgFilterActive && !isApplyingAcmgFilter
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-50'
                }`}
                style={{
                  backgroundColor: acmgFilterActive ? C.tealSoft : acmgFilterCanApply ? C.surfaceCard : C.surfaceHover,
                  border: acmgFilterActive ? `1px solid ${C.teal}` : `1px solid ${C.border}`,
                  color: acmgFilterCanApply ? C.teal : C.textDim,
                }}
                onMouseEnter={(e) => {
                  if (acmgFilterCanApply && !acmgFilterActive && !isApplyingAcmgFilter) {
                    e.target.style.backgroundColor = C.surfaceHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (acmgFilterCanApply && !acmgFilterActive && !isApplyingAcmgFilter) {
                    e.target.style.backgroundColor = C.surfaceCard;
                  }
                }}
              >
                {isApplyingAcmgFilter ? 'Applying…' : acmgFilterActive ? `${ACMG_FILTER_DISPLAY_NAME} applied` : `Apply ${ACMG_FILTER_DISPLAY_NAME}`}
              </button>
              {!acmgFilterCanApply && !acmgFilterActive && step1?.passed && (
                <div
                  className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap"
                  style={{ ...tooltipStyle, maxWidth: '280px', whiteSpace: 'normal', textAlign: 'left' }}
                >
                  Run ANNOVAR first — the ACMG filter needs ClinVar or InterVar annotations and gnomAD frequency.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default ColumnInterpretationResults;
