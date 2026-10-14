/**
 * When to keep re-checking /api/chat-eligibility after a pipeline job (filter, Exomiser, GA)
 * finishes. The backend settles in steps — filter load, enrichment, advanced-chat indexing (a
 * brief second index runs after GA) — so a single refresh can land mid-way and leave chat
 * greyed out until a reload.
 *
 * Pure and dependency-free so it can be exercised on its own.
 */

// Reasons that mean "not yet, but on its way".
const TRANSIENT_REASONS = new Set([
  'ENRICHMENT_RUNNING',
  'ENRICHMENT_PENDING',
  'FILTER_JOB_RUNNING',
]);

/** Roughly 9 minutes: 20 checks at 3 s, then 100 at 5 s. Longer waits are left to the page's own poll. */
export const ELIGIBILITY_SETTLE_MAX_TICKS = 120;

/** 3 s for the first minute, then 5 s. */
export function eligibilitySettleDelayMs(tick) {
  return tick < 20 ? 3000 : 5000;
}

/**
 * ADVANCED_CHAT_INDEXING is transient unless the index build failed. After GA completes the
 * backend briefly re-indexes (~10 s) while advanced_chat_status may still read 'ready' — that
 * is "preparing", not an error.
 */
export function isIndexingTransient(eligibility) {
  return eligibility?.reason === 'ADVANCED_CHAT_INDEXING' && eligibility?.advanced_chat_status !== 'failed';
}

/**
 * Is this eligibility answer still settling?
 *
 * @param {object|null} eligibility  the /api/chat-eligibility payload; null = no answer (fetch
 *   failed or not asked yet), which is treated as "keep trying".
 * @param {{ activeProprietaryFilter?: string|null }} [ctx]
 */
export function isEligibilitySettling(eligibility, { activeProprietaryFilter = null } = {}) {
  if (!eligibility) return true;
  if (eligibility.allowed === true) return false;
  const reason = eligibility.reason || null;
  if (TRANSIENT_REASONS.has(reason)) return true;
  if (isIndexingTransient(eligibility)) return true;
  if (reason === 'CHAT_REQUIRES_FILTER') {
    // With a filter applied, "requires filter" means the filtered set hasn't loaded yet.
    return Boolean(activeProprietaryFilter) || /not loaded yet/i.test(String(eligibility.message || ''));
  }
  // Unknown (`allowed: null` with no reason) is the optimistic state set while work starts.
  if (eligibility.allowed == null && !reason) return true;
  return false;
}

/**
 * Decide the next step of a settle loop.
 * @returns {{ keepPolling: boolean, delayMs: number }}
 */
export function nextEligibilitySettleStep(eligibility, { tick = 0, activeProprietaryFilter = null } = {}) {
  if (tick >= ELIGIBILITY_SETTLE_MAX_TICKS) return { keepPolling: false, delayMs: 0 };
  if (!isEligibilitySettling(eligibility, { activeProprietaryFilter })) return { keepPolling: false, delayMs: 0 };
  return { keepPolling: true, delayMs: eligibilitySettleDelayMs(tick) };
}
