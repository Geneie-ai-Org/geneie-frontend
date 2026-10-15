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

  const timeline = stepsOpen && events.length > 0 ? (
    <div>
      <h4 className="mb-1 text-2xs font-semibold text-muted-foreground">Timeline</h4>
      <ul className="m-0 max-h-32 list-none space-y-1 overflow-y-auto p-0">
        {[...events].reverse().map((ev) => (
          <li key={ev.id} className="flex gap-2 text-2xs">
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatEventTime(ev.at)}</span>
            <span className="text-[var(--text-secondary)]">{ev.message}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  const stepRows = steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status,
    detail: step.detail,
  }));

  return (
    <PipelineJobCard
      variant={variant}
      className={variant === 'card' ? 'mx-3' : undefined}
      ariaLabel="Automatic pipeline"
      title="Automatic pipeline"
      icon={<Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      engine={{ label: 'Early access' }}
      status={status}
      statusText={message || 'Automatic pipeline'}
      steps={stepRows}
      stepsOpen={stepsOpen}
      onStepsToggle={() => setStepsOpen((v) => !v)}
      stepsLabel="Activity"
    >
      {timeline}
      {phase === 'failed' ? (
        <p className="m-0 text-xs text-[var(--error)]" role="alert">
          Automatic paused. Fix the step above or switch the case to Manual.
        </p>
      ) : null}
      {showReportCta ? (
        <div className="flex items-center justify-end border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
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
