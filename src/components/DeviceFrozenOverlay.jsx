import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorSmartphone } from 'lucide-react';
import { performLogout } from '@/lib/logout';
import { Button } from '@/components/ui/button';

/**
 * Non-dismissible takeover for a blocking device error (`*_DEVICE_FROZEN`,
 * `*_DEVICE_LIMIT_REACHED`). Free and Beta allow 2 registered devices but only 1 active, so the
 * second tab has to be told plainly which way out it has: what happened, why, and the one next
 * action.
 *
 * There is no "claim this session" endpoint yet, so the primary action is Retry: the other
 * session going away is what actually unblocks this one.
 */

const Meter = ({ label, count, limit }) => {
  const known = Number.isFinite(Number(count)) && Number(limit) > 0;
  const over = known && Number(count) > Number(limit);
  const pct = known ? Math.min(100, Math.round((Number(count) / Number(limit)) * 100)) : 100;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium tabular-nums text-foreground">{`${count ?? '—'} of ${limit} allowed`}</dd>
      </div>
      <div
        className="wb-track mt-2"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Number(limit)}
        aria-valuenow={known ? Number(count) : undefined}
      >
        {/* Status colour only when the count is actually over its allowance. */}
        <div className="wb-fill" style={{ width: `${pct}%`, ...(over ? { backgroundColor: 'var(--error)' } : null) }} />
      </div>
    </div>
  );
};

const DeviceFrozenOverlay = ({ descriptor, devices, onRetry }) => {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  if (!descriptor) return null;

  const isRegisteredLimit = descriptor.family === 'deviceLimit';
  const heading = isRegisteredLimit ? 'Too many registered devices' : 'Too many active sessions';

  const facts = [];
  if (devices?.activeLimit != null) {
    facts.push({ label: 'Active sessions', count: devices.activeCount, limit: devices.activeLimit });
  }
  if (devices?.registeredLimit != null) {
    facts.push({ label: 'Registered devices', count: devices.registeredCount, limit: devices.registeredLimit });
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
      className="wb-scope wb-fade fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]"
      style={{ backgroundColor: 'hsl(var(--wb-bg) / 0.96)' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="device-frozen-title"
      aria-describedby="device-frozen-desc"
    >
      <div className="wb-card wb-rise w-full max-w-md p-6 shadow-[var(--shadow-lg)]" style={{ borderRadius: 20 }}>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--error)]/25 bg-[var(--error-soft)] text-[var(--error)]">
            <MonitorSmartphone className="size-5" aria-hidden="true" />
          </span>
          <span className="wb-status" data-state="failed">{descriptor.title || 'Session paused on this device'}</span>
        </div>

        <h2 id="device-frozen-title" className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          {heading}
        </h2>

        <p className="mt-4 text-xs font-medium text-muted-foreground">What happened</p>
        <p id="device-frozen-desc" className="mt-1 text-sm leading-6 text-foreground">
          {descriptor.message}
        </p>

        {facts.length > 0 && (
          <>
            <p className="mt-4 text-xs font-medium text-muted-foreground">Why</p>
            <dl className="mt-1.5 divide-y divide-[hsl(var(--wb-line))] rounded-2xl border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-bg))]">
              {facts.map((f) => (
                <Meter key={f.label} {...f} />
              ))}
            </dl>
          </>
        )}

        <p className="mt-4 text-xs font-medium text-muted-foreground">Next</p>
        <p className="mt-1 rounded-2xl bg-[hsl(var(--brand-50))] px-3.5 py-2.5 text-[13px] leading-5 text-[hsl(var(--brand-700))]">
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
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeviceFrozenOverlay;
