/**
 * Admin tuning — a panel docked on the right of the chat, opened from the Tuning button in the
 * chat header. One place for the whole loop: see what you've overridden, open the full editor,
 * ask a question, run the comparison. The side-by-side ANSWER still renders inline in the thread
 * (TuningCompareColumns), so the chat stays readable next to the panel.
 *
 * Scope discipline (unchanged):
 *  - ADMIN-ONLY. Renders nothing unless the hook reports isAdmin. The backend independently 403s the
 *    compare endpoint, so hiding the UI is convenience, not the security boundary.
 *  - WHEN CLOSED, NOTHING CHANGES. No compare request, no second column — normal chat runs untouched.
 *  - Overrides only affect this admin's comparisons; promoting them to global config stays a
 *    separate admin PUT ("Copy config").
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Pencil, Play, RotateCcw, Sliders, Square, X } from 'lucide-react';
import { buildOverridesHeader } from '@/services/streamCompare';
import TuningConfigModal from '@/components/TuningConfigModal';

const BUTTON_BASE =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]';
const BUTTON_TONES = {
  default: 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]',
  primary: 'border-transparent bg-[var(--accent-teal)] text-[var(--accent-teal-contrast)] hover:bg-[var(--accent-teal-hover)]',
  ghost: 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]',
  danger: 'border-[var(--error)] bg-transparent text-[var(--error)] hover:bg-[var(--error-soft)]',
};

function PanelButton({ tone = 'default', icon: Icon, spin = false, className = '', children, ...props }) {
  return (
    <button type="button" {...props} className={`${BUTTON_BASE} ${BUTTON_TONES[tone]} ${className}`}>
      {Icon ? <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden /> : null}
      {children}
    </button>
  );
}

function SectionHeading({ children, aside }) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <h3 className="text-xs font-semibold text-[var(--text-primary)]">{children}</h3>
      {aside}
    </div>
  );
}

const PANEL_WIDTH = 380;

const preview = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\s+/g, ' ').trim().slice(0, 90);
};

/**
 * @param tuning        the shared useTuningCompare() instance (owned by ChatPage).
 * @param open          whether the panel is showing.
 * @param onClose       closes the panel.
 * @param composerText  what's typed in the chat composer; prefills the question.
 */
