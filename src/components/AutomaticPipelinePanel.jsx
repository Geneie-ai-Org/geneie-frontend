import React, { useEffect, useState } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import PipelineJobCard from '@/components/PipelineJobCard';
import { Button } from '@/components/ui/button';

function formatEventTime(at) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/** Conductor phase -> the one status vocabulary. Waiting on a gate or on you is "Queued". */
function phaseToStatus(phase) {
  if (phase === 'failed') return 'failed';
  if (phase === 'ready_report') return 'done';
  if (typeof phase === 'string' && phase.startsWith('waiting')) return 'queued';
  return 'running';
}

/**
 * Early Access panel: current Automatic status as one sentence, with the checklist of what ran
 * behind a "Steps" toggle (collapsed unless something failed).
 *
 * `variant="card"` (default) keeps the inline placement above the composer; `variant="panel"`
 * renders plain, scrolling content for a workspace tab.
 */
export default function AutomaticPipelinePanel({
  message,
  phase,
  steps = [],
  events = [],
  showReportCta = false,
  reportGate = null,
  reportCtaLabel = 'Generate report',
  onGenerateReport,
  variant = 'card',
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const reportBlocked = reportGate?.blocked === true;
  const status = phaseToStatus(phase);

  // A failure is the one case where the checklist is worth opening for the user.
  useEffect(() => {
    if (phase === 'failed') setStepsOpen(true);
  }, [phase]);

  const isPanel = variant === 'panel';
  // In the workspace tab the checklist is always on view and the event log sits behind "Details".
  const timeline = (isPanel || stepsOpen) && events.length > 0 ? (
    <div>
      {isPanel ? null : <h4 className="mb-1 text-[12px] font-medium text-muted-foreground">Timeline</h4>}
      <ul className="m-0 list-none space-y-1.5 p-0">
        {[...events].reverse().map((ev) => (
          <li key={ev.id} className="flex gap-2 text-[12px]">
            <span className="w-[5.5rem] shrink-0 text-right tabular-nums text-muted-foreground">{formatEventTime(ev.at)}</span>
            <span className="text-[var(--text-secondary)]">{ev.message}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  // One vocabulary (queued, running, done, failed): a skipped step is finished as far as the user is
  // concerned, and the detail line says why.
  const stepRows = steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status === 'skipped' ? 'done' : step.status,
    detail: step.status === 'skipped' ? step.detail || 'Not needed for this case' : step.detail,
  }));

  return (
    <PipelineJobCard
      variant={variant}
      className={variant === 'card' ? 'mx-3' : undefined}
      ariaLabel="Automatic pipeline"
      title="Automatic pipeline"
      icon={<Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      engine={{ label: 'Early access', tone: 'brand' }}
      status={status}
      statusTitle={isPanel && phase === 'failed' ? message || 'Automatic paused.' : null}
      statusText={
        isPanel && phase === 'failed'
          ? 'Fix the step marked Failed, or switch the case to Manual to continue yourself.'
          : message || 'Automatic pipeline'
      }
      steps={stepRows}
      stepsOpen={stepsOpen}
      onStepsToggle={() => setStepsOpen((v) => !v)}
      stepsLabel="Activity"
      details={isPanel ? timeline : null}
      detailsLabel="Event log"
    >
      {isPanel ? null : timeline}
      {phase === 'failed' && !isPanel ? (
        <p className="m-0 text-xs text-[var(--error)]" role="alert">
          Automatic paused at the step marked Failed. Fix that step, or switch the case to Manual to continue yourself.
        </p>
      ) : null}
      {showReportCta ? (
        <div className={isPanel ? 'flex items-center justify-end' : 'flex items-center justify-end border-t border-border pt-3'}>
          <Button
            type="button"
            variant={reportBlocked || status !== 'done' ? 'outline' : 'default'}
            size="sm"
            disabled={reportBlocked}
            title={reportGate?.title}
            onClick={() => {
              if (reportBlocked || typeof onGenerateReport !== 'function') return;
              onGenerateReport();
            }}
            className="max-sm:h-11"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {reportBlocked ? reportGate?.label : reportCtaLabel}
          </Button>
        </div>
      ) : null}
    </PipelineJobCard>
  );
}
