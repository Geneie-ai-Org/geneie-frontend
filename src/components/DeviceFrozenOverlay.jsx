import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { performLogout } from '@/lib/logout';
import { Button } from '@/components/ui/button';

/**
 * Non-dismissible takeover for a blocking device error (`*_DEVICE_FROZEN`,
 * `*_DEVICE_LIMIT_REACHED`). Free and Beta allow 2 registered devices but only 1 active, so the
 * second tab has to be told plainly which way out it has.
 *
 * There is no "claim this session" endpoint yet, so the primary action is Retry: the other
 * session going away is what actually unblocks this one.
 */
const DeviceFrozenOverlay = ({ descriptor, devices, onRetry }) => {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  if (!descriptor) return null;

  const isRegisteredLimit = descriptor.family === 'deviceLimit';
  const heading = isRegisteredLimit ? 'Too many registered devices' : 'Too many active sessions';

  const facts = [];
  if (devices?.activeLimit != null) {
    facts.push({ label: 'Active sessions', value: `${devices.activeCount ?? '—'} of ${devices.activeLimit} allowed` });
  }
  if (devices?.registeredLimit != null) {
    facts.push({ label: 'Registered devices', value: `${devices.registeredCount ?? '—'} of ${devices.registeredLimit} allowed` });
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await performLogout(navigate);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-5 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="device-frozen-title"
      aria-describedby="device-frozen-desc"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[var(--elevation-lg)]">
        <h2 id="device-frozen-title" className="text-lg font-semibold tracking-tight text-foreground">
          {heading}
        </h2>
        <p id="device-frozen-desc" className="mt-2 text-sm leading-6 text-muted-foreground">
          {descriptor.message}
        </p>

        {facts.length > 0 && (
          <dl className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
            {facts.map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-3 px-3 py-2">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="font-medium tabular-nums text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-4 text-xs leading-5 text-[var(--text-tertiary)]">
          Close Geneie on the other device, then try again. Or sign out here and sign back in.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" onClick={onRetry} disabled={signingOut} autoFocus className="h-11 sm:h-10 sm:px-5">
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="h-11 sm:h-10 sm:px-5"
          >
            {signingOut && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeviceFrozenOverlay;
