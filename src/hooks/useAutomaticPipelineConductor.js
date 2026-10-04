/**
 * Early-access Automatic pipeline conductor (Track 8.2).
 * When case-level pipeline_run_mode === automatic, advance ready stages:
 *   annotate (if needed) → phenotype prioritization (when eligible)
 *   → ready_report (analyst opens assignment modal via banner CTA).
 * Also exposes a step timeline + event log for the Automatic activity panel.
 *
 * Important: never re-kick Annovar / Exomiser / GA on refresh when those stages
 * already completed or are in-flight. Empty status means "not hydrated yet", not
 * "not started".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizePipelineRunMode, PIPELINE_RUN_AUTOMATIC } from '@/components/PipelineRunModeToggle';
import { sampleHasPhenotype } from '@/components/PhenotypeInputPanel';

function confirmedHpoCount(sampleMetadata) {
  const ids = sampleMetadata?.phenotype_hpo?.confirmed_ids;
  if (!Array.isArray(ids)) return 0;
  return ids.filter((id) => String(id || '').toUpperCase().startsWith('HP:')).length;
}

function normStatus(value) {
  return String(value || '').toLowerCase().trim();
}

function isGaDone(ga) {
  return ga === 'completed' || ga === 'ready';
}

function isGaRunning(ga) {
  return ga === 'running' || ga === 'pending' || ga === 'queued';
}

function isExoDone(exo) {
  return exo === 'completed' || exo === 'success';
}

function isExoRunning(exo, isRunningExomiser) {
  return exo === 'running' || exo === 'queued' || Boolean(isRunningExomiser);
}

/** Phenotype filter already applied ⇒ do not auto re-run Exomiser. */
function phenotypeFilterAlreadyApplied(activeProprietaryFilter) {
  const f = normStatus(activeProprietaryFilter);
  return f === 'filter_3' || f === 'exomiser';
}

/** Fixed Automatic stages shown in the activity panel (order matters). */
export const AUTOMATIC_PIPELINE_STEPS = [
  { id: 'calling', label: 'Call variants' },
  { id: 'annotate', label: 'Annotate' },
  { id: 'phenotype', label: 'Clinical findings' },
  { id: 'prioritize', label: 'Phenotype prioritization' },
  { id: 'ga', label: 'GA triage' },
  { id: 'report', label: 'Clinical report' },
];

/**
 * Derive checklist statuses from live pipeline + conductor phase.
 * @returns {Array<{ id: string, label: string, status: string, detail?: string }>}
 */
export function deriveAutomaticSteps({
  phase,
  message,
  module1JobActive,
  hasAnnotatedFile,
  hasPhenotype,
  annStatus,
  exoStatus,
  isRunningAnnovar,
  isRunningExomiser,
  sawModule1 = false,
  gaStatus = '',
}) {
  const failed = phase === 'failed';
  const annRunning =
    annStatus === 'running' || annStatus === 'queued' || isRunningAnnovar || phase === 'annotating';
  const annFailed = annStatus === 'failed' || annStatus === 'error';
  const exoRunning =
    isExoRunning(exoStatus, isRunningExomiser) ||
    phase === 'prioritizing' ||
    phase === 'checking_prioritization';
  const exoDone = isExoDone(exoStatus) || phase === 'ready_report';
  const exoFailed = exoStatus === 'failed' || exoStatus === 'error';

  const calling = (() => {
    if (module1JobActive || phase === 'calling') {
      return { status: 'running', detail: 'Calling variants…' };
    }
    if (hasAnnotatedFile || exoDone || exoRunning || hasPhenotype) {
      return sawModule1
        ? { status: 'done', detail: 'Variants ready' }
        : { status: 'skipped', detail: 'Uploaded annotated / VCF path' };
    }
    if (!sawModule1 && !module1JobActive) {
      return { status: 'pending', detail: 'Waiting…' };
    }
    return { status: 'pending' };
  })();

  const annotate = (() => {
    if (annFailed || (failed && (phase === 'failed' && message?.includes('nnotation')))) {
      return { status: 'failed', detail: message || 'Annotation failed' };
    }
    if (hasAnnotatedFile) return { status: 'done', detail: 'Annotated file ready' };
    if (annRunning) return { status: 'running', detail: message || 'Annotating…' };
    if (phase === 'waiting_annotation') return { status: 'waiting', detail: message };
    return { status: hasAnnotatedFile ? 'done' : 'pending' };
  })();

  const phenotype = (() => {
    if (hasPhenotype) return { status: 'done', detail: 'Findings confirmed' };
    if (phase === 'waiting_phenotype') {
      return { status: 'waiting', detail: message || 'Add clinical findings' };
    }
    if (!hasAnnotatedFile) return { status: 'pending' };
    return { status: 'pending', detail: 'Needs confirmed HPOs' };
  })();

  const prioritize = (() => {
    if (exoFailed || (failed && message?.toLowerCase().includes('priorit'))) {
      return { status: 'failed', detail: message || 'Prioritization failed' };
    }
    if (exoDone) return { status: 'done', detail: 'Prioritization complete' };
    if (exoRunning) return { status: 'running', detail: message || 'Running…' };
    if (phase === 'waiting_gates') return { status: 'waiting', detail: message };
    if (!hasPhenotype || !hasAnnotatedFile) return { status: 'pending' };
    return { status: 'pending' };
  })();

  const gaDone = isGaDone(gaStatus);
  const gaRunning = isGaRunning(gaStatus);
  const ga = (() => {
    if (gaDone) return { status: 'done', detail: 'GA ranking ready' };
    if (gaStatus === 'failed') return { status: 'failed', detail: 'GA triage failed' };
    // Only show "Ranking…" when GA is actually running — not while status is still hydrating.
    if (gaRunning) return { status: 'running', detail: 'Ranking variants…' };
    if (phase === 'waiting_ga' || phase === 'checking_ga') {
      return { status: 'waiting', detail: message || 'Checking GA status…' };
    }
    if (exoDone) return { status: 'waiting', detail: 'Starts after enrichment' };
    return { status: 'pending' };
  })();

  const report = (() => {
    if (phase === 'ready_report' && gaDone) {
      return {
        status: 'waiting',
        detail: 'Review GA-preselected variants, then Proceed',
      };
    }
    if (exoDone && !gaDone) {
      return { status: 'pending', detail: 'After GA triage' };
    }
    return { status: 'pending', detail: 'After prioritization' };
  })();

  const byId = { calling, annotate, phenotype, prioritize, ga, report };
  return AUTOMATIC_PIPELINE_STEPS.map((s) => ({
    ...s,
    status: byId[s.id]?.status || 'pending',
    detail: byId[s.id]?.detail || null,
  }));
}

