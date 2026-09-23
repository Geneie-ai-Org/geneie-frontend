/**
 * Early-access Automatic pipeline conductor (Track 8.2).
 * When case-level pipeline_run_mode === automatic, advance ready stages:
 *   annotate (if needed) → phenotype prioritization (when eligible).
 * Report generation stays analyst-driven for now (assignment modal).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizePipelineRunMode, PIPELINE_RUN_AUTOMATIC } from '@/components/PipelineRunModeToggle';
import { sampleHasPhenotype } from '@/components/PhenotypeInputPanel';

function confirmedHpoCount(sampleMetadata) {
  const ids = sampleMetadata?.phenotype_hpo?.confirmed_ids;
  if (!Array.isArray(ids)) return 0;
  return ids.filter((id) => String(id || '').toUpperCase().startsWith('HP:')).length;
}

/**
 * @returns {{ active: boolean, phase: string|null, message: string|null, earlyAccess: boolean }}
 */
export function useAutomaticPipelineConductor({
  enabled = true,
  conversationId = null,
  sampleMetadata,
  analysisType,
  hasAnnotatedFile,
  annovarJobStatus,
  isRunningAnnovar,
  exomiserStatus,
  isRunningExomiser,
  module1JobActive = false,
  runAnnovar,
  fetchExomiserEligibility,
  runExomiser,
}) {
  const [phase, setPhase] = useState(null);
  const [message, setMessage] = useState(null);
  const kickedRef = useRef({ annovar: false, exomiser: false, conversationKey: null });

  const isAutomatic =
    normalizePipelineRunMode(
      sampleMetadata?.pipeline_run_mode || sampleMetadata?.phenotype_run_mode
    ) === PIPELINE_RUN_AUTOMATIC;

  const isGermline = !analysisType || analysisType === 'Germline';
  const active = Boolean(enabled && isAutomatic && isGermline);

  useEffect(() => {
    const key = conversationId || null;
    if (kickedRef.current.conversationKey !== key) {
      kickedRef.current = { annovar: false, exomiser: false, conversationKey: key };
      setPhase(null);
      setMessage(null);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!active) {
      setPhase(null);
      setMessage(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    if (module1JobActive) {
        setPhase('calling');
        setMessage('Calling variants…');
        return undefined;
      }

      let cancelled = false;

      const tick = async () => {
        const exoStatus = String(exomiserStatus?.status || '').toLowerCase();
        const annStatus = String(annovarJobStatus || '').toLowerCase();

        if (exoStatus === 'completed' || exoStatus === 'success') {
          setPhase('ready_report');
          setMessage('Prioritization complete — generate report when ready.');
          return;
        }
        if (exoStatus === 'running' || exoStatus === 'queued' || isRunningExomiser) {
          setPhase('prioritizing');
          setMessage('Running phenotype prioritization…');
          return;
        }
        if (exoStatus === 'failed' || exoStatus === 'error') {
          setPhase('failed');
          setMessage('Prioritization failed — retry or switch to Manual.');
          return;
        }

        if (annStatus === 'running' || annStatus === 'queued' || isRunningAnnovar) {
          setPhase('annotating');
          setMessage('Annotating variants…');
          return;
        }
        if (annStatus === 'failed' || annStatus === 'error') {
          setPhase('failed');
          setMessage('Annotation failed — retry or switch to Manual.');
          return;
        }

        if (!hasAnnotatedFile && typeof runAnnovar === 'function' && !kickedRef.current.annovar) {
          kickedRef.current.annovar = true;
          setPhase('annotating');
          setMessage('Starting annotation…');
          try {
            await runAnnovar();
          } catch {
            kickedRef.current.annovar = false;
            if (!cancelled) {
              setPhase('failed');
              setMessage('Could not start annotation.');
            }
          }
          return;
        }

        if (!hasAnnotatedFile) {
          setPhase('waiting_annotation');
          setMessage('Waiting for annotated variants…');
          return;
        }

        const hasPhenotype =
          sampleHasPhenotype(sampleMetadata) && confirmedHpoCount(sampleMetadata) > 0;
        if (!hasPhenotype) {
          setPhase('waiting_phenotype');
          setMessage('Add clinical findings to continue.');
          return;
        }

        if (typeof fetchExomiserEligibility !== 'function' || typeof runExomiser !== 'function') {
          return;
        }
        if (kickedRef.current.exomiser) return;

        setPhase('checking_prioritization');
        setMessage('Preparing prioritization…');
        try {
          const eligibility = await fetchExomiserEligibility();
          if (cancelled) return;
          if (eligibility?.can_run === true) {
            kickedRef.current.exomiser = true;
            setPhase('prioritizing');
            setMessage('Starting phenotype prioritization…');
            try {
              await runExomiser();
            } catch {
              kickedRef.current.exomiser = false;
              if (!cancelled) {
                setPhase('failed');
                setMessage('Could not start prioritization.');
              }
            }
          } else {
            setPhase('waiting_gates');
            setMessage(eligibility?.message || 'Waiting for pipeline gates…');
          }
        } catch {
          if (!cancelled) {
            setPhase('failed');
            setMessage('Could not start prioritization.');
          }
        }
      };

    tick();
    return () => {
      cancelled = true;
    };
  }, [
    active,
    module1JobActive,
    hasAnnotatedFile,
    annovarJobStatus,
    isRunningAnnovar,
    exomiserStatus?.status,
    exomiserStatus?.message,
    exomiserStatus?.error,
    isRunningExomiser,
    sampleMetadata,
    runAnnovar,
    fetchExomiserEligibility,
    runExomiser,
  ]);

  return useMemo(
    () => ({
      active,
      earlyAccess: active,
      phase,
      message,
    }),
    [active, phase, message]
  );
}

export default useAutomaticPipelineConductor;
