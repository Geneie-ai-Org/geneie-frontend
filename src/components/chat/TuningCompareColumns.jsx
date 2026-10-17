/**
 * Tuning comparison, rendered INSIDE the chat thread at normal reply width.
 *
 * One answer block with a Global config | Your changes switch on top, so it reads like an ordinary
 * reply and stays readable in the chat column; flip between the two answers to compare. Each side
 * streams independently, so the switch shows a spinner or a check per side, and the line next to
 * it gives the shown answer's time and length. Admin-only; see useTuningCompare for the state.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Markdown } from '@/components/chat/ChatMarkdown';
import { COLUMN_LABELS } from '@/services/streamCompare';

const SIDES = ['baseline', 'candidate'];

function wordCount(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function stats(data, now) {
  const end = data.finishedAt || (data.done ? null : now);
  const secs = end && data.startedAt ? (end - data.startedAt) / 1000 : null;
  const parts = [];
  if (secs != null) parts.push(`${secs.toFixed(1)}s`);
  const words = wordCount(data.text);
  if (words) parts.push(`${words} words`);
  return parts.join(' · ');
}

function SideStatus({ data, running }) {
  if (data.error) return <AlertCircle className="h-3.5 w-3.5 text-[var(--error)]" aria-label="failed" />;
  if (data.done) return <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-label="done" />;
  if (running) return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" aria-label="streaming" />;
  return null;
}

export default function TuningCompareColumns({ acc, running, error, question }) {
  // Default to your version — it's the one being tested; the global answer is one click away.
  const [side, setSide] = useState('candidate');
  const [now, setNow] = useState(() => Date.now());

  // Tick while streaming so the elapsed time counts up.
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const data = acc.state[side];
  const sideRunning = running && !data.done;

  return (
    <div className="w-full">
      {question ? (
        <div className="mb-2 text-xs text-[var(--text-tertiary)]">
          <span className="font-medium text-[var(--text-secondary)]">Comparison</span> · “
          <span className="text-[var(--text-primary)]">{question}</span>”
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Which answer to show"
          className="inline-flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
        >
          {SIDES.map((key) => {
            const active = key === side;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSide(key)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                style={{
                  backgroundColor: active ? 'hsl(var(--background))' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                {COLUMN_LABELS[key]}
                <SideStatus data={acc.state[key]} running={running} />
              </button>
            );
          })}
        </div>
        <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{stats(data, now)}</span>
      </div>

      <div role="tabpanel" aria-label={COLUMN_LABELS[side]}>
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
            {sideRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {sideRunning ? 'Thinking…' : 'No output.'}
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--error-soft)] p-2 text-[13px] text-[var(--error)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
