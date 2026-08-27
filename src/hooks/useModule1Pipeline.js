import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as mongodbApi from '../services/mongodbApi';
import { buildVariantDataFromConversation } from '@/lib/variantPipelineUtils';
import { useAuth } from '@/hooks/useAuth';
import { actionGate } from '@/services/tierLimits';
import { describeLimitError, isEmailVerificationCode } from '@/services/limitErrors';
import {
  fetchModule1BedCatalog,
  fetchModule1Status,
  isAllowedModule1RoleFilename,
  module1ImportFromUrls,
  module1UrlErrorMessage,
  module1UrlPreflight,
  presignModule1Upload,
  putFileToPresignedUrl,
  runModule1Pipeline,
  validateModule1Bed,
} from '@/services/backendApi';

const NON_TERMINAL_STATUSES = new Set(['queued', 'running']);

function jobFromStatusPayload(data) {
  return {
    jobId: data.job_id ?? null,
    status: data.status ?? null,
    phase: data.phase ?? null,
    progressPercent: data.progress_percent ?? null,
    message: data.message ?? null,
    error: data.error ?? null,
    vcfS3Key: data.vcf_s3_key ?? null,
    genome: data.genome ?? null,
    sampleName: data.sample_name ?? null,
    ingestStatus: data.ingest_status ?? null,
  };
}

/**
 * Module 1 (FASTQ upload) pipeline: upload orchestration for R1/R2/BED, the long-running
 * status poll (queued -> ... -> complete, with ingest_status advancing only because the
 * status endpoint is polled), and the re-trigger into the existing column-interpretation
 * flow once the resulting VCF is ingested.
 */
