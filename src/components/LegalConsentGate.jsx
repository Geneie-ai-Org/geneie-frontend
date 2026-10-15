import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { apiUrl } from '@/config/api';
import { getAuthHeaders } from '@/services/backendApi';
import { Button } from '@/components/ui/button';

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
        className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Checking your agreement…
      </div>
    );
  }

  if (!needsAccept) {
    return children;
  }

  // Could not even load the current versions: there is nothing to accept yet, so the one
  // useful action is to retry (the gate stays closed).
  const loadFailed = !required;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background p-5">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">
          {loadFailed ? 'We could not check your agreement' : 'Review and accept to continue'}
        </h1>

        {loadFailed ? (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {error || 'Check your connection and try again.'}
            </p>
            <Button className="mt-6 h-11 w-full sm:h-10" onClick={refresh}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Geneie supports research and decision-making by qualified professionals. It is not a
              substitute for clinical judgment. Please read and accept the documents below to use the app.
            </p>

            <ul className="mt-5 divide-y divide-border rounded-lg border border-border text-sm">
              <li className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/legal/terms" target="_blank" rel="noreferrer">
                  Terms of Use
                </Link>
                {required?.termsVersion ? (
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">v{required.termsVersion}</span>
                ) : null}
              </li>
              <li className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Link className="font-medium text-primary underline-offset-2 hover:underline" to="/legal/privacy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </Link>
                {required?.privacyVersion ? (
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">v{required.privacyVersion}</span>
                ) : null}
              </li>
            </ul>

            <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-5">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>I have read and agree to the Terms of Use and Privacy Policy.</span>
            </label>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-[var(--error)]">
                {error}
              </p>
            ) : null}

            <Button
              className="mt-5 h-11 w-full sm:h-10"
              disabled={!checked || submitting}
              onClick={onAccept}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
                </>
              ) : (
                'Accept and continue'
              )}
            </Button>
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
