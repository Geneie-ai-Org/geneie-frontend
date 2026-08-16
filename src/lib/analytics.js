import { env, isPostHogConfigured } from '@/config/env';

/**
 * PostHog wrapper. Every export is a no-op when VITE_POSTHOG_KEY is unset, so
 * local dev and CI don't need a key and don't pollute production analytics.
 *
 * posthog-js is ~220 kB of the shared entry chunk and is never needed to render
 * a frame, so it is imported dynamically after boot. Calls made before it lands
 * are queued and replayed in order rather than dropped.
 */

let started = false;
let posthog = null;
const pending = [];

function enqueue(method, args) {
  if (!started) return;
  if (posthog) {
    posthog[method](...args);
  } else {
    pending.push([method, args]);
  }
}

export function initAnalytics() {
  if (started || !import.meta.env.PROD || !isPostHogConfigured()) return;
  started = true;

  import('posthog-js').then(({ default: loaded }) => {
    loaded.init(env.posthog.key, {
      api_host: env.posthog.host,
      // Opts into current PostHog defaults, incl. SPA pageview capture on history
      // changes — without this, react-router navigations are never recorded.
      defaults: '2025-05-24',
    });
    posthog = loaded;
    for (const [method, args] of pending.splice(0)) {
      posthog[method](...args);
    }
  });
}

/** Tie events to a Firebase UID. Tier is sent as a person property. */
export function identifyUser(userId, tier) {
  enqueue('identify', [userId, { tier }]);
}

/** Call on sign-out so the next visitor isn't attributed to the previous user. */
export function resetAnalytics() {
  enqueue('reset', []);
}

/** Track a product event, e.g. capture('annovar_started', { conversation_id }). */
export function capture(event, properties) {
  enqueue('capture', [event, properties]);
}
