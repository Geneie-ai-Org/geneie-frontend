import { PHENOTYPE_RUNNING_MESSAGE } from '@/lib/filterDisplayNames';

export const PIPELINE_STEP_DEFS = [
  { id: 'upload', label: 'Upload', shortLabel: 'Upload' },
  { id: 'interpret', label: 'Interpretation', shortLabel: 'Interpret' },
  { id: 'annovar', label: 'ANNOVAR', shortLabel: 'ANNOVAR' },
  { id: 'reduce', label: 'Reduce variants', shortLabel: 'Filter' },
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

/** Reduction inputs, exported so a caller can report them without re-deriving them. */
export function getReductionState(activeProprietaryFilter, activeVariantFilters) {
  const hasProprietary =
    activeProprietaryFilter === 'filter_1' || activeProprietaryFilter === 'filter_3';
  const hasManual = hasManualFilters(activeVariantFilters);
  return { hasProprietary, hasManual, hasReduction: hasProprietary || hasManual };
}

/**
 * The `reduce` step, with the branch that decided it. Returning the reason keeps the
 * diagnostic honest — it comes from the same evaluation, not a second copy of the rules.
 */
export function computeReduceStep({
  hasReduction,
  filterRunning,
  filterFailed,
  filteredVariantCount,
  chatEligibility,
  requiresAnnovar,
  hasAnnotatedFile,
  annovar,
}) {
  if (filterFailed) return { status: 'failed', reason: 'filter/exomiser job reported failed' };
  if (filterRunning) return { status: 'running', reason: 'filter/exomiser job in flight' };
  if (hasReduction && filteredVariantCount != null) {
    return { status: 'done', reason: 'stored filter + stored filtered_variant_count' };
  }
  if (chatEligibility?.allowed && !requiresAnnovar && hasAnnotatedFile && !hasReduction) {
    if (!chatEligibility.requires_filter) {
      return { status: 'skipped', reason: 'chat allowed without a filter' };
    }
    return { status: 'pending', reason: 'filter recommended before chat' };
  }
  if (chatEligibility?.allowed && hasReduction) {
    return { status: 'done', reason: 'chat allowed with a stored filter' };
  }
  return { status: 'pending', reason: 'no filter recorded yet' };
}

export function computePipelineSteps({
  hasUploadedFile,
  columnInterpretationResult,
  hasAnnotatedFile,
  requiresAnnovar,
  isRunningAnnovar,
  isApplyingProprietaryFilter,
  annovarJob,
  filterJob,
  chatEligibility,
  activeProprietaryFilter,
  activeVariantFilters,
  filteredVariantCount,
  s3LineCountStatus,
  uploadInProgress = false,
  uploadProgress = null,
  isRunningExomiser = false,
  exomiserStatus = null,
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

  const { hasReduction } = getReductionState(activeProprietaryFilter, activeVariantFilters);
  const filterRunning =
    isApplyingProprietaryFilter ||
    filterJob?.status === 'running' ||
    filterJob?.status === 'pending' ||
    isRunningExomiser ||
    exomiserStatus?.status === 'running' ||
    exomiserStatus?.status === 'queued';
    
  const filterFailed =
    filterJob?.status === 'failed' || (exomiserStatus?.status === 'failed' && !hasReduction);

  const { status: reduce } = computeReduceStep({
    hasReduction,
    filterRunning,
    filterFailed,
    filteredVariantCount,
    chatEligibility,
    requiresAnnovar,
    hasAnnotatedFile,
    annovar,
  });

  const chat = (() => {
    if (chatEligibility?.allowed) return 'done';
    if (chatEligibility?.reason === 'S3_LINE_COUNT_PENDING') return 'pending';
    if (reduce === 'done' && filteredVariantCount != null) return 'pending';
    return 'pending';
  })();

  /* A step cannot be finished while an earlier one is still running or has failed — that
   * run will invalidate whatever the later step recorded. The statuses above are each
   * derived independently from current conversation fields, so without this clamp the
   * pipeline can show Filter complete while ANNOVAR is mid-run on a variant set that
   * annotation is about to change. */
  const statuses = { upload, interpret, annovar, reduce, chat };
  let invalidated = false;
  for (const { id } of PIPELINE_STEP_DEFS) {
    if (invalidated && (statuses[id] === 'done' || statuses[id] === 'skipped')) {
      statuses[id] = 'pending';
    }
    if (statuses[id] === 'running' || statuses[id] === 'failed') invalidated = true;
  }
  return statuses;
}

export function getPipelineBackgroundActive({
  uploadInProgress,
  isRunningAnnovar,
  isApplyingProprietaryFilter,
  annovarJob,
  filterJob,
  s3LineCountStatus,
  columnInterpretationResult,
  isRunningExomiser,
  exomiserStatus,
}) {
  const interpretationReady = Boolean(columnInterpretationResult?.step1);
  const lineCountInProgress =
    s3LineCountStatus === 'pending' || s3LineCountStatus === 'running';

  return (
    uploadInProgress ||
    isRunningAnnovar ||
    isApplyingProprietaryFilter ||
    annovarJob?.status === 'running' ||
    filterJob?.status === 'running' ||
    isRunningExomiser ||
    exomiserStatus?.status === 'running' ||
    exomiserStatus?.status === 'queued' ||
    lineCountInProgress
  );
}

export function getPipelineStatusLine(props, steps) {
  const {
    uploadInProgress,
    uploadProgress,
    isRunningAnnovar,
    isApplyingProprietaryFilter,
    annovarJob,
    filterJob,
    chatEligibility,
    variantsUnderConsideration,
    filteredVariantCount,
    columnInterpretationResult,
    s3LineCountStatus,
    isRunningExomiser,
    exomiserStatus,
  } = props;

  const interpretationReady = Boolean(columnInterpretationResult?.step1);
  const lineCountInProgress =
    s3LineCountStatus === 'pending' || s3LineCountStatus === 'running';

  if (uploadInProgress) {
    return uploadProgress != null && uploadProgress < 100
      ? 'Sending your variant file to the server…'
      : 'Processing your variant file on the server…';
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
  if (isApplyingProprietaryFilter || filterJob?.status === 'running') {
    return filterJob?.message || 'Prioritizing variants in the background.';
  }
  if (isRunningExomiser || exomiserStatus?.status === 'running' || exomiserStatus?.status === 'queued') {
    return exomiserStatus?.message || PHENOTYPE_RUNNING_MESSAGE;
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