export default function TuningMode({ tuning, open, onClose, composerText = '' }) {
  const {
    isAdmin, overrides, setOverride, resetAll, baseline, configError, reloadConfig,
    dirtyKeys, running, run, abort, hasColumns,
  } = tuning;
  const [editorKey, setEditorKey] = useState(null); // null = closed, '' = open on default key
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [question, setQuestion] = useState('');
  const questionRef = useRef(null);

  // Opening the panel picks up whatever is in the composer, if the box is still empty.
  useEffect(() => {
    if (open && !question && composerText.trim()) setQuestion(composerText.trim());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Make room for the panel in the chat layout (App.css .chat-app-shell padding-right).
  useEffect(() => {
    const root = document.documentElement;
    if (open && isAdmin && window.innerWidth >= 1024) root.style.setProperty('--tuning-panel-width', `${PANEL_WIDTH}px`);
    else root.style.removeProperty('--tuning-panel-width');
    return () => root.style.removeProperty('--tuning-panel-width');
  }, [open, isAdmin]);

  useEffect(() => {
    if (!confirmReset) return undefined;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  if (!isAdmin) return null; // non-admins never see this at all

  const canRun = !running && Boolean(question.trim());
  const copyConfig = () => {
    navigator.clipboard?.writeText(buildOverridesHeader(overrides) || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {open && (
        <aside
          aria-label="Tuning"
          // Above the floating Standard / Explore switch (z 9999), below the editor (z 10010).
          className="fixed right-0 top-0 bottom-0 z-[10001] flex w-full max-w-[380px] flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-xl)]"
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4">
            <Sliders className="h-4 w-4 text-[var(--accent-teal)]" aria-hidden />
            <h2 className="flex-1 text-sm font-semibold text-[var(--text-primary)]">Tuning</h2>
            <span className="rounded-full bg-[var(--bg-surface-hover)] px-2 py-0.5 text-2xs font-medium text-[var(--text-secondary)]">
              Admin only
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tuning"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              Change prompts, models or personas for your own comparisons. Nothing here changes what
              other users get.
            </p>

            {/* Overrides */}
            <section>
              <SectionHeading
                aside={
                  <PanelButton icon={Pencil} onClick={() => setEditorKey('')}>
                    Edit config
                  </PanelButton>
                }
              >
                Your changes{dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}
              </SectionHeading>
              {configError ? (
                <div className="rounded-lg bg-[var(--error-soft)] p-3 text-xs text-[var(--error)]">
                  Could not load the config: {configError}{' '}
                  <button type="button" onClick={reloadConfig} className="underline underline-offset-2">Retry</button>
                </div>
              ) : dirtyKeys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border-default)] p-3 text-xs leading-relaxed text-[var(--text-tertiary)]">
                  No changes yet. Everything uses the global config. Open <span className="text-[var(--text-secondary)]">Edit config</span> to change a prompt or model.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-default)]">
                  {dirtyKeys.map(([key, value]) => (
                    <li key={key} className="flex items-start gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[11px] font-medium text-[var(--text-primary)]">{key}</div>
                        <div className="mt-0.5 truncate text-2xs text-[var(--text-tertiary)]">{preview(value)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditorKey(key)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverride(key, '')}
                        className="shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--error)]"
                      >
                        Revert
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Compare */}
            <section>
              <SectionHeading>Compare</SectionHeading>
              <label htmlFor="tuning-question" className="sr-only">Question to compare</label>
              <textarea
                id="tuning-question"
                ref={questionRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canRun) run(question);
                }}
                rows={3}
                placeholder="Ask something to compare, e.g. “Which variants look pathogenic?”"
                className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-xs leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-teal)]"
              />
              {composerText.trim() && composerText.trim() !== question.trim() ? (
                <button
                  type="button"
                  onClick={() => setQuestion(composerText.trim())}
                  className="mt-1 text-2xs text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
                >
                  Use what's in the chat box
                </button>
              ) : null}
              <p className="mt-2 text-2xs leading-relaxed text-[var(--text-tertiary)]">
                Runs the question twice — global config and your changes — and shows both answers side by side in the chat.
              </p>
              <div className="mt-3 flex items-center gap-2">
                {running ? (
                  <PanelButton tone="default" icon={Square} onClick={abort} className="flex-1">
                    Stop
                  </PanelButton>
                ) : (
                  <PanelButton
                    tone="primary"
                    icon={Play}
                    onClick={() => run(question)}
                    disabled={!canRun}
                    className="flex-1"
                    title={canRun ? 'Run (⌘/Ctrl + Enter)' : 'Type a question first.'}
                  >
                    Run comparison
                  </PanelButton>
                )}
              </div>
              {running ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-2xs text-[var(--text-secondary)]">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Comparing… answers stream into the chat.
                </p>
              ) : null}
            </section>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
            <PanelButton
              icon={copied ? Check : Copy}
              onClick={copyConfig}
              disabled={!dirtyKeys.length}
              title="Copy your changes as JSON. Making them global is a separate admin step."
            >
              {copied ? 'Copied' : 'Copy config'}
            </PanelButton>
            <PanelButton
              tone={confirmReset ? 'danger' : 'ghost'}
              icon={RotateCcw}
              disabled={!dirtyKeys.length && !hasColumns}
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  return;
                }
                setConfirmReset(false);
                resetAll();
              }}
            >
              {confirmReset ? 'Click again to reset' : 'Reset all'}
            </PanelButton>
          </div>
        </aside>
      )}

      <TuningConfigModal
        open={editorKey !== null}
        initialKey={editorKey || null}
        onClose={() => setEditorKey(null)}
        baseline={baseline}
        configError={configError}
        reloadConfig={reloadConfig}
        overrides={overrides}
        setOverride={setOverride}
      />
    </>
  );
}
