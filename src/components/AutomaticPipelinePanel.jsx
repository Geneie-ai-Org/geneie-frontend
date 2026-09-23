import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  FileText,
  Info,
  Loader2,
  Minus,
} from 'lucide-react';

function StepGlyph({ status }) {
  const slot = 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center';
  if (status === 'failed') {
    return (
      <span className={slot} aria-hidden>
        <AlertCircle className="h-3 w-3" style={{ color: 'var(--error)' }} />
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className={slot} aria-hidden>
        <Check className="h-3 w-3" strokeWidth={3} style={{ color: 'var(--accent-teal)' }} />
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className={slot} aria-hidden>
        <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--accent-teal)' }} />
      </span>
    );
  }
  if (status === 'waiting') {
    return (
      <span className={slot} aria-hidden>
        <Circle className="h-2.5 w-2.5" style={{ color: 'var(--accent-teal)' }} fill="currentColor" />
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className={slot} aria-hidden>
        <Minus className="h-3 w-3" style={{ color: 'var(--text-tertiary)' }} />
      </span>
    );
  }
  return (
    <span className={slot} aria-hidden>
      <Circle className="h-2.5 w-2.5" style={{ color: 'var(--text-tertiary)' }} />
    </span>
  );
}

function formatEventTime(at) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Expandable Early Access panel: current Automatic status + checklist of what ran.
 */
export default function AutomaticPipelinePanel({
  message,
  phase,
  steps = [],
  events = [],
  showReportCta = false,
  reportGate = null,
  onGenerateReport,
}) {
  const [expanded, setExpanded] = useState(true);
  const reportBlocked = reportGate?.blocked === true;

  return (
    <div
      className="mx-3 mb-2 rounded-lg border text-2xs overflow-hidden"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent-teal) 35%, transparent)',
        background: 'color-mix(in srgb, var(--accent-teal) 10%, transparent)',
        color: 'var(--text-secondary)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
          style={{
            color: 'var(--accent-teal)',
            borderColor: 'color-mix(in srgb, var(--accent-teal) 45%, transparent)',
            background: 'color-mix(in srgb, var(--accent-teal) 10%, transparent)',
          }}
          title="Early access — Automatic advances ready pipeline steps. Review results before clinical use."
          aria-label="Early access"
        >
          <Info className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="flex-1 min-w-0 font-medium" style={{ color: 'var(--text-primary)' }}>
          {message || 'Automatic pipeline'}
        </span>
        {showReportCta ? (
          <button
            type="button"
            disabled={reportBlocked}
            title={reportGate?.title}
            onClick={() => {
              if (reportBlocked || typeof onGenerateReport !== 'function') return;
              onGenerateReport();
            }}
            className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] ${
              reportBlocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-[var(--bg-surface-hover)]'
            }`}
            style={{
              borderColor: 'color-mix(in srgb, var(--accent-teal) 40%, transparent)',
              color: reportBlocked ? 'var(--text-tertiary)' : 'var(--accent-teal)',
            }}
          >
            <FileText className="h-3 w-3" aria-hidden />
            {reportBlocked ? reportGate?.label : 'Generate report'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide Automatic activity' : 'Show Automatic activity'}
          title={expanded ? 'Hide activity' : 'Show what happened'}
        >
          <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
            Activity
          </span>
          {expanded ? (
            <ChevronUp className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden />
          )}
        </button>
      </div>

      {expanded ? (
        <div
          className="border-t px-3 py-2 space-y-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent-teal) 22%, transparent)' }}
          role="region"
          aria-label="Automatic pipeline activity"
        >
          <ol className="space-y-1.5 m-0 p-0 list-none">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2">
                <StepGlyph status={step.status} />
                <div className="min-w-0 flex-1">
                  <div
                    className={
                      step.status === 'skipped' ? 'line-through' : undefined
                    }
                    style={{
                      color:
                        step.status === 'failed'
                          ? 'var(--error)'
                          : step.status === 'done' || step.status === 'running' || step.status === 'waiting'
                            ? 'var(--text-primary)'
                            : 'var(--text-tertiary)',
                      fontWeight:
                        step.status === 'running' || step.status === 'waiting' ? 600 : 400,
                    }}
                  >
                    {step.label}
                  </div>
                  {step.detail ? (
                    <div style={{ color: 'var(--text-tertiary)' }}>{step.detail}</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {events.length > 0 ? (
            <div>
              <div
                className="mb-1 font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Timeline
              </div>
              <ul className="m-0 max-h-28 overflow-y-auto space-y-1 p-0 list-none">
                {[...events].reverse().map((ev) => (
                  <li key={ev.id} className="flex gap-2">
                    <span
                      className="shrink-0 tabular-nums"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {formatEventTime(ev.at)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{ev.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {phase === 'failed' ? (
            <p className="m-0" style={{ color: 'var(--error)' }}>
              Automatic paused. Fix the step above or switch the case to Manual.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
