/**
 * Admin tuning, opened from the Tuning button in the chat box: it goes straight to the config
 * editor. Tuning-wide actions (Copy config, Reset all, Turn off) sit in the editor's header; the
 * comparison itself is run from the chat box's Compare button, and its side-by-side ANSWER renders
 * inline in the thread (TuningCompareColumns).
 *
 * Scope discipline (unchanged):
 *  - ADMIN-ONLY. Renders nothing unless the hook reports isAdmin. The backend independently 403s the
 *    compare endpoint, so hiding the UI is convenience, not the security boundary.
 *  - WHEN OFF, NOTHING CHANGES. No compare request, no second column — normal chat runs untouched.
 *  - Overrides only affect this admin's comparisons; promoting them to global config stays a
 *    separate admin PUT ("Copy config").
 */

import React, { useEffect, useState } from 'react';
import { Check, Copy, Power, RotateCcw } from 'lucide-react';
import { buildOverridesHeader } from '@/services/streamCompare';
import TuningConfigModal from '@/components/TuningConfigModal';

const ACTION =
  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]';
const QUIET = `${ACTION} text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]`;

/**
 * @param tuning     the shared useTuningCompare() instance (owned by ChatPage).
 * @param open       whether the editor is showing.
 * @param onClose    closes it; tuning stays on.
 * @param onTurnOff  turns tuning off (and closes); saved changes are kept.
 */
export default function TuningMode({ tuning, open, onClose, onTurnOff }) {
  const { isAdmin, overrides, setOverride, resetAll, baseline, configError, reloadConfig, dirtyKeys, hasColumns } = tuning;
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!confirmReset) return undefined;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  if (!isAdmin) return null; // non-admins never see this at all

  const copyConfig = () => {
    navigator.clipboard?.writeText(buildOverridesHeader(overrides) || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const headerActions = (
    <>
      <button
        type="button"
        onClick={copyConfig}
        disabled={!dirtyKeys.length}
        className={QUIET}
        title="Copy your changes as JSON. Making them global is a separate admin step."
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? 'Copied' : 'Copy config'}
      </button>
      <button
        type="button"
        disabled={!dirtyKeys.length && !hasColumns}
        onClick={() => {
          if (!confirmReset) {
            setConfirmReset(true);
            return;
          }
          setConfirmReset(false);
          resetAll();
        }}
        className={
          confirmReset
            ? `${ACTION} border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error-soft)]`
            : QUIET
        }
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {confirmReset ? 'Click again to reset' : 'Reset all'}
      </button>
      <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" aria-hidden />
      {/* Off = no Compare button in the chat box and no comparison columns; changes stay saved. */}
      <button type="button" onClick={onTurnOff} className={QUIET}>
        <Power className="h-3.5 w-3.5" aria-hidden />
        Turn off
      </button>
    </>
  );

  return (
    <TuningConfigModal
      open={open}
      onClose={onClose}
      baseline={baseline}
      configError={configError}
      reloadConfig={reloadConfig}
      overrides={overrides}
      setOverride={setOverride}
      headerActions={headerActions}
    />
  );
}