export function useModule1Pipeline({
  userTier,
  activeConversationId,
  setColumnInterpretationResult,
  setVariantData,
  setCurrentDocument,
  presentFileAnalysisModal,
  syncPipelineFromConversationRef,
  syncAfterColumnInterpretation,
  setAnnovarMessageModal,
  onNeedsEmailVerification,
  onLimitBlocked,
}) {
  const { limits, refreshSubscriptionStatus } = useAuth();
  // Free stages and runs later; beta/pro run directly. Whichever path is open decides the form.
  // Memoized because these land in callback dependency arrays.
  const module1Gate = useMemo(() => actionGate(limits, 'module1'), [limits]);
  const module1StageGate = useMemo(() => actionGate(limits, 'module1Stage'), [limits]);
  const module1EntryGate = module1Gate.allowed ? module1Gate : module1StageGate;
  const [bedCatalog, setBedCatalog] = useState(null);
  const [bedCatalogLoading, setBedCatalogLoading] = useState(false);
  const [module1FormOpen, setModule1FormOpen] = useState(false);
  const [module1UploadProgress, setModule1UploadProgress] = useState({ r1: null, r2: null, bed: null });
  const [module1Submitting, setModule1Submitting] = useState(false);
  const [module1ImportStatus, setModule1ImportStatus] = useState(null);
  const [module1SubmitError, setModule1SubmitError] = useState(null);
  const [module1Job, setModule1Job] = useState(null);

  const ingestHandledRef = useRef(false);
  const pollAbortRef = useRef(null);

  const runIngestDoneSequence = useCallback(
    async (conversationId) => {
      const convData = await mongodbApi.getConversation(conversationId);
      if (!convData) return;
      if (convData.column_interpretation) setColumnInterpretationResult(convData.column_interpretation);
      if (convData.variant_metadata) {
        setVariantData(buildVariantDataFromConversation(convData, convData.variant_metadata));
      }
      if (convData.document) setCurrentDocument(convData.document);
      presentFileAnalysisModal(convData);
      syncPipelineFromConversationRef.current?.(convData);
      if (convData.column_interpretation) {
        await syncAfterColumnInterpretation(conversationId, convData.column_interpretation);
      }
    },
    [
      setColumnInterpretationResult,
      setVariantData,
      setCurrentDocument,
      presentFileAnalysisModal,
      syncPipelineFromConversationRef,
      syncAfterColumnInterpretation,
    ]
  );

  const stopPolling = useCallback(() => {
    if (pollAbortRef.current) pollAbortRef.current.aborted = true;
  }, []);

  // Self-rescheduling setTimeout loop (steady 20s, 30s backoff on error) — matches the
  // poll convention used everywhere else in this app (see useVariantPipeline.js).
  const pollModule1Status = useCallback(
    (conversationId) => {
      stopPolling();
      const abort = { aborted: false };
      pollAbortRef.current = abort;

      const tick = async (delayMs) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (abort.aborted) return;

        let data;
        try {
          data = await fetchModule1Status(conversationId);
        } catch (error) {
          console.warn('[useModule1Pipeline] status poll failed:', error);
          if (!abort.aborted) tick(30000);
          return;
        }
        if (abort.aborted) return;

        const nextJob = jobFromStatusPayload(data);
        setModule1Job((prev) => ({ ...prev, ...nextJob }));

        if (nextJob.status === 'failed') {
          setAnnovarMessageModal({
            title: 'Module 1 failed',
            message: nextJob.error || nextJob.message || 'The pipeline did not complete.',
            variant: 'error',
          });
          return;
        }

        const ingestResolved = nextJob.ingestStatus === 'done' || nextJob.ingestStatus === 'failed';
        if (nextJob.status === 'complete' && ingestResolved) {
          if (nextJob.ingestStatus === 'done' && !ingestHandledRef.current) {
            ingestHandledRef.current = true;
            try {
              await runIngestDoneSequence(conversationId);
            } catch (error) {
              console.warn('[useModule1Pipeline] post-ingest sync failed:', error);
            }
          } else if (nextJob.ingestStatus === 'failed') {
            setAnnovarMessageModal({
              title: 'Module 1 import failed',
              message: 'The pipeline finished but importing the result failed. Contact support if this persists.',
              variant: 'error',
            });
          }
          return;
        }

        // Critical: keep polling past status==="complete" while ingest_status is still
        // null/"running" — the backend only advances it as a side effect of this GET.
        tick(20000);
      };

      tick(20000);
    },
    [stopPolling, runIngestDoneSequence, setAnnovarMessageModal]
  );

  const pollModule1StatusRef = useRef(pollModule1Status);
  pollModule1StatusRef.current = pollModule1Status;

  const adoptJob = useCallback((jobId, conversationId, initial = {}) => {
    ingestHandledRef.current = false;
    setModule1Job({
      jobId,
      status: initial.status ?? 'queued',
      phase: initial.phase ?? 'queued',
      progressPercent: initial.progressPercent ?? null,
      message: initial.message ?? null,
      error: null,
      vcfS3Key: null,
      genome: initial.genome ?? null,
      sampleName: initial.sampleName ?? null,
      ingestStatus: null,
    });
    pollModule1StatusRef.current(conversationId);
  }, []);

  // Resume on mount / conversation switch — a job survives page reloads only if we
  // re-check /status and re-adopt it here.
  useEffect(() => {
    stopPolling();
    ingestHandledRef.current = false;
    setModule1Job(null);
    if (!activeConversationId || userTier === 'guest') return undefined;

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchModule1Status(activeConversationId);
        if (cancelled || !data?.status) return;
        const completeNotIngested =
          data.status === 'complete' && data.ingest_status !== 'done' && data.ingest_status !== 'failed';
        if (NON_TERMINAL_STATUSES.has(data.status) || completeNotIngested) {
          setModule1Job(jobFromStatusPayload(data));
          pollModule1StatusRef.current(activeConversationId);
        }
      } catch (error) {
        console.warn('[useModule1Pipeline] resume status check failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, userTier]);

  useEffect(() => stopPolling, [stopPolling]);

  const openModule1Form = useCallback(() => {
    if (userTier === 'guest') {
      toast.info('Sign up to upload raw sequencing data.');
      return;
    }
    // Don't let someone fill in a long form they cannot submit.
    if (!module1EntryGate.allowed) {
      onLimitBlocked?.({
        family: 'module1',
        title: 'Module 1 unavailable',
        message: module1EntryGate.reason,
        variant: 'info',
        cta: module1EntryGate.cta,
        refresh: false,
        blocking: false,
      });
      return;
    }
    setModule1SubmitError(null);
    setModule1UploadProgress({ r1: null, r2: null, bed: null });
    setModule1ImportStatus(null);
    setModule1FormOpen(true);
  }, [userTier, module1EntryGate, onLimitBlocked]);

  const closeModule1Form = useCallback(() => {
    setModule1FormOpen(false);
  }, []);

  const loadBedCatalog = useCallback(async (genome = 'hg38') => {
    setBedCatalogLoading(true);
    try {
      const data = await fetchModule1BedCatalog(genome);
      setBedCatalog(data);
    } catch (error) {
      console.warn('[useModule1Pipeline] bed catalog fetch failed:', error);
      setBedCatalog(null);
    } finally {
      setBedCatalogLoading(false);
    }
  }, []);

  const uploadModule1File = useCallback(async (role, file, conversationId) => {
    if (!isAllowedModule1RoleFilename(role, file.name)) {
      throw new Error(`"${file.name}" is not a valid ${role.toUpperCase()} file.`);
    }
    const presign = await presignModule1Upload({
      conversationId,
      role,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
    });
    await putFileToPresignedUrl({
      url: presign.url,
      method: presign.method,
      headers: presign.headers,
      file,
      onProgress: (pct) => setModule1UploadProgress((prev) => ({ ...prev, [role]: pct })),
    });
    return presign.s3_key;
  }, []);

  /** Validate one pasted R1/R2/BED URL and return the resolved file_url + file_name. */
  const preflightModule1Url = useCallback(
    async ({ role, fileUrl, fileName }) =>
      module1UrlPreflight({ conversationId: activeConversationId || undefined, role, fileUrl, fileName }),
    [activeConversationId]
  );

  /** Uploads a custom BED and validates it server-side; the returned s3Key is only usable in /run if validation.ok. */
  const uploadAndValidateCustomBed = useCallback(
    async (file, genome) => {
      if (!activeConversationId) throw new Error('Start or open a conversation first.');
      const s3Key = await uploadModule1File('bed', file, activeConversationId);
      const validation = await validateModule1Bed({ conversationId: activeConversationId, s3Key, genome });
      return { s3Key, validation };
    },
    [activeConversationId, uploadModule1File]
  );

  const startModule1Run = useCallback(
    async ({
      sampleName,
      genome,
      sequencingType,
      sourceMode = 'file',
      r1File,
      r2File,
      r1Url,
      r2Url,
      r1FileName,
      r2FileName,
      bedUrl,
      bedFileName,
      bedCatalogId,
      customBedS3Key,
    }) => {
      if (userTier === 'guest') {
        setModule1SubmitError('Please sign in to run Module 1.');
        return;
      }
      const conversationId = activeConversationId;
      if (!conversationId) {
        setModule1SubmitError('Start or open a conversation first.');
        return;
      }
      const bedFromUrl = sourceMode === 'url' && !!bedUrl;
      if (!bedCatalogId && !customBedS3Key && !bedFromUrl) {
        setModule1SubmitError('Choose a BED file (catalog or validated custom upload).');
        return;
      }

      setModule1Submitting(true);
      setModule1SubmitError(null);
      setModule1ImportStatus(null);
      try {
        let r1S3Key;
        let r2S3Key;
        let resolvedCustomBedS3Key = customBedS3Key;

        if (sourceMode === 'url') {
          // One request streams R1 + R2 (+ optional BED) server-side. Multi-GB FASTQs mean
          // this can sit here for many minutes with no byte-level progress available.
          setModule1ImportStatus('Importing files from URL… this can take several minutes.');
          const imported = await module1ImportFromUrls({
            conversationId,
            r1Url,
            r2Url,
            r1FileName,
            r2FileName,
            bedUrl,
            bedFileName,
          });
          r1S3Key = imported.r1_s3_key;
          r2S3Key = imported.r2_s3_key;
          if (imported.custom_bed_s3_key) {
            setModule1ImportStatus('Validating custom BED…');
            const validation = await validateModule1Bed({
              conversationId,
              s3Key: imported.custom_bed_s3_key,
              genome,
            });
            if (!validation.ok) {
              setModule1SubmitError(validation.message || 'Custom BED failed validation.');
              return;
            }
            resolvedCustomBedS3Key = imported.custom_bed_s3_key;
          }
          setModule1ImportStatus('Starting pipeline…');
        } else {
          r1S3Key = await uploadModule1File('r1', r1File, conversationId);
          r2S3Key = await uploadModule1File('r2', r2File, conversationId);
        }

        const result = await runModule1Pipeline({
          conversation_id: conversationId,
          sample_name: sampleName,
          genome,
          sequencing_type: sequencingType,
          r1_s3_key: r1S3Key,
          r2_s3_key: r2S3Key,
          ...(resolvedCustomBedS3Key
            ? { custom_bed_s3_key: resolvedCustomBedS3Key }
            : { bed_catalog_id: bedCatalogId }),
        });

        adoptJob(result.job_id, conversationId, {
          status: result.status,
          phase: result.phase,
          message: result.message,
        });
        setModule1FormOpen(false);
        refreshSubscriptionStatus?.();
      } catch (error) {
        if (error.status === 409 && error.code === 'MODULE1_JOB_IN_PROGRESS' && error.jobId) {
          adoptJob(error.jobId, conversationId, {});
          setModule1FormOpen(false);
          toast.info('A Module 1 job is already running for this conversation — resuming progress.');
          return;
        }

        // A quota 403 is not an auth problem. Taking over the page with the verification screen
        // (the old behaviour for every 403) reads to the user as "you got signed out".
        const limitError = (error.status === 403 || error.status === 400)
          ? describeLimitError(error, { context: 'module1', limits })
          : null;

        if (limitError) {
          setModule1FormOpen(false);
          setModule1SubmitError(null);
          onLimitBlocked?.(limitError);
          if (limitError.refresh) refreshSubscriptionStatus?.();
          return;
        }

        // Page takeover now requires positive evidence, rather than being the default for any 403.
        if (error.status === 403 && isEmailVerificationCode(error.code)) {
          setModule1FormOpen(false);
          onNeedsEmailVerification?.();
          return;
        }

        setModule1SubmitError(module1UrlErrorMessage(error, 'Failed to start Module 1 run.'));
      } finally {
        setModule1Submitting(false);
        setModule1ImportStatus(null);
      }
    },
    [
      userTier,
      activeConversationId,
      uploadModule1File,
      adoptJob,
      onNeedsEmailVerification,
      onLimitBlocked,
      limits,
      refreshSubscriptionStatus,
    ]
  );

  const module1JobActive =
    !!module1Job &&
    module1Job.status !== 'failed' &&
    !(module1Job.status === 'complete' && (module1Job.ingestStatus === 'done' || module1Job.ingestStatus === 'failed'));

  return {
    bedCatalog,
    bedCatalogLoading,
    loadBedCatalog,
    module1FormOpen,
    openModule1Form,
    closeModule1Form,
    module1UploadProgress,
    module1Submitting,
    module1SubmitError,
    module1ImportStatus,
    preflightModule1Url,
    uploadAndValidateCustomBed,
    startModule1Run,
    module1Job,
    module1JobActive,
    module1Gate,
    module1StageGate,
    module1EntryGate,
  };
}
