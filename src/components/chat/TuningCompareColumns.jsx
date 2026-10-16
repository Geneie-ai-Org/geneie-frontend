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
  const failed = Boolean(data.error);
  return (
    <section
      aria-label={COLUMN_LABELS[col]}
      className={`wb-card flex min-h-[7rem] min-w-0 flex-col p-3.5 ${
        isCandidate ? '!border-[hsl(var(--brand-300))]' : ''
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-[hsl(var(--wb-line))] pb-2.5">
        <span className="wb-chip" data-tone={isCandidate ? 'brand' : undefined}>
          {COLUMN_LABELS[col]}
        </span>
        {failed ? (
          <span className="wb-status wb-pop" data-state="failed">Failed</span>
        ) : data.done ? (
          <span className="wb-status wb-pop" data-state="done">Done</span>
        ) : running ? (
          <span className="wb-status" data-state="running">Streaming</span>
        ) : null}
      </div>
      {data.error ? (
        <div className="whitespace-pre-wrap rounded-2xl bg-[var(--error-soft)] px-3 py-2 text-[13px] text-[var(--text-primary)]" role="alert">
          <span className="font-medium text-[var(--error)]">Failed. </span>
          {typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}
        </div>
      ) : data.text ? (
        <div className="min-w-0" style={{ color: 'var(--text-primary)' }}>
          <Markdown className="break-words" streaming={streaming}>{data.text}</Markdown>
        </div>
      ) : running ? (
        <div className="space-y-2" role="status" aria-label="Waiting for the first tokens">
          <div className="wb-shimmer h-3.5 w-4/5 rounded-full" />
          <div className="wb-shimmer h-3.5 w-3/5 rounded-full" />
          <div className="wb-shimmer h-3.5 w-2/5 rounded-full" />
        </div>
      ) : (
        <div className="text-[13px] text-muted-foreground">No output yet.</div>
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
        <div className="mb-2 text-xs text-muted-foreground">
          Tuning compare for <span className="text-[var(--text-secondary)]">&ldquo;{question}&rdquo;</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Column col="baseline" data={base} running={running && !base.done} />
        <Column col="candidate" data={cand} running={running && !cand.done} />
      </div>
      {error ? (
        <div className="mt-2 whitespace-pre-wrap rounded-2xl bg-[var(--error-soft)] px-3 py-2 text-[13px] text-[var(--text-primary)]" role="alert">
          <span className="font-medium text-[var(--error)]">Failed. </span>
          {error}
        </div>
      ) : null}
    </div>
  );
}
