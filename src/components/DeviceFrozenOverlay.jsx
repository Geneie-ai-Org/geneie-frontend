import { useNavigate } from 'react-router-dom';
import { performLogout } from '@/lib/logout';

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
  if (!descriptor) return null;

  const counts = [];
  if (devices?.activeLimit != null) {
    counts.push(`${devices.activeCount ?? '—'} of ${devices.activeLimit} active`);
  }
  if (devices?.registeredLimit != null) {
    counts.push(`${devices.registeredCount ?? '—'} of ${devices.registeredLimit} registered`);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-app)' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="device-frozen-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}
      >
        <h2
          id="device-frozen-title"
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {descriptor.title}
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {descriptor.message}
        </p>
        {counts.length > 0 && (
          <p className="text-2xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
            Devices: {counts.join(' · ')}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-sm font-semibold rounded-lg"
            style={{ backgroundColor: 'var(--accent-teal)', color: 'var(--accent-teal-contrast)' }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="px-4 py-2 text-sm font-medium rounded-lg border"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceFrozenOverlay;
