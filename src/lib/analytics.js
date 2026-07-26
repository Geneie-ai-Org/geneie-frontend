import posthog from 'posthog-js';
import { env, isPostHogConfigured } from '@/config/env';

/**
 * PostHog wrapper. Every export is a no-op when VITE_POSTHOG_KEY is unset, so
 * local dev and CI don't need a key and don't pollute production analytics.
 */

let started = false;

export function initAnalytics() {
  if (started || !import.meta.env.PROD || !isPostHogConfigured()) return;
  started = true;

  posthog.init(env.posthog.key, {
    api_host: env.posthog.host,
    // Opts into current PostHog defaults, incl. SPA pageview capture on history
    // changes — without this, react-router navigations are never recorded.
    defaults: '2025-05-24',
  });
}

/** Tie events to a Firebase UID. Tier is sent as a person property. */
export function identifyUser(userId, tier) {
  if (!started) return;
  posthog.identify(userId, { tier });
}

/** Call on sign-out so the next visitor isn't attributed to the previous user. */
export function resetAnalytics() {
  if (!started) return;
  posthog.reset();
}

/** Track a product event, e.g. capture('annovar_started', { conversation_id }). */
export function capture(event, properties) {
  if (!started) return;
  posthog.capture(event, properties);
}
