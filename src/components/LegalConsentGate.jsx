import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { ArrowUpRight } from 'lucide-react';
import { apiUrl } from '@/config/api';
import { getAuthHeaders } from '@/services/backendApi';
import { Checkbox } from '@/components/ui/checkbox';
import { Dismissible, StageMark, StateButton } from '@/components/motion';

const GUEST_LEGAL_KEY = 'geneie.legalAccept.v1';

function readGuestAccept() {
  try {
    const raw = localStorage.getItem(GUEST_LEGAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeGuestAccept(termsVersion, privacyVersion) {
  const payload = {
    termsVersion,
    privacyVersion,
    acceptedAt: new Date().toISOString(),
  };
  localStorage.setItem(GUEST_LEGAL_KEY, JSON.stringify(payload));
  return payload;
}

function guestAccepted(required) {
  const g = readGuestAccept();
  if (!g || !required) return false;
  return (
    g.termsVersion === required.termsVersion &&
    g.privacyVersion === required.privacyVersion
  );
}

/**
 * Blocks /app until Terms + Privacy for the current version are accepted.
 * Signed-in: persisted via POST /api/legal/accept.
 * Guest: localStorage (same version keys).
 */
export default function LegalConsentGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(null);
  const [needsAccept, setNeedsAccept] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Keeps the last message so the error block can still show it while it collapses away.
  const lastError = useRef('');
  if (error) lastError.current = error;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const curRes = await fetch(apiUrl('/api/legal/current'));
      const cur = await curRes.json();
      setRequired(cur);

      const auth = getAuth();
      if (auth.currentUser) {
        const headers = await getAuthHeaders();
        const st = await fetch(apiUrl('/api/legal/status'), { headers });
        if (st.ok) {
          const body = await st.json();
          setNeedsAccept(!body.accepted);
        } else {
          // Fall back to guest-style check if status fails (e.g. brand-new user race)
          setNeedsAccept(!guestAccepted(cur));
        }
      } else {
        setNeedsAccept(!guestAccepted(cur));
      }
    } catch (e) {
      console.error('[legal] status failed', e);
      // Fail open for offline? Prefer fail closed for beta trust — show gate with error.
      setNeedsAccept(true);
      setError('Could not verify legal acceptance. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onAccept = async () => {
    if (!checked || !required) return;
    setSubmitting(true);
    setError('');
    try {
      const auth = getAuth();
      if (auth.currentUser) {
        const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
        const res = await fetch(apiUrl('/api/legal/accept'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            termsVersion: required.termsVersion,
            privacyVersion: required.privacyVersion,
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.detail || 'Accept failed');
        }
      } else {
        writeGuestAccept(required.termsVersion, required.privacyVersion);
      }
      setNeedsAccept(false);
    } catch (e) {
      setError(e.message || 'Accept failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="wb-scope flex min-h-dvh items-center justify-center"
      >
        <div
          className="wb-fade inline-flex h-10 items-center gap-2.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] pl-3 pr-4 text-[13px] text-muted-foreground"
          style={{ animationDelay: '180ms' }}
        >
          <span className="wb-spin-inline text-[hsl(var(--brand-500))]" aria-hidden="true" />
          Checking your agreement
        </div>
      </div>
    );
  }

  if (!needsAccept) {
    return children;
  }

  // Could not even load the current versions: there is nothing to accept yet, so the one
  // useful action is to retry (the gate stays closed).
  const loadFailed = !required;

  const docRow = (to, label, version) => (
    <Link
      to={to}
      target="_blank"
      rel="noreferrer"
      className="wb-row group min-h-11 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))]"
    >
      <span className="flex-1">{label}</span>
      {version ? <span className="wb-chip font-mono tabular-nums">v{version}</span> : null}
      <ArrowUpRight className="wb-chev size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );

  return (
    <div className="wb-scope wb-fade fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="wb-card wb-rise w-full max-w-md p-6 sm:p-7" style={{ borderRadius: 20 }}>
        {loadFailed ? (
          <>
            <span className="inline-flex size-11 items-center justify-center rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))]">
              <StageMark state="failed" size={24} />
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">We could not check your agreement</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {error || 'Check your connection and try again.'}
            </p>
            <StateButton
              state="idle"
              labels={{ idle: 'Try again' }}
              onClick={refresh}
              className="mt-6 h-11 w-full sm:h-10"
            />
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Review and accept to continue</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Geneie supports research and decision-making by qualified professionals. It is not a
              substitute for clinical judgment. Please read and accept the documents below to use the app.
            </p>

            <ul className="mt-5 space-y-2">
              <li>{docRow('/legal/terms', 'Terms of Use', required?.termsVersion)}</li>
              <li>{docRow('/legal/privacy', 'Privacy Policy', required?.privacyVersion)}</li>
            </ul>

            <label
              htmlFor="legal-accept"
              className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 text-sm leading-5"
            >
              <Checkbox
                id="legal-accept"
                checked={checked}
                onCheckedChange={(v) => setChecked(Boolean(v))}
                className="wb-spring-check mt-px size-5 rounded-full border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] data-[checked]:border-[hsl(var(--brand-solid))] data-[checked]:bg-[hsl(var(--brand-solid))] data-[checked]:text-[hsl(var(--on-brand))] focus-visible:ring-[hsl(var(--brand-300)/0.5)]"
              />
              <span>I have read and agree to the Terms of Use and Privacy Policy.</span>
            </label>

            <Dismissible show={Boolean(error)}>
              <p role="alert" className="mt-3 rounded-2xl border border-[var(--error)]/25 bg-[var(--error-soft)] px-3.5 py-2.5 text-sm text-[var(--error)]">
                {error || lastError.current}
              </p>
            </Dismissible>

            <StateButton
              state={submitting ? 'running' : 'idle'}
              labels={{ idle: 'Accept and continue', running: 'Saving…' }}
              onClick={onAccept}
              disabled={!checked || submitting}
              className="mt-5 h-11 w-full sm:h-10"
            />
            {!checked && (
              <p className="mt-2 text-center text-xs text-[var(--text-tertiary)]">
                Tick the box to enable this button.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