/**
 * @returns {{
 *   active: boolean,
 *   phase: string|null,
 *   message: string|null,
 *   earlyAccess: boolean,
 *   steps: Array,
 *   events: Array<{ id: string, phase: string, message: string, at: number }>,
 * }}
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
  gaTriageStatus = '',
  activeProprietaryFilter = null,
  enrichmentStatus = null,
  statusHydrated = true,
}) {
  const [phase, setPhase] = useState(null);
  const [message, setMessage] = useState(null);
  const [events, setEvents] = useState([]);
  const kickedRef = useRef({ annovar: false, exomiser: false, conversationKey: null });
  const sawModule1Ref = useRef(false);
  const lastEventKeyRef = useRef(null);

  const isAutomatic =
    normalizePipelineRunMode(
      sampleMetadata?.pipeline_run_mode || sampleMetadata?.phenotype_run_mode
    ) === PIPELINE_RUN_AUTOMATIC;

  const isGermline = !analysisType || analysisType === 'Germline';
  const active = Boolean(enabled && isAutomatic && isGermline);

  const hasPhenotype =
    sampleHasPhenotype(sampleMetadata) && confirmedHpoCount(sampleMetadata) > 0;

  useEffect(() => {
    const key = conversationId || null;
    if (kickedRef.current.conversationKey !== key) {
      kickedRef.current = { annovar: false, exomiser: false, conversationKey: key };
      sawModule1Ref.current = false;
      lastEventKeyRef.current = null;
      setPhase(null);
      setMessage(null);
      setEvents([]);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!active) {
      setPhase(null);
      setMessage(null);
      setEvents([]);
      lastEventKeyRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    if (module1JobActive) sawModule1Ref.current = true;
  }, [module1JobActive]);

  // Seed kick guards from already-settled backend state (survives refresh).
  useEffect(() => {
    if (!active) return;
    const exo = normStatus(exomiserStatus?.status);
    const ga = normStatus(gaTriageStatus);
    if (hasAnnotatedFile) kickedRef.current.annovar = true;
    if (
      isExoDone(exo) ||
      isExoRunning(exo, isRunningExomiser) ||
      phenotypeFilterAlreadyApplied(activeProprietaryFilter) ||
      isGaDone(ga) ||
      isGaRunning(ga)
    ) {
      kickedRef.current.exomiser = true;
    }
  }, [
    active,
    hasAnnotatedFile,
    exomiserStatus?.status,
    isRunningExomiser,
    activeProprietaryFilter,
    gaTriageStatus,
  ]);

  // Append timeline events when phase/message changes (deduped).
  useEffect(() => {
    if (!active || !phase || !message) return;
    const key = `${phase}::${message}`;
    if (lastEventKeyRef.current === key) return;
    lastEventKeyRef.current = key;
    setEvents((prev) => [
      ...prev,
      {
        id: `${key}-${Date.now()}`,
        phase,
        message,
        at: Date.now(),
      },
    ].slice(-40));
  }, [active, phase, message]);

  useEffect(() => {
    if (!active) return undefined;
    if (module1JobActive) {
      setPhase('calling');
      setMessage('Calling variants…');
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      const exoStatus = normStatus(exomiserStatus?.status);
      const annStatus = normStatus(annovarJobStatus);
      const ga = normStatus(gaTriageStatus);
      const enrich = normStatus(enrichmentStatus);
      const filterDone = phenotypeFilterAlreadyApplied(activeProprietaryFilter);

      // Conversation / job blobs not loaded yet — never start work.
      if (!statusHydrated) {
        setPhase('checking_prioritization');
        setMessage('Loading case status…');
        return;
      }

      // GA already finished → report step only. Never re-kick Exomiser.
      if (isGaDone(ga)) {
        kickedRef.current.exomiser = true;
        kickedRef.current.annovar = true;
        setPhase('ready_report');
        setMessage('GA ranking ready — review Include, then generate the report.');
        return;
      }

      if (ga === 'failed') {
        kickedRef.current.exomiser = true;
        setPhase('failed');
        setMessage('GA triage failed — retry enrichment or assign the report manually.');
        return;
      }

      if (isGaRunning(ga)) {
        kickedRef.current.exomiser = true;
        setPhase('waiting_ga');
        setMessage('Waiting for GA triage…');
        return;
      }

      // Exomiser / phenotype filter already done → wait for GA (or enrichment→GA).
      if (isExoDone(exoStatus) || filterDone || enrich === 'completed' || enrich === 'success') {
        kickedRef.current.exomiser = true;
        if (!ga) {
          setPhase('checking_ga');
          setMessage('Checking GA status…');
          return;
        }
        if (ga === 'absent' || ga === '') {
          setPhase('waiting_ga');
          setMessage('Waiting for GA triage…');
          return;
        }
        setPhase('waiting_ga');
        setMessage('Waiting for GA triage…');
        return;
      }

      if (isExoRunning(exoStatus, isRunningExomiser)) {
        kickedRef.current.exomiser = true;
        setPhase('prioritizing');
        setMessage('Running phenotype prioritization…');
        return;
      }
      if (exoStatus === 'failed' || exoStatus === 'error') {
        kickedRef.current.exomiser = true;
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

      if (!hasPhenotype) {
        setPhase('waiting_phenotype');
        setMessage('Add clinical findings to continue.');
        return;
      }

      // Exomiser status still empty after hydrate — wait; do NOT treat as "not started".
      if (!exoStatus && !filterDone) {
        setPhase('checking_prioritization');
        setMessage('Checking prioritization status…');
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
        // Re-check kick guard after await (status may have hydrated meanwhile).
        if (kickedRef.current.exomiser) return;
        const exoNow = normStatus(exomiserStatus?.status);
        const gaNow = normStatus(gaTriageStatus);
        if (
          isExoDone(exoNow) ||
          isGaDone(gaNow) ||
          isGaRunning(gaNow) ||
          phenotypeFilterAlreadyApplied(activeProprietaryFilter)
        ) {
          kickedRef.current.exomiser = true;
          return;
        }
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
    hasPhenotype,
    runAnnovar,
    fetchExomiserEligibility,
    runExomiser,
    gaTriageStatus,
    activeProprietaryFilter,
    enrichmentStatus,
    statusHydrated,
  ]);

  const exoStatus = normStatus(exomiserStatus?.status);
  const annStatus = normStatus(annovarJobStatus);

  const steps = useMemo(
    () =>
      deriveAutomaticSteps({
        phase,
        message,
        module1JobActive,
        hasAnnotatedFile,
        hasPhenotype,
        annStatus,
        exoStatus,
        isRunningAnnovar,
        isRunningExomiser,
        sawModule1: sawModule1Ref.current,
        gaStatus: normStatus(gaTriageStatus),
      }),
    [
      phase,
      message,
      module1JobActive,
      hasAnnotatedFile,
      hasPhenotype,
      annStatus,
      exoStatus,
      isRunningAnnovar,
      isRunningExomiser,
      gaTriageStatus,
    ]
  );

  return useMemo(
    () => ({
      active,
      earlyAccess: active,
      phase,
      message,
      steps,
      events,
    }),
    [active, phase, message, steps, events]
  );
}

export default useAutomaticPipelineConductor;
