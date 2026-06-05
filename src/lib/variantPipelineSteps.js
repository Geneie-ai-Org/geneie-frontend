export const PIPELINE_STEP_DEFS = [
  { id: 'upload', label: 'Upload', shortLabel: 'Upload' },
  { id: 'interpret', label: 'Interpretation', shortLabel: 'Interpret' },
  { id: 'annovar', label: 'ANNOVAR', shortLabel: 'ANNOVAR' },
  { id: 'reduce', label: 'Reduce variants', shortLabel: 'Reduce' },
  { id: 'chat', label: 'Chat ready', shortLabel: 'Chat' },
];

function step2AcmgReady(columnInterpretationResult) {
  const step2Req = columnInterpretationResult?.step2?.required_columns || {};
  return Boolean(step2Req.CLNSIG?.found || step2Req.InterVar_automated?.found);
}

function hasManualFilters(activeVariantFilters) {
  if (!activeVariantFilters || typeof activeVariantFilters !== 'object') return false;
  if (activeVariantFilters.proprietary != null) return false;
  return Object.keys(activeVariantFilters).length > 0;
}

export function computePipelineSteps({
  hasUploadedFile,
  columnInterpretationResult,
  hasAnnotatedFile,
  requiresAnnovar,
  isRunningAnnovar,
  isApplyingAcmgFilter,
  annovarJob,
  filterJob,
  chatEligibility,
  activeProprietaryFilter,
  activeVariantFilters,
  filteredVariantCount,
  s3LineCountStatus,
  uploadInProgress = false,
  uploadProgress = null,
}) {
  const interpretationReady = Boolean(columnInterpretationResult?.step1);
  const bytesSent = uploadProgress == null || uploadProgress >= 100;
  const serverProcessing = uploadInProgress && bytesSent;

  const lineCountInProgress =
    s3LineCountStatus === 'pending' || s3LineCountStatus === 'running';

  const upload = uploadInProgress
    ? serverProcessing
      ? 'done'
      : 'running'
    : interpretationReady || (hasUploadedFile && !lineCountInProgress)
      ? 'done'
      : hasUploadedFile && lineCountInProgress
        ? 'running'
        : hasUploadedFile
          ? 'done'
          : 'pending';

  const interpret = serverProcessing
    ? 'running'
    : uploadInProgress
      ? 'pending'
      : columnInterpretationResult?.step1?.passed
        ? 'done'
        : interpretationReady
          ? 'done'
          : hasUploadedFile
            ? 'running'
            : 'pending';

  const annovar = (() => {
    if (annovarJob?.status === 'failed') return 'failed';
    if (isRunningAnnovar || annovarJob?.status === 'running') return 'running';
    if (hasAnnotatedFile) return 'done';
    if (!requiresAnnovar && step2AcmgReady(columnInterpretationResult)) return 'skipped';
    if (hasUploadedFile && interpret === 'done') return 'pending';
    return 'pending';
  })();

  const hasReduction =
    activeProprietaryFilter === 'filter_1' || hasManualFilters(activeVariantFilters);
  const filterRunning =
    isApplyingAcmgFilter ||
    filterJob?.status === 'running' ||
    filterJob?.status === 'pending';
  const filterFailed = filterJob?.status === 'failed';

  const reduce = (() => {
    if (filterFailed) return 'failed';
    if (filterRunning) return 'running';
    if (hasReduction && filteredVariantCount != null) return 'done';
    if (chatEligibility?.allowed && !requiresAnnovar && hasAnnotatedFile && !hasReduction) {
      return 'skipped';
    }
    if (chatEligibility?.allowed && hasReduction) return 'done';
    if (annovar === 'done' || annovar === 'skipped') return 'pending';
    return 'pending';
  })();

  const chat = (() => {
    if (chatEligibility?.allowed) return 'done';
    if (chatEligibility?.reason === 'S3_LINE_COUNT_PENDING') return 'pending';
    if (reduce === 'done' && filteredVariantCount != null) return 'pending';
    return 'pending';
  })();

  return { upload, interpret, annovar, reduce, chat };
}

