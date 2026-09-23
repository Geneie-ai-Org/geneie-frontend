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
      setMessage('Early access · Automatic: variant calling in progress…');
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      const exoStatus = String(exomiserStatus?.status || '').toLowerCase();
      const annStatus = String(annovarJobStatus || '').toLowerCase();

      if (exoStatus === 'completed' || exoStatus === 'success') {
        setPhase('ready_report');
        setMessage('Early access · Automatic: prioritization complete — generate the report when ready.');
        return;
      }
      if (exoStatus === 'running' || exoStatus === 'queued' || isRunningExomiser) {
        setPhase('prioritizing');
        setMessage(
          exomiserStatus?.message ||
            'Early access · Automatic: phenotype prioritization running…'
        );
        return;
      }
      if (exoStatus === 'failed' || exoStatus === 'error') {
        setPhase('failed');
        setMessage(
          exomiserStatus?.error ||
            exomiserStatus?.message ||
            'Early access · Automatic: prioritization failed — switch to Manual or retry.'
        );
        return;
      }

      if (annStatus === 'running' || annStatus === 'queued' || isRunningAnnovar) {
        setPhase('annotating');
        setMessage('Early access · Automatic: annotation running…');
        return;
      }
      if (annStatus === 'failed' || annStatus === 'error') {
        setPhase('failed');
        setMessage('Early access · Automatic: annotation failed — switch to Manual or retry.');
        return;
      }

      // Need annotation first.
      if (!hasAnnotatedFile && typeof runAnnovar === 'function' && !kickedRef.current.annovar) {
        kickedRef.current.annovar = true;
        setPhase('annotating');
        setMessage('Early access · Automatic: starting annotation…');
        try {
          await runAnnovar();
        } catch {
          kickedRef.current.annovar = false;
          if (!cancelled) {
            setPhase('failed');
            setMessage('Early access · Automatic: could not start annotation.');
          }
        }
        return;
      }

      if (!hasAnnotatedFile) {
        setPhase('waiting_annotation');
        setMessage('Early access · Automatic: waiting for an annotated variant set…');
        return;
      }

      const hasPhenotype =
        sampleHasPhenotype(sampleMetadata) && confirmedHpoCount(sampleMetadata) > 0;
      if (!hasPhenotype) {
        setPhase('waiting_phenotype');
        setMessage(
          'Early access · Automatic: add a clinical note and confirm findings to continue prioritization.'
        );
        return;
      }

      if (typeof fetchExomiserEligibility !== 'function' || typeof runExomiser !== 'function') {
        return;
      }
      if (kickedRef.current.exomiser) return;

      setPhase('checking_prioritization');
      setMessage('Early access · Automatic: checking phenotype prioritization…');
      try {
        const eligibility = await fetchExomiserEligibility();
        if (cancelled) return;
        if (eligibility?.can_run === true) {
          kickedRef.current.exomiser = true;
          setPhase('prioritizing');
          setMessage('Early access · Automatic: starting phenotype prioritization…');
          try {
            await runExomiser();
          } catch {
            kickedRef.current.exomiser = false;
            if (!cancelled) {
              setPhase('failed');
              setMessage('Early access · Automatic: could not start prioritization.');
            }
          }
        } else {
          setPhase('waiting_gates');
          setMessage(
            eligibility?.message ||
              'Early access · Automatic: prioritization not ready yet — waiting on pipeline gates.'
          );
        }
      } catch {
        if (!cancelled) {
          setPhase('failed');
          setMessage('Early access · Automatic: could not start prioritization.');
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
