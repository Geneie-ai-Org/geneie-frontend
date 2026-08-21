/**
 * Module 1 (FASTQ pipeline) phase model. Kept separate from uploadProcessingPhases.js,
 * which is wired to the unrelated single-file VCF/TSV upload progress line.
 *
 * Real backend phase order includes `running` between `staging` and `trimming` — not
 * documented in the original handoff spec, but present in the deployed worker.
 */

export const MODULE1_PHASE_ORDER = [
  'queued',
  'staging',
  'running',
  'trimming',
  'aligning',
  'calling',
  'finalizing',
  'complete',
];

export const MODULE1_PHASE_MESSAGES = {
  queued: 'Queued — waiting for a worker to pick up your job…',
  staging: 'Staging your FASTQ files on the analysis cluster…',
  running: 'Preparing the variant-calling pipeline…',
  trimming: 'Trimming and QC-checking raw reads…',
  aligning: 'Aligning reads to the reference genome…',
  calling: 'Calling variants…',
  finalizing: 'Finalizing your VCF…',
  complete: 'Pipeline complete — importing results…',
  failed: 'The pipeline did not complete successfully.',
};

const STAGE_GROUPS = [
  { id: 'queued', label: 'Queued', phases: ['queued'] },
  { id: 'staging', label: 'Staging', phases: ['staging'] },
  { id: 'aligning', label: 'Aligning', phases: ['running', 'trimming', 'aligning'] },
  { id: 'calling', label: 'Calling variants', phases: ['calling', 'finalizing'] },
  { id: 'complete', label: 'Complete', phases: ['complete'] },
];

export const MODULE1_STAGE_GROUPS = STAGE_GROUPS;

/** Collapses the 9 raw phases into the 5 macro-nodes shown on the stepper. */
export function getModule1StageGroup(phase) {
  const group = STAGE_GROUPS.find((g) => g.phases.includes(phase));
  return group?.id || 'queued';
}

export function getModule1PhaseMessage(phase, backendMessage) {
  return backendMessage || MODULE1_PHASE_MESSAGES[phase] || 'Processing…';
}
