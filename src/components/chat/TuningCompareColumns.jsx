/**
 * Inline two-column compare, rendered INSIDE the chat thread (not a floating panel).
 *
 * baseline | your-config, each a REAL markdown answer via the same <Markdown> the chat uses, so a
 * tuning compare reads like the conversation ran twice side by side. Admin-only; only mounts when a
 * compare is active and has produced (or is producing) output. See useTuningCompare for the state.
 */

import React from 'react';
import { Loader2, Check } from 'lucide-react';
import { Markdown } from '@/components/chat/ChatMarkdown';
import { COLUMN_LABELS } from '@/services/streamCompare';

function Column({ col, data, running }) {
  const isCandidate = col === 'candidate';
  return (
    <div
      className={`flex min-h-[7rem] flex-col rounded-2xl border bg-[var(--bg-surface)] p-4 ${
        isCandidate ? 'border-[var(--accent-teal)]/40' : 'border-[var(--border-subtle)]'
      }`}
    >
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isCandidate ? 'bg-[var(--accent-teal)]' : 'bg-[var(--text-tertiary)]'
            }`}
            aria-hidden
          />
          {COLUMN_LABELS[col]}
        </span>
        {data.done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]">
            <Check className="h-3 w-3" aria-hidden /> done
          </span>
        ) : running ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> streaming
          </span>
        ) : null}
      </div>
      {data.error ? (
        <div className="whitespace-pre-wrap rounded-lg bg-[var(--error-soft)] p-2 text-[13px] text-[var(--error)]">
          {typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}
        </div>
      ) : data.text ? (
        <div className="chat-prose min-w-0" style={{ color: 'var(--text-primary)' }}>
          <Markdown className="break-words">{data.text}</Markdown>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {running ? 'thinking…' : '(no output yet)'}
        </div>
      )}
    </div>
  );
}

export default function TuningCompareColumns({ acc, running, error, question }) {
  const base = acc.state.baseline;
  const cand = acc.state.candidate;
  return (
    <div className="w-full">
      {question ? (
        <div className="mb-2 text-xs text-[var(--text-tertiary)]">
          Tuning compare for: <span className="text-[var(--text-secondary)]">“{question}”</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Column col="baseline" data={base} running={running && !base.done} />
        <Column col="candidate" data={cand} running={running && !cand.done} />
      </div>
      {error ? (
        <div className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--error-soft)] p-2 text-[13px] text-[var(--error)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
