/**
 * Module 1 (FASTQ pipeline) phase model. Kept separate from uploadProcessingPhases.js,
 * which is wired to the unrelated single-file VCF/TSV upload progress line.
 *
 * Real backend phase order includes `running` between `staging` and `trimming` — not
 * documented in the original handoff spec, but present in the deployed worker.
 */

export const MODULE1_PHASE_ORDER = [
  'queued',
  'waiting_gpu',
  'launching',
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
  waiting_gpu: 'Waiting for a GPU…',
  launching: 'Starting the GPU machine…',
  staging: 'Staging your FASTQ files on the analysis cluster…',
  running: 'Preparing the variant-calling pipeline…',
  trimming: 'Trimming and QC-checking raw reads…',
  aligning: 'Aligning reads to the reference genome…',
  calling: 'Calling variants…',
  finalizing: 'Finalizing your VCF…',
  complete: 'Pipeline complete — importing results…',
  failed: 'The pipeline did not complete successfully.',
  cancelling: 'Stopping…',
  cancelled: 'Cancelled',
};

const STAGE_GROUPS = [
  { id: 'queued', label: 'Queued', phases: ['queued', 'waiting_gpu'] },
  { id: 'staging', label: 'Staging', phases: ['launching', 'staging'] },
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

// Backend job text often describes infrastructure (GPU region, instances, S3, scripts,
// exceptions). None of that helps the user, so it is replaced with a plain message; text
// that is about their data (bad FASTQ, BED mismatch…) is still shown as-is.
const INFRA_DETAIL_RE =
  /\b(gpu|instance|home-region|us-[a-z]+-\d|capacity|ec2|ecs|run script|subprocess|traceback|errno|no detail|launcher)\b/i;

export const MODULE1_FAILED_FALLBACK =
  "The pipeline couldn't finish. Start over to try again — if it keeps failing, contact support.";

/**
 * User-facing failure text for a Module 1 job.
 *
 * `failure.message` is the backend's curated, user-safe text and is shown as-is. Without it we
 * fall back to the job `message`, masking anything that reads like infrastructure detail. The
 * admin-only `error` field is never read here, so raw job/exception text can't reach the UI.
 */
export function getModule1FailureMessage(job) {
  const curated = String(job?.failure?.message || '').trim();
  if (curated) return curated;
  const raw = String(job?.message || '').trim();
  if (!raw || INFRA_DETAIL_RE.test(raw)) return MODULE1_FAILED_FALLBACK;
  return raw;
}

export const MODULE1_INGEST_FAILED_FALLBACK =
  'The pipeline finished but importing the result failed. Contact support if this persists.';

/** User-facing text for a failed VCF import: the backend's curated `ingest_failure.message`. */
export function getModule1IngestFailureMessage(job) {
  const f = job?.ingestFailure;
  const curated = String((f && typeof f === 'object' ? f.message : f) || '').trim();
  return curated || MODULE1_INGEST_FAILED_FALLBACK;
}

export function getModule1PhaseMessage(phase, backendMessage) {
  return backendMessage || MODULE1_PHASE_MESSAGES[phase] || 'Processing…';
}

/** Pipeline + VCF ingest landed — don't leave the last node spinning forever. */
export function module1FinishedSuccessfully(job) {
  if (!job || job.status !== 'complete') return false;
  if (job.ingestStatus === 'done') return true;
  const msg = String(job.message || '');
  const pctOk = typeof job.progressPercent === 'number' && job.progressPercent >= 100;
  return pctOk && /(pass\s+)?vcf\s+ready/i.test(msg);
}

// Used only when the backend omits `terminal` (older deploys).
const LEGACY_TERMINAL_STATUSES = new Set(['complete', 'failed', 'cancelled']);

/**
 * Whether the backend says this job is finished (completed / failed / cancelled / cancelling).
 * Accepts the camelCase job built by useModule1Pipeline.
 */
export function module1JobIsTerminal(job) {
  if (!job) return false;
  if (typeof job.terminal === 'boolean') return job.terminal;
  return LEGACY_TERMINAL_STATUSES.has(job.status);
}

/** Complete, but the VCF import hasn't settled — the backend advances it on each status GET. */
export function module1IngestPending(job) {
  return Boolean(job) && job.status === 'complete' && job.ingestStatus !== 'done' && job.ingestStatus !== 'failed';
}

/**
 * Keep polling /api/module1/status? Stops once the job is terminal, except while a completed
 * job's VCF import is still pending (polling is what moves ingest forward).
 */
export function module1ShouldKeepPolling(job) {
  if (!job) return false;
  if (module1IngestPending(job)) return true;
  return !module1JobIsTerminal(job);
}

/** A terminal job that ended because the user stopped it ('cancelling' is terminal for the UI). */
export function module1JobWasCancelled(job) {
  if (!job) return false;
  if (job.status === 'cancelled') return true;
  return module1JobIsTerminal(job) && (job.status === 'cancelling' || job.phase === 'cancelling');
}