export function getPipelineBackgroundActive({
  uploadInProgress,
  isRunningAnnovar,
  isApplyingAcmgFilter,
  annovarJob,
  filterJob,
  s3LineCountStatus,
  columnInterpretationResult,
}) {
  const interpretationReady = Boolean(columnInterpretationResult?.step1);
  const lineCountInProgress =
    s3LineCountStatus === 'pending' || s3LineCountStatus === 'running';

  return (
    uploadInProgress ||
    isRunningAnnovar ||
    isApplyingAcmgFilter ||
    annovarJob?.status === 'running' ||
    filterJob?.status === 'running' ||
    lineCountInProgress
  );
}

import { getUploadDisplayMessage } from '@/lib/uploadProcessingPhases';

export function getPipelineStatusLine(props, steps) {
  const {
    uploadInProgress,
    uploadProgress,
    isRunningAnnovar,
    isApplyingAcmgFilter,
    annovarJob,
    filterJob,
    chatEligibility,
    variantsUnderConsideration,
    filteredVariantCount,
    columnInterpretationResult,
    s3LineCountStatus,
  } = props;

  const interpretationReady = Boolean(columnInterpretationResult?.step1);
  const lineCountInProgress =
    s3LineCountStatus === 'pending' || s3LineCountStatus === 'running';

  if (uploadInProgress) {
    const uploadMsg = getUploadDisplayMessage({ uploadProgress });
    if (uploadMsg) return uploadMsg;
    return 'Processing your variant file on the server…';
  }
  if (lineCountInProgress && !interpretationReady) {
    return 'Counting variant rows in your file on the server…';
  }
  if (lineCountInProgress && interpretationReady) {
    return 'Counting rows in the background. You can run ANNOVAR or apply filters while this finishes.';
  }
  if (isRunningAnnovar || annovarJob?.status === 'running') {
    return annovarJob?.message || 'Annotation is running in the background.';
  }
  if (isApplyingAcmgFilter || filterJob?.status === 'running') {
    return filterJob?.message || 'Prioritizing variants in the background.';
  }
  if (chatEligibility?.allowed) {
    const n = variantsUnderConsideration ?? filteredVariantCount;
    return n != null
      ? `Chat is enabled (${Number(n).toLocaleString()} variants under consideration).`
      : 'Chat is enabled.';
  }
  if (chatEligibility?.message) {
    return chatEligibility.message;
  }
  if (steps?.annovar === 'failed') {
    return 'ANNOVAR did not complete. Open details to retry.';
  }
  if (steps?.reduce === 'failed') {
    return 'Variant prioritization failed. Open filters to try again.';
  }
  return 'Complete each step to enable chat on a focused variant set.';
}

/** Current focus step: first running, else first pending (after upload started). */
export function getPipelineFocusStep(steps, hasUploadedFile) {
  if (!hasUploadedFile) return null;
  const order = PIPELINE_STEP_DEFS.map((d) => d.id);
  const running = order.find((id) => steps[id] === 'running');
  if (running) return running;
  const failed = order.find((id) => steps[id] === 'failed');
  if (failed) return failed;
  const pending = order.find((id) => steps[id] === 'pending');
  if (pending) return pending;
  return 'chat';
}

export function getPipelineStepNumber(steps, focusId) {
  const idx = PIPELINE_STEP_DEFS.findIndex((d) => d.id === focusId);
  if (idx < 0) return null;
  const doneCount = PIPELINE_STEP_DEFS.filter(
    (d, i) => i <= idx && (steps[d.id] === 'done' || steps[d.id] === 'skipped')
  ).length;
  return Math.min(doneCount + (steps[focusId] === 'running' ? 0 : 1), PIPELINE_STEP_DEFS.length);
}

export function getPipelineChipSummary(steps, hasUploadedFile) {
  const focusId = getPipelineFocusStep(steps, hasUploadedFile);
  if (!focusId) return { stepIndex: 0, total: 5, label: 'Upload', status: 'pending' };
  const def = PIPELINE_STEP_DEFS.find((d) => d.id === focusId);
  const stepIndex = PIPELINE_STEP_DEFS.findIndex((d) => d.id === focusId) + 1;
  const status = steps[focusId];
  let label = def?.shortLabel || def?.label || focusId;
  if (status === 'running') label = `${label}…`;
  if (status === 'done') label = 'Ready';
  if (status === 'skipped') label = def?.shortLabel || label;
  if (focusId === 'chat' && status === 'done') label = 'Ready';
  return {
    stepIndex,
    total: PIPELINE_STEP_DEFS.length,
    label,
    status,
    focusId,
  };
}
