import { useState, useRef, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import * as mongodbApi from '../services/mongodbApi';
import { apiUrl } from '@/config/api';
import { apiErrorDetailToMessage, humanizeError } from '@/lib/humanizeError';
import {
  convertToVcf,
  fetchChatEligibility,
  mapProprietaryFilters,
} from '@/services/backendApi';
import {
  buildVariantDataFromConversation,
  formatAnnovarProgressMessage,
  normalizeChatEligibilityMessage,
} from '@/lib/variantPipelineUtils';

/**
 * Phase F variant pipeline: chat eligibility, ANNOVAR/ACMG async jobs, background polling.
 */
export function useVariantPipeline({
  userTier,
  userId,
  activeConversationId,
  currentDocument,
  columnInterpretationResult,
  setColumnInterpretationResult,
  setVariantData,
  conversationFilterState,
  setConversationFilterState,
  variantData,
  setShowInterpretationModal,
  interpretationDismissedRef,
  setIsAnnovarRecommended,
  setAnnovarMessageModal,
  setIsShowingAuthForm,
  setJustSignedUp,
  getDeviceId,
}) {
  // `allowed: null` means "not confirmed yet" — never assume chat is open before
  // /api/chat-eligibility has answered (Case A F2).
  const [chatEligibility, setChatEligibility] = useState({
    allowed: null,
    message: null,
    reason: null,
    requires_annovar: false,
    requires_filter: false,
    variants_under_consideration: null,
    enrichment_status: null,
    enrichment_phase: null,
    enrichment_message: null,
    enrichment_progress_percent: null,
    literature_status: null,
    advanced_chat_status: null,
  });
  const [pipelineSnapshot, setPipelineSnapshot] = useState({
    hasAnnotatedFile: false,
    vcfAnnotated: false,
    annovarJob: null,
    filterJob: null,
  });
  const [pipelineToast, setPipelineToast] = useState(null);
  const [isRunningAnnovar, setIsRunningAnnovar] = useState(false);
  const [isApplyingProprietaryFilter, setIsApplyingProprietaryFilter] = useState(false);
  // Exomiser eligibility is decided by GET /api/exomiser-eligibility — components fetch it directly.
  const [isRunningExomiser, setIsRunningExomiser] = useState(false);
  const [exomiserStatus, setExomiserStatus] = useState(null); // { status, phase, message, progress_percent, matched_count }
  const [uploadSessionConversationId, setUploadSessionConversationId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  const exomiserPollAbortRef = useRef(null);
  const prevAnnovarJobStatusRef = useRef(null);
  const prevFilterJobStatusRef = useRef(null);
  const prevChatAllowedRef = useRef(null);
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;
  const isRunningAnnovarRef = useRef(isRunningAnnovar);
  isRunningAnnovarRef.current = isRunningAnnovar;
  const isApplyingProprietaryFilterRef = useRef(isApplyingProprietaryFilter);
  isApplyingProprietaryFilterRef.current = isApplyingProprietaryFilter;

  const pipelineSnapshotRef = useRef(pipelineSnapshot);
  pipelineSnapshotRef.current = pipelineSnapshot;
  const uploadSessionConversationIdRef = useRef(uploadSessionConversationId);
  uploadSessionConversationIdRef.current = uploadSessionConversationId;
  const variantDataRef = useRef(variantData);
  variantDataRef.current = variantData;
  const refreshConversationAfterAnnovarRef = useRef(null);
  const refreshChatEligibilityFromApiRef = useRef(null);
  const presentFileAnalysisModalRef = useRef(null);
  const getDeviceIdRef = useRef(getDeviceId);
  getDeviceIdRef.current = getDeviceId;
  const setVariantDataRef = useRef(setVariantData);
  setVariantDataRef.current = setVariantData;
  const setAnnovarMessageModalRef = useRef(setAnnovarMessageModal);
  setAnnovarMessageModalRef.current = setAnnovarMessageModal;

  const defaultChatEligibility = useCallback(
    () => ({
      allowed: null,
      message: null,
      reason: null,
      requires_annovar: false,
      requires_filter: false,
      variants_under_consideration: null,
      s3_line_count_status: null,
      enrichment_status: null,
      enrichment_phase: null,
      enrichment_message: null,
      enrichment_progress_percent: null,
      literature_status: null,
      advanced_chat_status: null,
    }),
    []
  );

  const applyChatEligibilityFromConversation = useCallback(
    (convData, { announceReady = false } = {}) => {
      if (!convData) {
        setChatEligibility(defaultChatEligibility());
        prevChatAllowedRef.current = null;
        return;
      }

      const ce = convData.chat_eligibility;
      if (ce && typeof ce.allowed === 'boolean') {
        const allowed = ce.allowed;
        if (
          announceReady &&
          prevChatAllowedRef.current === false &&
          allowed &&
          currentDocumentRef.current &&
          !isRunningAnnovarRef.current &&
          !isApplyingProprietaryFilterRef.current
        ) {
          setPipelineToast({
            title: 'Chat ready',
            message:
              normalizeChatEligibilityMessage(ce.message) ||
              'Your variant set is ready — you can start chatting.',
            variant: 'success',
          });
        }
        prevChatAllowedRef.current = allowed;
        setChatEligibility({
          allowed,
          message: normalizeChatEligibilityMessage(ce.message) || null,
          reason: ce.reason || null,
          requires_annovar: !!ce.requires_annovar,
          requires_filter: !!ce.requires_filter,
          variants_under_consideration: ce.variants_under_consideration ?? null,
          s3_line_count_status: ce.s3_line_count_status || null,
          enrichment_status: ce.enrichment_status || null,
          enrichment_phase: ce.enrichment_phase || null,
          enrichment_message: ce.enrichment_message || null,
          enrichment_progress_percent: ce.enrichment_progress_percent ?? null,
          literature_status: ce.literature_status || null,
          advanced_chat_status: ce.advanced_chat_status || null,
        });
      } else {
        setChatEligibility(defaultChatEligibility());
        prevChatAllowedRef.current = null;
      }
    },
    [defaultChatEligibility, normalizeChatEligibilityMessage]
  );

  const refreshChatEligibilityFromApi = useCallback(
    async (conversationId, { announceReady = false, convFallback = null } = {}) => {
      if (!conversationId || userTier === 'guest') {
        if (convFallback) applyChatEligibilityFromConversation(convFallback, { announceReady });
        return null;
      }

      try {
        const data = await fetchChatEligibility(conversationId);
        const allowed = !!data.allowed;
        if (
          announceReady &&
          prevChatAllowedRef.current === false &&
          allowed &&
          currentDocumentRef.current &&
          !isRunningAnnovarRef.current &&
          !isApplyingProprietaryFilterRef.current
        ) {
          setPipelineToast({
            title: 'Chat ready',
            message:
              normalizeChatEligibilityMessage(data.message) ||
              'Your variant set is ready — you can start chatting.',
            variant: 'success',
          });
        }
        prevChatAllowedRef.current = allowed;
        setChatEligibility({
          allowed,
          message: normalizeChatEligibilityMessage(data.message) || null,
          reason: data.reason || null,
          requires_annovar: !!data.requires_annovar,
          requires_filter: !!data.requires_filter,
          variants_under_consideration: data.variants_under_consideration ?? null,
          s3_line_count_status: data.s3_line_count_status || null,
          enrichment_status: data.enrichment_status || null,
          enrichment_phase: data.enrichment_phase || null,
          enrichment_message: data.enrichment_message || null,
          enrichment_progress_percent: data.enrichment_progress_percent ?? null,
          literature_status: data.literature_status || null,
          advanced_chat_status: data.advanced_chat_status || null,
        });
        return data;
      } catch (error) {
        console.warn('[useVariantPipeline] chat-eligibility fetch failed:', error);
        if (convFallback) {
          applyChatEligibilityFromConversation(convFallback, { announceReady });
        } else {
          // Don't keep a stale `allowed: true` on a failed refresh — fall back to unknown (F8).
          setChatEligibility((prev) => ({
            ...prev,
            allowed: null,
            message: "Couldn't confirm whether your variant set is ready for chat. Retrying…",
          }));
          prevChatAllowedRef.current = null;
        }
        return null;
      }
    },
    [userTier, applyChatEligibilityFromConversation, normalizeChatEligibilityMessage]
  );

  const remapProprietaryFiltersForConversation = useCallback(
    async (conversationId, columnInterpretation) => {
      if (!conversationId || userTier === 'guest' || !columnInterpretation) return null;
      try {
        return await mapProprietaryFilters(conversationId, columnInterpretation);
      } catch (error) {
        console.warn('[useVariantPipeline] map-proprietary-filters failed:', error);
        return null;
      }
    },
    [userTier]
  );

  const refreshConversationAfterAnnovar = useCallback(async (conversationIdForAnnovar) => {
    const convData = await mongodbApi.getConversation(conversationIdForAnnovar);
    if (!convData) return null;
    if (convData.column_interpretation) setColumnInterpretationResult(convData.column_interpretation);
    if (convData.variant_metadata) {
      setVariantData(buildVariantDataFromConversation(convData, convData.variant_metadata));
    }
    setConversationFilterState({
      activeVariantFilters: convData.active_variant_filters ?? null,
      filteredVariantCount: convData.filtered_variant_count ?? null,
      activeProprietaryFilter: convData.active_proprietary_filter ?? null,
      filterWorkingSetCount: convData.variant_filter_working_set_count ?? null,
    });
    setPipelineSnapshot({
      hasAnnotatedFile: Boolean(convData.annotated_file_s3_key),
      vcfAnnotated: Boolean(convData.vcf_annotated),
      annovarJob: convData.annovar_job || null,
      filterJob: convData.filter_job || null,
    });
    prevAnnovarJobStatusRef.current = convData.annovar_job?.status || null;
    prevFilterJobStatusRef.current = convData.filter_job?.status || null;
    applyChatEligibilityFromConversation(convData);
    await refreshChatEligibilityFromApi(conversationIdForAnnovar, { convFallback: convData });
    return convData;
  }, [
    setColumnInterpretationResult,
    setVariantData,
    setConversationFilterState,
    applyChatEligibilityFromConversation,
    refreshChatEligibilityFromApi,
  ]);

  /**
   * Post-filter-change resync (apply / remove / clear). Refreshes the conversation and
   * eligibility, and honours `enrichment_will_requeue` from POST /api/remove-proprietary-filter.
   *
   * When true (≤1000 restores), seed ENRICHMENT_PENDING so the "Enriching…" UI and the 4s
   * eligibility poll start immediately instead of one tick late. When false (>1000), the
   * backend will not re-queue enrichment, so we must NOT wait for it — eligibility should
   * land back on CHAT_REQUIRES_FILTER (Case B B-FE2).
   *
   * Note POST /api/filter-variants with `filters: {}` does not return this field at all, so
   * the manual-clear path passes nothing and lets eligibility alone decide (B-FE3).
   */
  const refreshAfterFilterChange = useCallback(
    async (conversationId, { enrichmentWillRequeue } = {}) => {
      if (!conversationId) return null;
      if (enrichmentWillRequeue) {
        setChatEligibility((prev) => ({
          ...prev,
          allowed: null,
          reason: 'ENRICHMENT_PENDING',
          enrichment_status: 'pending',
        }));
      }
      return refreshConversationAfterAnnovar(conversationId);
    },
    [refreshConversationAfterAnnovar]
  );

  const presentFileAnalysisModal = useCallback(
    (convData) => {
      // console.log('[presentFileAnalysisModal] called', {
      //   hasColumnInterp: !!convData?.column_interpretation,
      //   uploadSessionConversationId: uploadSessionConversationIdRef.current,
      //   currentDocument: !!currentDocument,
      // });
      if (!convData?.column_interpretation) return;
      const hasDoc =
        currentDocument || (convData.document?.s3_url && convData.document?.file_name);
      if (!hasDoc) return;

      // If an upload is still in progress, wait for it to finish before opening
      if (uploadSessionConversationIdRef.current) {
        // console.log('[presentFileAnalysisModal] upload in progress, deferring 500ms');
        setTimeout(() => {
          if (!uploadSessionConversationIdRef.current) {
            // console.log('[presentFileAnalysisModal] upload finished, opening modal now');
            interpretationDismissedRef.current = false;
            setShowInterpretationModal(true);
          } else {
            // console.log('[presentFileAnalysisModal] upload still in progress, deferring again');
            // Keep retrying until upload finishes
            const checkInterval = setInterval(() => {
              if (!uploadSessionConversationIdRef.current) {
                clearInterval(checkInterval);
                // console.log('[presentFileAnalysisModal] upload finished (retry), opening modal');
                interpretationDismissedRef.current = false;
                setShowInterpretationModal(true);
              }
            }, 300);
            // Safety: stop checking after 30s
            setTimeout(() => clearInterval(checkInterval), 30000);
          }
        }, 500);
        return;
      }

      interpretationDismissedRef.current = false;
      setShowInterpretationModal(true);
    },
    [currentDocument, interpretationDismissedRef, setShowInterpretationModal]
  );

  // Assign refs after the callbacks are declared (avoids temporal dead zone)
  refreshConversationAfterAnnovarRef.current = refreshConversationAfterAnnovar;
  refreshChatEligibilityFromApiRef.current = refreshChatEligibilityFromApi;
  presentFileAnalysisModalRef.current = presentFileAnalysisModal;

  const convertTabularToVcfForConversation = useCallback(
    async (referenceGenome = 'hg38') => {
      if (!activeConversationId || userTier === 'guest') {
        throw new Error('Sign in and upload a file to convert to VCF.');
      }
      setAnnovarMessageModal({
        title: 'Converting to VCF',
        message: 'Converting your tabular variant file to VCF format…',
        variant: 'info',
      });
      try {
        const result = await convertToVcf(activeConversationId, referenceGenome);
        const convAfter = await refreshConversationAfterAnnovar(activeConversationId);
        if (convAfter) presentFileAnalysisModal(convAfter);
        setAnnovarMessageModal({
          title: 'Converted to VCF',
          message: result.message || 'Your file is now available as VCF.',
          variant: 'success',
        });
        return result;
      } catch (error) {
        setAnnovarMessageModal({
          title: 'VCF conversion failed',
          message: humanizeError(error.message) || 'Could not convert file to VCF.',
          variant: 'error',
        });
        throw error;
      }
    },
    [
      activeConversationId,
      userTier,
      refreshConversationAfterAnnovar,
      presentFileAnalysisModal,
      setAnnovarMessageModal,
    ]
  );

  useEffect(() => {
    if (!currentDocument || !activeConversationId || userTier === 'guest') {
      setChatEligibility(defaultChatEligibility());
    }
  }, [activeConversationId, currentDocument, userTier, defaultChatEligibility]);

  useEffect(() => {
    if (!activeConversationId || !currentDocument || userTier === 'guest') {
      return undefined;
    }

    let cancelled = false;
    let timerId = null;

    const pollBackgroundPipelineJobs = async () => {
      if (cancelled) return;

      // Check whether there is any active work to poll for. We read from refs
      // so this check never causes the effect to restart. If nothing is active,
      // the loop simply stops scheduling itself.
      const snap = pipelineSnapshotRef.current;
      const vd = variantDataRef.current;
      const uploadConvId = uploadSessionConversationIdRef.current;
      const lineCountActive =
        vd?.s3_line_count_status === 'pending' || vd?.s3_line_count_status === 'running';
      const pipelineWorkActive =
        isRunningAnnovarRef.current ||
        isApplyingProprietaryFilterRef.current ||
        snap.annovarJob?.status === 'running' ||
        snap.filterJob?.status === 'running' ||
        snap.filterJob?.status === 'pending' ||
        uploadConvId === activeConversationId ||
        lineCountActive;

      if (!pipelineWorkActive) return;

      try {
        const auth = getAuth();
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (!token) return;

        const convData = await mongodbApi.getConversation(activeConversationId);
        if (cancelled || !convData) return;

        const lineStatus = convData.s3_line_count_status;
        if (lineStatus === 'pending' || lineStatus === 'running' || lineStatus === 'completed') {
          if (convData.variant_metadata) {
            setVariantDataRef.current(buildVariantDataFromConversation(convData, convData.variant_metadata));
          }
          if (lineStatus === 'completed') {
            await refreshChatEligibilityFromApiRef.current(activeConversationId, {
              announceReady: true,
              convFallback: convData,
            });
          }
        }

        // Use refs (always current) to decide whether to poll the status endpoint.
        // This avoids missing a poll tick when MongoDB hasn't caught up yet or when
        // the effect restarts fresh (e.g. page reload mid-job).
        const annShouldPoll =
          isRunningAnnovarRef.current ||
          prevAnnovarJobStatusRef.current === 'running' ||
          convData.annovar_job?.status === 'running';

        let annJob = { ...(convData.annovar_job || {}) };
        let filtJob = { ...(convData.filter_job || {}) };
        const filtRunning = filtJob.status === 'running' || filtJob.status === 'pending';

        if (annShouldPoll) {
          const statusRes = await fetch(apiUrl(`/api/annovar-status/${activeConversationId}`), {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Device-Id': getDeviceIdRef.current(),
            },
          });
          if (cancelled) return;
          if (statusRes.ok) {
            const statusData = await statusRes.json().catch(() => ({}));
            // Status endpoint is authoritative — it merges S3 worker progress on top of MongoDB.
            annJob = { ...annJob, ...(statusData.annovar_job || {}) };
            if (statusData.status) annJob.status = statusData.status;
            if (statusData.phase) annJob.phase = statusData.phase;
            if (statusData.message) annJob.message = statusData.message;
            if (statusData.progress_percent != null) annJob.progress_percent = statusData.progress_percent;
          }
        }

        if (filtRunning) {
          const statusRes = await fetch(apiUrl(`/api/filter-status/${activeConversationId}`), {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Device-Id': getDeviceIdRef.current(),
            },
          });
          if (statusRes.ok) {
            const statusData = await statusRes.json().catch(() => ({}));
            filtJob = { ...filtJob, ...(statusData.filter_job || {}) };
            if (statusData.status) filtJob.status = statusData.status;
          }
        }

        if (cancelled) return;

        setPipelineSnapshot({
          hasAnnotatedFile: Boolean(convData.annotated_file_s3_key) || annJob.status === 'completed',
          vcfAnnotated: Boolean(convData.vcf_annotated),
          annovarJob: annJob.status ? annJob : null,
          filterJob: filtJob.status ? filtJob : null,
        });

        const annActive = annJob.status === 'running';
        const filtActive = filtJob.status === 'running' || filtJob.status === 'pending';
        if (annActive) setIsRunningAnnovar(true);
        else if (annJob.status === 'completed' || annJob.status === 'failed') setIsRunningAnnovar(false);
        if (filtActive) setIsApplyingProprietaryFilter(true);
        else if (filtJob.status === 'completed' || filtJob.status === 'failed') {
          setIsApplyingProprietaryFilter(false);
        }

        setAnnovarMessageModalRef.current((prev) => {
          if (!annActive || !prev || prev.variant !== 'info') return prev;
          const pct = annJob.progress_percent;
          const msg = formatAnnovarProgressMessage(annJob.message || 'Annotating your variants…');
          return {
            ...prev,
            message: msg,
            progressPercent: typeof pct === 'number' ? pct : prev.progressPercent,
          };
        });

        const prevAnn = prevAnnovarJobStatusRef.current;
        const prevFilt = prevFilterJobStatusRef.current;

        if (prevAnn === 'running' && annJob.status === 'completed') {
          const convAfterAnn = await refreshConversationAfterAnnovarRef.current(activeConversationId);
          if (convAfterAnn) presentFileAnalysisModalRef.current(convAfterAnn);
          setPipelineToast({
            title: 'ANNOVAR complete',
            message:
              formatAnnovarProgressMessage(annJob.message) ||
              'Annotation finished. Review your file analysis, then reduce variants for chat.',
            variant: 'success',
          });
        } else if (prevAnn === 'running' && annJob.status === 'failed') {
          setPipelineToast({
            title: 'ANNOVAR failed',
            message:
              annJob.message || annJob.error || 'Annotation did not complete. Try again or contact support.',
            variant: 'error',
          });
        }
        if (prevFilt === 'running' && filtJob.status === 'completed') {
          await refreshConversationAfterAnnovarRef.current(activeConversationId);
          setPipelineToast({
            title: 'Variant prioritization complete',
            message:
              filtJob.message ||
              `${(filtJob.filtered_count ?? filtJob.rows_kept ?? 0).toLocaleString()} variants prioritized for chat.`,
            variant: 'success',
          });
        } else if (prevFilt === 'running' && filtJob.status === 'failed') {
          setPipelineToast({
            title: 'Variant prioritization failed',
            message:
              filtJob.message || filtJob.error || 'Prioritization did not complete.',
            variant: 'error',
          });
        }

        prevAnnovarJobStatusRef.current = annJob.status || null;
        prevFilterJobStatusRef.current = filtJob.status || null;

        const lineStill = lineStatus === 'pending' || lineStatus === 'running';
        const annStill = annJob.status === 'running';
        const filtStill = filtJob.status === 'running' || filtJob.status === 'pending';
        const uploadStill = uploadSessionConversationIdRef.current === activeConversationId;

        if (!cancelled && (annStill || filtStill || lineStill || uploadStill)) {
          const delayMs = lineStill && !annStill && !filtStill && !uploadStill ? 15000 : 8000;
          timerId = setTimeout(pollBackgroundPipelineJobs, delayMs);
        }
      } catch (e) {
        console.warn('[useVariantPipeline] background pipeline poll failed:', e);
        if (!cancelled) {
          timerId = setTimeout(pollBackgroundPipelineJobs, 12000);
        }
      }
    };

    pollBackgroundPipelineJobs();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
    // Minimal deps: only values that should re-arm the poll loop from scratch.
    // - activeConversationId / currentDocument / userTier: conversation switched or user state changed
    // - isRunningAnnovar / isApplyingProprietaryFilter: a job was *just* kicked off and the loop may have
    //   already exited (pipelineWorkActive was false at the last tick); re-entry restarts it.
    //
    // Intentionally excluded (all read via refs instead):
    //   pipelineSnapshot.annovarJob?.status, pipelineSnapshot.filterJob?.status,
    //   uploadSessionConversationId, variantData?.s3_line_count_status,
    //   refreshConversationAfterAnnovar, refreshChatEligibilityFromApi,
    //   presentFileAnalysisModal, getDeviceId, setVariantData, setAnnovarMessageModal
    //
    // Those were previously causing the effect to restart on every setPipelineSnapshot
    // call inside the loop, producing a duplicate poll tick each cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, currentDocument, userTier, isRunningAnnovar, isApplyingProprietaryFilter]);

  const handleVariantUploadingChange = useCallback(
    (isUploading) => {
      // console.log('[useVariantPipeline] handleVariantUploadingChange:', isUploading);
      if (isUploading) {
        setUploadSessionConversationId((prev) => prev || activeConversationId || null);
      } else {
        // console.log('[useVariantPipeline] clearing uploadSessionConversationId');
        setUploadSessionConversationId(null);
        setUploadProgress(null);
      }
    },
    [activeConversationId]
  );

  const handleUploadProgressChange = useCallback((progress) => {
    setUploadProgress(progress);
  }, []);

  const pipelineJobActive =
    isRunningAnnovar ||
    isApplyingProprietaryFilter ||
    pipelineSnapshot.annovarJob?.status === 'running' ||
    pipelineSnapshot.filterJob?.status === 'running' ||
    pipelineSnapshot.filterJob?.status === 'pending';

  const variantUploadInProgress =
    Boolean(uploadSessionConversationId) && uploadSessionConversationId === activeConversationId;

  // Unknown (`null`) gates just like an explicit `false`: only a real `allowed: true`
  // from /api/chat-eligibility opens chat (F2/F8).
  const isChatPipelineGated =
    userTier !== 'guest' &&
    !!currentDocument &&
    !!activeConversationId &&
    chatEligibility.allowed !== true;

  /**
   * Optimistic gate on the start of any pipeline mutation (ANNOVAR, ACMG, Exomiser,
   * manual apply/reset, remove). Flipping eligibility back to unknown disables chat and
   * download immediately and holds until a real eligibility response lands (F3).
   */
  const beginPipelineWork = useCallback(() => {
    setChatEligibility((prev) => ({ ...prev, allowed: null, reason: null }));
  }, []);

  // Derived view of the (fully automatic, backend-driven) variant enrichment gate.
  // Enrichment has no dedicated endpoint — its state is surfaced only via /api/chat-eligibility.
  const enrichmentState = (() => {
    const reason = chatEligibility.reason;
    const running = reason === 'ENRICHMENT_RUNNING';
    const pending = reason === 'ENRICHMENT_PENDING';
    const failed = reason === 'ENRICHMENT_FAILED';
    const active = running || pending;
    return {
      active,
      running,
      pending,
      failed,
      status:
        chatEligibility.enrichment_status ||
        (failed ? 'failed' : running ? 'running' : pending ? 'pending' : null),
      phase: chatEligibility.enrichment_phase || null,
      message: chatEligibility.enrichment_message || (active || failed ? chatEligibility.message : null),
      progress: chatEligibility.enrichment_progress_percent ?? null,
      literatureStatus: chatEligibility.literature_status || null,
    };
  })();

  const indexingState = (() => {
    const reason = chatEligibility.reason;
    const isIndexing = reason === 'ADVANCED_CHAT_INDEXING';
    const acs = chatEligibility.advanced_chat_status;
    const active = isIndexing && acs !== 'ready' && acs !== 'failed';
    const failed = isIndexing && acs === 'failed';
    return {
      active,
      failed,
      status: acs || null,
      message: isIndexing ? (chatEligibility.message || 'Indexing variants for chat…') : null,
    };
  })();

  /** Single busy flag shared by the pipeline stepper and the sidebar so dual applies can't race (F6). */
  const pipelineBusy =
    isRunningAnnovar || isApplyingProprietaryFilter || isRunningExomiser || pipelineJobActive;

  /**
   * Whether the *final* export is ready. Deliberately independent of chat gating:
   * CHAT_REQUIRES_FILTER still permits downloading the full annotated baseline on
   * >1000 files (Case B B-FE1). Only in-flight work blocks download (F4).
   */
  const downloadGate = (() => {
    if (enrichmentState.active) {
      return {
        blocked: true,
        kind: 'enriching',
        message: enrichmentState.message || 'Enriching variants for chat…',
        progress: enrichmentState.progress,
      };
    }
    if (indexingState.active) {
      return { blocked: true, kind: 'busy', message: indexingState.message };
    }
    if (chatEligibility.reason === 'FILTER_JOB_RUNNING' || pipelineBusy) {
      return { blocked: true, kind: 'busy', message: chatEligibility.message };
    }
    if (chatEligibility.allowed === null) {
      return { blocked: true, kind: 'unknown', message: chatEligibility.message };
    }
    return {
      blocked: false,
      annotatedOnly: chatEligibility.reason === 'CHAT_REQUIRES_FILTER',
      message: chatEligibility.message,
    };
  })();

  const enrichmentActive = enrichmentState.active;
  const indexingActive = indexingState.active;
  useEffect(() => {
    if ((!enrichmentActive && !indexingActive) || !activeConversationId || userTier === 'guest') return;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      if (cancelled) return;
      try {
        await refreshChatEligibilityFromApiRef.current?.(activeConversationId, { announceReady: true });
      } catch (e) {
        console.warn('[useVariantPipeline] eligibility poll failed:', e);
      }
      if (!cancelled) timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enrichmentActive, indexingActive, activeConversationId, userTier]);

  const promptChatBlocked = useCallback(() => {
    if (!isChatPipelineGated) return false;
    if (enrichmentState.failed) {
      setAnnovarMessageModal({
        title: 'Enrichment failed',
        message:
          enrichmentState.message ||
          'Variant enrichment failed. Reset your filters and apply them again to retry.',
        variant: 'error',
      });
      return true;
    }
    if (enrichmentState.active) {
      setAnnovarMessageModal({
        title: 'Enriching your variants',
        message:
          enrichmentState.message ||
          'Enriching your variants with ClinGen, OMIM, CIViC, OncoKB, and literature data. Chat will unlock automatically when this finishes.',
        variant: 'info',
      });
      return true;
    }
    if (indexingState.failed) {
      setAnnovarMessageModal({
        title: 'Indexing failed',
        message: indexingState.message || 'Variant indexing failed. Try applying filters again to retry.',
        variant: 'error',
      });
      return true;
    }
    if (indexingState.active) {
      setAnnovarMessageModal({
        title: 'Indexing variants for chat',
        message: indexingState.message || 'Building the search index for your variants. Chat will unlock automatically when this finishes.',
        variant: 'info',
      });
      return true;
    }
    setAnnovarMessageModal({
      title: 'Chat not available',
      message:
        chatEligibility.message ||
        'Reduce your variant set to 1,000 rows or fewer using filters, then try again.',
      variant: 'warning',
    });
    return true;
  }, [isChatPipelineGated, enrichmentState.failed, enrichmentState.active, enrichmentState.message, indexingState.failed, indexingState.active, indexingState.message, chatEligibility.message, setAnnovarMessageModal]);

  const runAnnovarForCurrentConversation = useCallback(async () => {
    if (userTier === 'guest') {
      setAnnovarMessageModal({
        title: 'Sign up to run ANNOVAR',
        message:
          'ANNOVAR is available for signed-in users. Create an account to run annotation and unlock full analysis.',
        variant: 'info',
        ctaLabel: 'Sign Up / Log In',
        onCta: () => {
          setAnnovarMessageModal(null);
          setIsShowingAuthForm(true);
          setJustSignedUp(false);
        },
      });
      return;
    }

    if (!activeConversationId || !currentDocument) {
      setAnnovarMessageModal({ title: 'No file', message: 'Please upload a file first.', variant: 'info' });
      return;
    }
    if (isRunningAnnovar) return;
    if (pipelineSnapshot.hasAnnotatedFile) {
      setAnnovarMessageModal({ title: 'Already annotated', message: 'ANNOVAR has already been run on this file. Edit sample metadata to re-run annotation.', variant: 'info' });
      return;
    }
    if (pipelineSnapshot.vcfAnnotated) {
      setAnnovarMessageModal({
        title: 'File already annotated',
        message: 'Your uploaded VCF already contains ANNOVAR annotations. Running ANNOVAR again is not needed.',
        variant: 'info',
      });
      return;
    }

    let annovarStartedAsync = false;
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        setAnnovarMessageModal({
          title: 'Sign in required',
          message: 'Please log in to run ANNOVAR annotation.',
          variant: 'info',
        });
        return;
      }

      const fileType = (currentDocument.file_type ?? currentDocument.type)?.toLowerCase() || '';
      const fileName = (currentDocument.file_name ?? currentDocument.name ?? '').toLowerCase();
      const isSupported =
        fileType === 'tsv' ||
        fileType === 'csv' ||
        fileType === 'vcf' ||
        fileName.endsWith('.tsv') ||
        fileName.endsWith('.csv') ||
        fileName.endsWith('.vcf') ||
        fileName.endsWith('.vcf.gz');
      if (!isSupported) {
        setAnnovarMessageModal({
          title: 'Unsupported file type',
          message: 'Please upload a TSV, CSV, or VCF file.',
          variant: 'error',
        });
        return;
      }

      beginPipelineWork();
      setIsRunningAnnovar(true);
      prevAnnovarJobStatusRef.current = 'running';
      interpretationDismissedRef.current = true;
      setShowInterpretationModal(false);

      const runResponse = await fetch(apiUrl('/api/run-annovar'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({ conversation_id: activeConversationId }),
      });

      if (!runResponse.ok && runResponse.status !== 202) {
        const errBody = await runResponse.json().catch(() => ({}));
        const detail = errBody.detail || errBody.error || runResponse.statusText || 'Annotation failed';
        const code = typeof detail === 'object' ? detail.code : null;
        const msg = typeof detail === 'object' ? detail.message : detail;
        if (code === 'FREE_TIER_LIMIT_REACHED') {
          setAnnovarMessageModal({
            title: 'ANNOVAR Limit Reached',
            message: msg,
            variant: 'info',
            ctaLabel: 'Upgrade to Pro',
            onCta: () => setAnnovarMessageModal(null),
          });
        } else {
          setAnnovarMessageModal({
            title: 'Annotation failed',
            message: typeof msg === 'string' ? msg : JSON.stringify(detail),
            variant: 'error',
          });
        }
        return;
      }

      if (runResponse.status === 202) {
        annovarStartedAsync = true;
        await runResponse.json().catch(() => ({}));
        setAnnovarMessageModal(null);
        setPipelineToast({
          title: 'ANNOVAR started',
          message:
            'Annotation is running in the background. Watch the pipeline bar at the top — you can keep using chat.',
          variant: 'success',
        });
      } else {
        const runResult = await runResponse.json();
        const successMessage =
          runResult.message ||
          (runResult.variant_count != null
            ? `${runResult.variant_count} variants annotated and stored.`
            : 'Annotation complete.');
        const convAfterAnn = await refreshConversationAfterAnnovar(activeConversationId);
        if (convAfterAnn) presentFileAnalysisModal(convAfterAnn);
        setAnnovarMessageModal({ title: 'Annotation complete', message: successMessage, variant: 'success' });
        setIsAnnovarRecommended(false);
      }
    } catch (error) {
      console.error('[useVariantPipeline] Run ANNOVAR error:', error);
      setAnnovarMessageModal({
        title: 'Error',
        message: humanizeError(error.message) || 'Annotation failed. Please try again.',
        variant: 'error',
      });
      // beginPipelineWork() parked eligibility at "unknown"; resolve it so a failed start
      // doesn't leave chat gated forever.
      await refreshChatEligibilityFromApi(activeConversationId);
    } finally {
      if (!annovarStartedAsync) {
        setIsRunningAnnovar(false);
      }
    }
  }, [
    activeConversationId,
    currentDocument,
    isRunningAnnovar,
    userTier,
    beginPipelineWork,
    refreshChatEligibilityFromApi,
    refreshConversationAfterAnnovar,
    presentFileAnalysisModal,
    interpretationDismissedRef,
    setShowInterpretationModal,
    setIsAnnovarRecommended,
    setAnnovarMessageModal,
    setIsShowingAuthForm,
    setJustSignedUp,
    getDeviceId,
  ]);

  const FILTER_DISPLAY_NAMES = {
    filter_1: 'ACMG filter',
    filter_3: 'Exomiser',
  };

  const runProprietaryFilter = useCallback(async (filterType) => {
    const displayName = FILTER_DISPLAY_NAMES[filterType] || 'Proprietary filter';

    if (userTier === 'guest') {
      setAnnovarMessageModal({
        title: `Sign up to apply ${displayName}`,
        message: `The ${displayName} is available for signed-in users. Create an account to prioritize variants for chat.`,
        variant: 'info',
        ctaLabel: 'Sign Up / Log In',
        onCta: () => {
          setAnnovarMessageModal(null);
          setIsShowingAuthForm(true);
          setJustSignedUp(false);
        },
      });
      return;
    }

    if (!activeConversationId || !currentDocument) {
      setAnnovarMessageModal({ title: 'No file', message: 'Please upload a file first.', variant: 'info' });
      return;
    }
    if (isApplyingProprietaryFilter) return;

    // Gate check: filter_1 needs CLNSIG/InterVar; filter_2 needs its own columns
    if (filterType === 'filter_1') {
      const step2 = columnInterpretationResult?.step2;
      const step2Req = step2?.required_columns || {};
      const step2Ready = Boolean(step2Req.CLNSIG?.found || step2Req.InterVar_automated?.found);
      if (!step2Ready && chatEligibility.requires_annovar) {
        setAnnovarMessageModal({
          title: 'Run ANNOVAR first',
          message:
            'The ACMG filter needs ClinVar or InterVar annotations and population frequency from ANNOVAR. Run ANNOVAR, then apply the ACMG filter.',
          variant: 'info',
        });
        return;
      }
    }
    let filterStartedAsync = false;
    beginPipelineWork();
    setIsApplyingProprietaryFilter(true);
    prevFilterJobStatusRef.current = 'running';
    // NOTE: Do NOT dismiss the File Analysis (interpretation) modal here.
    // A rejected apply (e.g. backend refuses filter_2 as "not available") used to
    // leave the user stranded with the modal closed and no way to choose another
    // filter. We only dismiss on success below.

    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Authentication required');

      const res = await fetch(apiUrl('/api/apply-proprietary-filter'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({ conversation_id: activeConversationId, filter_type: filterType }),
      });

      if (!res.ok && res.status !== 202) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorDetailToMessage(err.detail) || `Failed to apply ${displayName}`);
      }

      if (res.status === 202) {
        filterStartedAsync = true;
        await res.json().catch(() => ({}));
        interpretationDismissedRef.current = true;
        setShowInterpretationModal(false);
        setAnnovarMessageModal(null);
        setPipelineToast({
          title: `${displayName} started`,
          message: 'Prioritization is running in the background. Watch the pipeline bar at the top.',
          variant: 'success',
        });
      } else {
        const data = await res.json();
        const filteredCount = data.filtered_count ?? 0;
        interpretationDismissedRef.current = true;
        setShowInterpretationModal(false);
        await refreshConversationAfterAnnovar(activeConversationId);
        setConversationFilterState((prev) => ({
          ...prev,
          activeProprietaryFilter: filterType,
          filteredVariantCount: filteredCount ?? prev.filteredVariantCount,
          filterWorkingSetCount: filteredCount ?? prev.filterWorkingSetCount,
        }));
        setAnnovarMessageModal({
          title: `${displayName} applied`,
          message: `${filteredCount ?? 0} variants prioritized for chat.`,
          variant: 'success',
        });
      }
    } catch (error) {
      console.error(`[useVariantPipeline] Apply ${filterType} error:`, error);
      setAnnovarMessageModal({
        title: displayName,
        message:
          humanizeError(error.message) ||
          `Failed to apply ${displayName}. Run ANNOVAR first if your file is not annotated yet.`,
        variant: 'error',
      });
      // Resolve the optimistic "unknown" state set by beginPipelineWork().
      await refreshChatEligibilityFromApi(activeConversationId);
    } finally {
      if (!filterStartedAsync) {
        setIsApplyingProprietaryFilter(false);
      }
    }
  }, [
    activeConversationId,
    currentDocument,
    isApplyingProprietaryFilter,
    userTier,
    columnInterpretationResult,
    chatEligibility.requires_annovar,
    beginPipelineWork,
    refreshChatEligibilityFromApi,
    refreshConversationAfterAnnovar,
    interpretationDismissedRef,
    setShowInterpretationModal,
    setConversationFilterState,
    setAnnovarMessageModal,
    setIsShowingAuthForm,
    setJustSignedUp,
    getDeviceId,
  ]);

  const step2ReqGate = columnInterpretationResult?.step2?.required_columns || {};
  const step2AcmgReady = Boolean(step2ReqGate.CLNSIG?.found || step2ReqGate.InterVar_automated?.found);
  const acmgFilterCanApply = !!step2AcmgReady && !chatEligibility.requires_annovar;

  const fetchExomiserEligibility = useCallback(async () => {
    if (!activeConversationId || userTier === 'guest') return null;
    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) return null;
      const res = await fetch(apiUrl(`/api/exomiser-eligibility/${encodeURIComponent(activeConversationId)}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('[useVariantPipeline] fetchExomiserEligibility failed:', err);
      return null;
    }
  }, [activeConversationId, userTier]);

  const pollExomiserUntilDone = useCallback(async (conversationId) => {
    if (exomiserPollAbortRef.current) exomiserPollAbortRef.current.aborted = true;
    const abort = { aborted: false };
    exomiserPollAbortRef.current = abort;

    const pollOnce = async () => {
      const auth = getAuth();
      const t = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!t) throw new Error('Authentication required');
      const sres = await fetch(apiUrl(`/api/exomiser-status/${encodeURIComponent(conversationId)}`), {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!sres.ok) throw new Error('Exomiser status check failed');
      return await sres.json();
    };

    const terminal = new Set(['completed', 'failed']);
    let attempts = 0;
    const maxAttempts = 400;
    while (attempts < maxAttempts && !abort.aborted) {
      await new Promise((r) => setTimeout(r, 3000));
      if (abort.aborted) break;
      attempts++;
      let payload;
      try {
        payload = await pollOnce();
      } catch (e) {
        console.warn('[useVariantPipeline] Exomiser poll error:', e);
        continue;
      }
      if (abort.aborted) break;
      const status = (payload?.status || payload?.exomiser_job?.status || '').toLowerCase();
      setExomiserStatus({
        status,
        phase: payload?.phase || payload?.exomiser_job?.phase || '',
        message: payload?.message || payload?.exomiser_job?.message || '',
        error: payload?.exomiser_job?.error || payload?.error || '',
        progress_percent: payload?.progress_percent ?? payload?.exomiser_job?.progress_percent ?? null,
        matched_count: payload?.matched_count ?? payload?.exomiser_job?.matched_count ?? null,
      });
      if (terminal.has(status)) {
        if (status === 'failed') {
          const detail =
            payload?.exomiser_job?.error ||
            payload?.error ||
            payload?.exomiser_job?.message ||
            payload?.message ||
            'Exomiser did not complete successfully.';
          const friendly =
            /no valid hpo/i.test(detail)
              ? 'Could not derive any valid HPO terms from the phenotype description. Edit the sample metadata and provide a clearer clinical phenotype (e.g. specific symptoms or HPO terms), then try again.'
              : humanizeError(detail) || detail;
          setAnnovarMessageModal({
            title: 'Exomiser failed',
            message: friendly,
            variant: 'error',
          });
          // Re-resolve eligibility so a failed run doesn't leave chat/download parked
          // on the optimistic "unknown" state.
          await refreshChatEligibilityFromApiRef.current?.(conversationId);
        } else {
          await refreshConversationAfterAnnovar(conversationId);
        }
        break;
      }
    }
    if (!abort.aborted) setIsRunningExomiser(false);
  }, [refreshConversationAfterAnnovar, setAnnovarMessageModal]);

  const runExomiser = useCallback(async () => {
    if (!activeConversationId || userTier === 'guest') return;
    if (isRunningExomiser) return;

    beginPipelineWork();
    setIsRunningExomiser(true);
    setExomiserStatus({ status: 'running', phase: 'queued', message: 'Starting Exomiser…', progress_percent: 0 });

    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Authentication required');

      const res = await fetch(apiUrl('/api/run-exomiser'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Device-Id': getDeviceId(),
        },
        body: JSON.stringify({ conversation_id: activeConversationId }),
      });

      if (!res.ok && res.status !== 202) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorDetailToMessage(err.detail) || 'Failed to start Exomiser');
      }

      await pollExomiserUntilDone(activeConversationId);
    } catch (error) {
      console.error('[useVariantPipeline] runExomiser error:', error);
      setAnnovarMessageModal({
        title: 'Exomiser',
        message: humanizeError(error.message) || 'Failed to start Exomiser.',
        variant: 'error',
      });
      setIsRunningExomiser(false);
      // Resolve the optimistic "unknown" state set by beginPipelineWork().
      await refreshChatEligibilityFromApi(activeConversationId);
    }
  }, [
    activeConversationId,
    userTier,
    isRunningExomiser,
    beginPipelineWork,
    refreshChatEligibilityFromApi,
    getDeviceId,
    pollExomiserUntilDone,
    setAnnovarMessageModal,
  ]);

  const resetConversationPipeline = useCallback(() => {
    setChatEligibility(defaultChatEligibility());
    setPipelineSnapshot({
      hasAnnotatedFile: false,
      vcfAnnotated: false,
      annovarJob: null,
      filterJob: null,
    });
    setPipelineToast(null);
    setIsRunningAnnovar(false);
    setIsApplyingProprietaryFilter(false);
    setIsRunningExomiser(false);
    setExomiserStatus(null);
    if (exomiserPollAbortRef.current) exomiserPollAbortRef.current.aborted = true;
    prevAnnovarJobStatusRef.current = null;
    prevFilterJobStatusRef.current = null;
    prevChatAllowedRef.current = null;
  }, [defaultChatEligibility]);

  const syncPipelineFromConversation = useCallback((convData) => {
    if (!convData) {
      resetConversationPipeline();
      return;
    }
    setPipelineSnapshot({
      hasAnnotatedFile: Boolean(convData.annotated_file_s3_key),
      vcfAnnotated: Boolean(convData.vcf_annotated),
      annovarJob: convData.annovar_job || null,
      filterJob: convData.filter_job || null,
    });
    const annStatus = convData.annovar_job?.status;
    const filtStatus = convData.filter_job?.status;
    setIsRunningAnnovar(annStatus === 'running');
    setIsApplyingProprietaryFilter(filtStatus === 'running' || filtStatus === 'pending');
    prevAnnovarJobStatusRef.current = annStatus || null;
    prevFilterJobStatusRef.current = filtStatus || null;
    applyChatEligibilityFromConversation(convData);
    if (activeConversationId && convData.document) {
      refreshChatEligibilityFromApi(activeConversationId, { convFallback: convData });
    }
    setPipelineToast(null);

    const exoStatus = (convData.exomiser_job?.status || '').toLowerCase();
    if (exoStatus === 'running' || exoStatus === 'queued') {
      setIsRunningExomiser(true);
      setExomiserStatus({
        status: exoStatus,
        phase: convData.exomiser_job?.phase || '',
        message: convData.exomiser_job?.message || 'Exomiser is running…',
        error: '',
        progress_percent: convData.exomiser_job?.progress_percent ?? 0,
        matched_count: convData.exomiser_job?.matched_count ?? null,
      });
      pollExomiserUntilDone(activeConversationId);
    } else {
      if (exomiserPollAbortRef.current) exomiserPollAbortRef.current.aborted = true;
      setIsRunningExomiser(false);
      if (exoStatus === 'completed') {
        setExomiserStatus({
          status: 'completed',
          phase: convData.exomiser_job?.phase || 'complete',
          message: convData.exomiser_job?.message || 'Exomiser complete.',
          error: '',
          progress_percent: 100,
          matched_count: convData.exomiser_job?.matched_count ?? null,
        });
      } else if (exoStatus === 'failed') {
        setExomiserStatus({
          status: exoStatus,
          phase: convData.exomiser_job?.phase || '',
          message: convData.exomiser_job?.message || '',
          error: convData.exomiser_job?.error || '',
          progress_percent: null,
          matched_count: null,
        });
      } else {
        setExomiserStatus(null);
      }
    }
  }, [
    activeConversationId,
    applyChatEligibilityFromConversation,
    refreshChatEligibilityFromApi,
    resetConversationPipeline,
    pollExomiserUntilDone,
  ]);

  return {
    chatEligibility,
    setChatEligibility,
    pipelineSnapshot,
    pipelineToast,
    setPipelineToast,
    isRunningAnnovar,
    isApplyingProprietaryFilter,
    setIsApplyingProprietaryFilter,
    pipelineBusy,
    downloadGate,
    beginPipelineWork,
    refreshAfterFilterChange,
    uploadSessionConversationId,
    handleVariantUploadingChange,
    handleUploadProgressChange,
    uploadProgress,
    refreshConversationAfterAnnovar,
    presentFileAnalysisModal,
    runAnnovarForCurrentConversation,
    runProprietaryFilter,
    promptChatBlocked,
    isChatPipelineGated,
    enrichmentState,
    indexingState,
    pipelineJobActive,
    variantUploadInProgress,
    acmgFilterCanApply,
    isRunningExomiser,
    exomiserStatus,
    fetchExomiserEligibility,
    runExomiser,
    syncPipelineFromConversation,
    resetConversationPipeline,
    normalizeChatEligibilityMessage,
    refreshChatEligibilityFromApi,
    remapProprietaryFiltersForConversation,
    convertTabularToVcfForConversation,
  };
}
