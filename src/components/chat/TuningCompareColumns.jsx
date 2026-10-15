/**
 * Inline two-column compare, rendered INSIDE the chat thread (not a floating panel).
 *
 * baseline | your-config, each a REAL markdown answer via the same <Markdown> the chat uses, so a
 * tuning compare reads like the conversation ran twice side by side. Admin-only; only mounts when a
 * compare is active and has produced (or is producing) output. See useTuningCompare for the state.
 */

import React from 'react';
import { Markdown } from '@/components/chat/ChatMarkdown';
import { COLUMN_LABELS } from '@/services/streamCompare';

function Column({ col, data, running }) {
  const isCandidate = col === 'candidate';
  const streaming = running && !data.done;
  return (
    <section
      aria-label={COLUMN_LABELS[col]}
      className={`flex min-h-[7rem] min-w-0 flex-col rounded-lg border bg-[var(--bg-surface)] p-3.5 ${
        isCandidate ? 'border-[var(--accent-teal)]/45' : 'border-[var(--border-default)]'
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isCandidate ? 'bg-[var(--accent-teal)]' : 'bg-[var(--text-tertiary)]'
            }`}
            aria-hidden
          />
          {COLUMN_LABELS[col]}
        </span>
        {data.done ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />
            Done
          </span>
        ) : running ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <span className="chat-thinking-dot" aria-hidden />
            Streaming
          </span>
        ) : null}
      </div>
      {data.error ? (
        <div className="whitespace-pre-wrap rounded-md bg-[var(--error-soft)] p-2 text-[13px] text-[var(--text-primary)]" role="alert">
          <span className="font-medium text-[var(--error)]">Failed. </span>
          {typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}
        </div>
      ) : data.text ? (
        <div className="min-w-0" style={{ color: 'var(--text-primary)' }}>
          <Markdown className="break-words" streaming={streaming}>{data.text}</Markdown>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
          {running ? <span className="chat-thinking-dot" aria-hidden /> : null}
          {running ? 'Waiting for the first tokens…' : 'No output yet.'}
        </div>
      )}
    </section>
  );
}

export default function TuningCompareColumns({ acc, running, error, question }) {
  const base = acc.state.baseline;
  const cand = acc.state.candidate;
  return (
    <div className="w-full">
      {question ? (
        <div className="mb-2 text-xs text-[var(--text-tertiary)]">
          Tuning compare for <span className="text-[var(--text-secondary)]">“{question}”</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Column col="baseline" data={base} running={running && !base.done} />
        <Column col="candidate" data={cand} running={running && !cand.done} />
      </div>
      {error ? (
        <div className="mt-2 whitespace-pre-wrap rounded-md bg-[var(--error-soft)] p-2 text-[13px] text-[var(--text-primary)]" role="alert">
          <span className="font-medium text-[var(--error)]">Failed. </span>
          {error}
        </div>
      ) : null}
    </div>
  );
}
