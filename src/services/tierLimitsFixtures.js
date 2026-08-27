/**
 * Canned `subscription-status` payloads for local cohort testing.
 *
 * Used ONLY behind `import.meta.env.DEV` in useAuth via `?tierdebug=<cohort>`, so the branch and
 * therefore this import are eliminated from production builds. There is no test runner in this
 * repo; this is how the five cohorts get exercised by hand.
 */

export const TIER_DEBUG_FIXTURES = {
  free: {
    planStatus: 'free',
    freeLimits: {
      module1: { limit: 0, remaining: 0, stagingOnly: true },
      module2: { limit: 3, remaining: 3 },
      chat: { limit: 60, used: 0, remaining: 60 },
      filterApplies: { limit: 10, remaining: 10, metric: 'acmg_or_exomiser' },
      devices: { registeredCount: 1, registeredLimit: 2, activeCount: 1, activeLimit: 1 },
      conversationWarningThreshold: 20,
      chatMaxVariantsWithoutFilter: 100,
      gates: {
        canRunModule1: false,
        canStageModule1: true,
        canRunModule2: true,
        canChat: true,
        canApplyAcmgExomiser: true,
        redirectToSubscription: false,
      },
    },
  },
  beta: {
    planStatus: 'beta',
    hasActiveSubscription: true,
    betaLimits: {
      module1: { limit: 3, remaining: 3 },
      module2: { limit: 5, remaining: 5 },
      chat: { limit: 100, used: 0, remaining: 100 },
      filterApplies: { limit: 20, remaining: 20, metric: 'acmg_or_exomiser' },
      devices: {
        registered: [], registeredCount: 0, registeredLimit: 2,
        active: [], activeCount: 0, activeLimit: 1,
      },
      conversationWarningThreshold: 20,
      gates: {
        canRunModule1: true,
        canRunModule2: true,
        canChat: true,
        canApplyAcmgExomiser: true,
        redirectToSubscription: false,
        module1ExhaustedAllowVcf: false,
      },
    },
  },
  /** Every meter at zero — the exhaustion / Buy Pro path. */
  'beta-exhausted': {
    planStatus: 'beta',
    hasActiveSubscription: true,
    betaLimits: {
      module1: { limit: 3, remaining: 0 },
      module2: { limit: 5, remaining: 0 },
      chat: { limit: 100, used: 100, remaining: 0 },
      filterApplies: { limit: 20, remaining: 0, metric: 'acmg_or_exomiser' },
      devices: {
        registered: [], registeredCount: 1, registeredLimit: 2,
        active: [], activeCount: 1, activeLimit: 1,
      },
      conversationWarningThreshold: 20,
      gates: {
        canRunModule1: false,
        canRunModule2: false,
        canChat: false,
        canApplyAcmgExomiser: false,
        redirectToSubscription: true,
        module1ExhaustedAllowVcf: false,
      },
    },
  },
  pro: {
    planStatus: 'pro',
    hasActiveSubscription: true,
    proLimits: {
      plan: 'pro',
      periodKey: '2026-08',
      module1: { limit: 10, baseRemaining: 10, topupRemaining: 0, remaining: 10 },
      module2: { limit: 30, baseRemaining: 30, topupRemaining: 0, remaining: 30 },
      chat: { limit: 600, baseRemaining: 600, topupRemaining: 0, remaining: 600, used: 0 },
      filterApplies: { unlimited: true },
      devices: { registeredLimit: 5, activeLimit: 2 },
      annovarConcurrency: 3,
      gates: {
        canRunModule1: true,
        canRunModule2: true,
        canChat: true,
        canApplyAcmgExomiser: true,
        redirectToTopup: false,
      },
    },
  },
  super_pro: {
    planStatus: 'super_pro',
    hasActiveSubscription: true,
    proLimits: {
      plan: 'super_pro',
      periodKey: '2026-08',
      module1: { limit: 50, baseRemaining: 50, topupRemaining: 0, remaining: 50 },
      module2: { limit: 150, baseRemaining: 150, topupRemaining: 0, remaining: 150 },
      chat: { limit: 3000, baseRemaining: 3000, topupRemaining: 0, remaining: 3000, used: 0 },
      filterApplies: { unlimited: true },
      devices: { registeredLimit: 10, activeLimit: 5 },
      annovarConcurrency: 'unlimited',
      gates: {
        canRunModule1: true,
        canRunModule2: true,
        canChat: true,
        canApplyAcmgExomiser: true,
        redirectToTopup: false,
      },
    },
  },
};

/** Reads `?tierdebug=` from the current URL. Returns a canned payload or null. */
export function readTierDebugFixture() {
  try {
    const key = new URLSearchParams(window.location.search).get('tierdebug');
    return key ? (TIER_DEBUG_FIXTURES[key] ?? null) : null;
  } catch {
    return null;
  }
}
