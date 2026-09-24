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
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!needsAccept) {
    return children;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h1 className="text-xl font-semibold tracking-tight">Before you continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Geneie is a research and decision-support tool — not a substitute for clinical judgment.
          Please review and accept our Terms and Privacy Policy to use the app.
        </p>
        <ul className="mt-4 space-y-1 text-sm">
          <li>
            <Link className="text-primary underline" to="/legal/terms" target="_blank" rel="noreferrer">
              Terms of Use
            </Link>
            {required?.termsVersion ? (
              <span className="text-muted-foreground"> (v{required.termsVersion})</span>
            ) : null}
          </li>
          <li>
            <Link className="text-primary underline" to="/legal/privacy" target="_blank" rel="noreferrer">
              Privacy Policy
            </Link>
            {required?.privacyVersion ? (
              <span className="text-muted-foreground"> (v{required.privacyVersion})</span>
            ) : null}
          </li>
        </ul>
        <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>I have read and agree to the Terms of Use and Privacy Policy.</span>
        </label>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button
          className="mt-5 w-full"
          disabled={!checked || submitting}
          onClick={onAccept}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            'Accept and continue'
          )}
        </Button>
      </div>
    </div>
  );
}
