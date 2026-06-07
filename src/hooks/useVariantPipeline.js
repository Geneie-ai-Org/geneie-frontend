import { useState, useRef, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import * as mongodbApi from '../services/mongodbApi';
import { apiUrl } from '@/config/api';
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
  const [chatEligibility, setChatEligibility] = useState({
    allowed: true,
    message: null,
    reason: null,
    requires_annovar: false,
    requires_filter: false,
    variants_under_consideration: null,
  });
  const [pipelineSnapshot, setPipelineSnapshot] = useState({
    hasAnnotatedFile: false,
    annovarJob: null,
    filterJob: null,
  });
  const [pipelineToast, setPipelineToast] = useState(null);
  const [isRunningAnnovar, setIsRunningAnnovar] = useState(false);
  const [isApplyingAcmgFilter, setIsApplyingAcmgFilter] = useState(false);
  const [uploadSessionConversationId, setUploadSessionConversationId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);

  const prevAnnovarJobStatusRef = useRef(null);
  const prevFilterJobStatusRef = useRef(null);
  const prevChatAllowedRef = useRef(null);
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;
  const isRunningAnnovarRef = useRef(isRunningAnnovar);
  isRunningAnnovarRef.current = isRunningAnnovar;
  const isApplyingAcmgFilterRef = useRef(isApplyingAcmgFilter);
  isApplyingAcmgFilterRef.current = isApplyingAcmgFilter;

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
      allowed: true,
      message: null,
      reason: null,
      requires_annovar: false,
      requires_filter: false,
      variants_under_consideration: null,
      s3_line_count_status: null,
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
          !isApplyingAcmgFilterRef.current
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
          !isApplyingAcmgFilterRef.current
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
        });
        return data;
      } catch (error) {
        console.warn('[useVariantPipeline] chat-eligibility fetch failed:', error);
        if (convFallback) applyChatEligibilityFromConversation(convFallback, { announceReady });
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
          message: error.message || 'Could not convert file to VCF.',
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
        isApplyingAcmgFilterRef.current ||
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
          annovarJob: annJob.status ? annJob : null,
          filterJob: filtJob.status ? filtJob : null,
        });

        const annActive = annJob.status === 'running';
        const filtActive = filtJob.status === 'running' || filtJob.status === 'pending';
        if (annActive) setIsRunningAnnovar(true);
        else if (annJob.status === 'completed' || annJob.status === 'failed') setIsRunningAnnovar(false);
        if (filtActive) setIsApplyingAcmgFilter(true);
        else if (filtJob.status === 'completed' || filtJob.status === 'failed') {
          setIsApplyingAcmgFilter(false);
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
            title: 'ACMG filter complete',
            message:
              filtJob.message ||
              `${(filtJob.filtered_count ?? filtJob.rows_kept ?? 0).toLocaleString()} variants prioritized for chat.`,
            variant: 'success',
          });
        } else if (prevFilt === 'running' && filtJob.status === 'failed') {
          setPipelineToast({
            title: 'ACMG filter failed',
            message: filtJob.message || filtJob.error || 'Prioritization did not complete.',
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
    // - isRunningAnnovar / isApplyingAcmgFilter: a job was *just* kicked off and the loop may have
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
  }, [activeConversationId, currentDocument, userTier, isRunningAnnovar, isApplyingAcmgFilter]);

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
    isApplyingAcmgFilter ||
    pipelineSnapshot.annovarJob?.status === 'running' ||
    pipelineSnapshot.filterJob?.status === 'running' ||
    pipelineSnapshot.filterJob?.status === 'pending';

  const variantUploadInProgress =
    Boolean(uploadSessionConversationId) && uploadSessionConversationId === activeConversationId;

  const isChatPipelineGated =
    userTier !== 'guest' &&
    !!currentDocument &&
    !!activeConversationId &&
    !chatEligibility.allowed;

  const promptChatBlocked = useCallback(() => {
    if (!isChatPipelineGated) return false;
    setAnnovarMessageModal({
      title: 'Chat not available',
      message:
        chatEligibility.message ||
        'Reduce your variant set to 1,000 rows or fewer using filters, then try again.',
      variant: 'warning',
    });
    return true;
  }, [isChatPipelineGated, chatEligibility.message, setAnnovarMessageModal]);

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
        message: error.message || 'Annotation failed. Please try again.',
        variant: 'error',
      });
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

  const runAcmgFilterForCurrentConversation = useCallback(async () => {
    if (userTier === 'guest') {
      setAnnovarMessageModal({
        title: 'Sign up to apply ACMG filter',
        message:
          'The ACMG filter is available for signed-in users. Create an account to prioritize variants for chat.',
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
    if (isApplyingAcmgFilter) return;

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

    let filterStartedAsync = false;
    setIsApplyingAcmgFilter(true);
    prevFilterJobStatusRef.current = 'running';
    interpretationDismissedRef.current = true;
    setShowInterpretationModal(false);

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
        body: JSON.stringify({ conversation_id: activeConversationId, filter_type: 'filter_1' }),
      });

      if (!res.ok && res.status !== 202) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const detailText =
          typeof detail === 'string'
            ? detail
            : detail && typeof detail === 'object' && detail.message
              ? detail.message
              : Array.isArray(detail)
                ? detail.map((d) => d.msg || d).join(', ')
                : null;
        throw new Error(detailText || 'Failed to apply ACMG filter');
      }

      if (res.status === 202) {
        filterStartedAsync = true;
        await res.json().catch(() => ({}));
        setAnnovarMessageModal(null);
        setPipelineToast({
          title: 'ACMG filter started',
          message: 'Prioritization is running in the background. Watch the pipeline bar at the top.',
          variant: 'success',
        });
      } else {
        const data = await res.json();
        const filteredCount = data.filtered_count ?? 0;
        await refreshConversationAfterAnnovar(activeConversationId);
        setConversationFilterState((prev) => ({
          ...prev,
          activeProprietaryFilter: 'filter_1',
          filteredVariantCount: filteredCount ?? prev.filteredVariantCount,
          filterWorkingSetCount: filteredCount ?? prev.filterWorkingSetCount,
        }));
        setAnnovarMessageModal({
          title: 'ACMG filter applied',
          message: `${filteredCount ?? 0} variants prioritized for chat.`,
          variant: 'success',
        });
      }
    } catch (error) {
      console.error('[useVariantPipeline] Apply ACMG filter error:', error);
      setAnnovarMessageModal({
        title: 'ACMG filter',
        message:
          error.message ||
          'Failed to apply ACMG filter. Run ANNOVAR first if your file is not annotated yet.',
        variant: 'error',
      });
    } finally {
      if (!filterStartedAsync) {
        setIsApplyingAcmgFilter(false);
      }
    }
  }, [
    activeConversationId,
    currentDocument,
    isApplyingAcmgFilter,
    userTier,
    columnInterpretationResult,
    chatEligibility.requires_annovar,
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

  const resetConversationPipeline = useCallback(() => {
    setChatEligibility(defaultChatEligibility());
    setPipelineSnapshot({
      hasAnnotatedFile: false,
      annovarJob: null,
      filterJob: null,
    });
    setPipelineToast(null);
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
      annovarJob: convData.annovar_job || null,
      filterJob: convData.filter_job || null,
    });
    prevAnnovarJobStatusRef.current = convData.annovar_job?.status || null;
    prevFilterJobStatusRef.current = convData.filter_job?.status || null;
    applyChatEligibilityFromConversation(convData);
    if (activeConversationId && convData.document) {
      refreshChatEligibilityFromApi(activeConversationId, { convFallback: convData });
    }
    setPipelineToast(null);
  }, [
    activeConversationId,
    applyChatEligibilityFromConversation,
    refreshChatEligibilityFromApi,
    resetConversationPipeline,
  ]);

  return {
    chatEligibility,
    setChatEligibility,
    pipelineSnapshot,
    pipelineToast,
    setPipelineToast,
    isRunningAnnovar,
    isApplyingAcmgFilter,
    uploadSessionConversationId,
    handleVariantUploadingChange,
    handleUploadProgressChange,
    uploadProgress,
    refreshConversationAfterAnnovar,
    presentFileAnalysisModal,
    runAnnovarForCurrentConversation,
    runAcmgFilterForCurrentConversation,
    promptChatBlocked,
    isChatPipelineGated,
    pipelineJobActive,
    variantUploadInProgress,
    acmgFilterCanApply,
    syncPipelineFromConversation,
    resetConversationPipeline,
    normalizeChatEligibilityMessage,
    refreshChatEligibilityFromApi,
    remapProprietaryFiltersForConversation,
    convertTabularToVcfForConversation,
  };
}
