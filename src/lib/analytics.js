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

// SECURITY (S-060, 17 Oct 2026 fix): with a PostHog key set, $current_url (and friends) used to
// send the full URL -- including the password-reset oobCode query param and a conversation id in
// the path (/app/<uuid>) -- to PostHog US. Build-time kill switch
// VITE_SECURITY_POSTHOG_RAW_URLS (unset = scrubbed, the safe default).
const POSTHOG_RAW_URLS_ALLOWED = import.meta.env.VITE_SECURITY_POSTHOG_RAW_URLS === 'true';
const URL_PROPERTIES = ['$current_url', '$referrer', '$initial_current_url', '$pathname'];

/** Strip query string + fragment, then generalise /app/<id> -> /app/:id. Pure function so it's
 * directly testable without the PostHog SDK. */
export function scrubUrlValue(raw) {
  if (typeof raw !== 'string' || !raw) return raw;
  let url;
  try {
    // Absolute or relative (only a path/query/hash) -- give it a dummy base if relative.
    url = new URL(raw, 'https://scrub.invalid');
  } catch {
    return raw;
  }
  const path = url.pathname.replace(/\/app\/[^/]+/, '/app/:id');
  return raw.startsWith('http') ? `${url.origin}${path}` : path;
}

/** True when this pageview/event is on the password-reset / email-action route -- the whole
 * event is dropped, not just the URL scrubbed, since the oobCode query param is the one piece of
 * data whose mere presence (even truncated or hashed) could matter. */
export function isAuthActionEvent(properties) {
  const candidates = [
    properties?.$current_url, properties?.$pathname, properties?.current_url, properties?.pathname,
  ].filter((v) => typeof v === 'string');
  return candidates.some((v) => {
    try {
      return new URL(v, 'https://scrub.invalid').pathname.startsWith('/auth/action');
    } catch {
      return v.startsWith('/auth/action');
    }
  });
}

/** PostHog before_send hook: drops auth-action events entirely, scrubs URL-bearing properties on
 * everything else. Exported standalone (not inlined into posthog.init) so it's unit-testable.
 *
 * The auth-action drop is UNCONDITIONAL -- not gated by VITE_SECURITY_POSTHOG_RAW_URLS. That kill
 * switch exists for local URL-hygiene debugging (seeing real /app/<id> paths in a dev PostHog
 * project), not for re-exposing a password-reset oobCode, which is a live secret, not just a path
 * we'd rather generalise. */
export function scrubPostHogEvent(event) {
  if (!event || !event.properties) return event;
  if (isAuthActionEvent(event.properties)) return null;
  if (POSTHOG_RAW_URLS_ALLOWED) return event;
  for (const key of URL_PROPERTIES) {
    if (key in event.properties) {
      event.properties[key] = scrubUrlValue(event.properties[key]);
    }
  }
  return event;
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
      // PHI safety (clinical genomic data): the app renders patient variant tables and
      // accepts uploads. PostHog autocapture, session recording, and heatmaps would
      // sweep DOM text / input values / click positions on those pages to PostHog,
      // outside our AWS boundary. Disable all three — we send only explicit, curated
      // events (conversation_id, tier) plus a pseudonymous Firebase UID via identify().
      // No clinical data leaves the client.
      autocapture: false,
      disable_session_recording: true,
      enable_heatmaps: false,
      // SECURITY (S-060, 17 Oct 2026 fix): these default to capturing on PostHog's own side
      // (exceptions, dead clicks, web vitals, surveys, feature-flag requests) -- none of them
      // were explicitly pinned off before, so a PostHog SDK/defaults-bundle update could turn any
      // of them on silently.
      capture_exceptions: false,
      capture_dead_clicks: false,
      capture_performance: false,
      disable_surveys: true,
      advanced_disable_flags: true,
      before_send: scrubPostHogEvent,
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
