/**
 * Single normalization seam for per-tier usage limits.
 *
 * `GET /api/subscription-status` returns one of `freeLimits` | `betaLimits` | `proLimits`
 * depending on `planStatus`, each with a slightly different shape. This module collapses all of
 * them (plus the unsigned guest case and the legacy `freeTierUsage` block) into one uniform
 * object so that no consumer needs to know which cohort it is looking at.
 *
 * Pure JS: no React, no Firebase, no network. `backendApi.js` imports this; never the reverse.
 *
 * The backend's 403 is the real enforcement. Everything here is UX, which is why every unknown
 * gate degrades OPEN — a failed status fetch must never block a paying user.
 */

export const COHORTS = ['guest', 'free', 'beta', 'pro', 'super_pro'];
const COHORT_SET = new Set(COHORTS);
const SIGNED_IN_PLANS = new Set(['free', 'beta', 'pro', 'super_pro']);
export const PRO_LIKE = new Set(['pro', 'super_pro']);

/** Guest has no server-side block; these mirror the backend's guest env defaults. */
export const GUEST_CHAT_LIMIT = 5;
export const GUEST_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_WARNING_THRESHOLD = 20;

export const METER_KEYS = ['module1', 'module2', 'chat', 'filterApplies'];

const METER_LABELS = {
  module1: 'Module 1 runs',
  module2: 'ANNOVAR runs',
  chat: 'Chat exchanges',
  filterApplies: 'ACMG / Exomiser applies',
};

/** Number coercion that preserves a meaningful 0 but rejects undefined/null/NaN. */
function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Only a strict boolean counts; anything else falls back (gates fall back to OPEN). */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyMeter(key, overrides) {
  return {
    key,
    label: METER_LABELS[key] || key,
    tracked: false,
    unlimited: false,
    limit: null,
    used: null,
    remaining: null,
    baseRemaining: null,
    topupRemaining: null,
    stagingOnly: false,
    metric: null,
    ...overrides,
  };
}

/**
 * `tracked: false` means "render nothing" — never "render 0/0". That distinction is what keeps a
 * mid-load null from flashing an exhausted meter, and it is why callers must not gate on an
 * untracked meter.
 */
function buildMeter(key, raw, options = {}) {
  const base = emptyMeter(key, { stagingOnly: bool(options.stagingOnly, false) });
  if (!isObject(raw)) return base;

  // Pro/Super Pro send `filterApplies: { unlimited: true }` with no numbers at all.
  if (raw.unlimited === true) return { ...base, tracked: true, unlimited: true };

  const limit = num(raw.limit);
  const remaining = num(raw.remaining);
  if (limit === null && remaining === null) return base;

  const used = num(raw.used)
    ?? (limit !== null && remaining !== null ? Math.max(limit - remaining, 0) : null);

  return {
    ...base,
    tracked: true,
    limit,
    used,
    remaining,
    baseRemaining: num(raw.baseRemaining),
    topupRemaining: num(raw.topupRemaining),
    stagingOnly: bool(raw.stagingOnly, base.stagingOnly),
    metric: typeof raw.metric === 'string' ? raw.metric : null,
  };
}

function buildDevices(raw) {
  if (!isObject(raw)) {
    return {
      tracked: false,
      registeredCount: null,
      registeredLimit: null,
      activeCount: null,
      activeLimit: null,
      registered: [],
      active: [],
    };
  }
  return {
    tracked: true,
    registeredCount: num(raw.registeredCount),
    registeredLimit: num(raw.registeredLimit),
    activeCount: num(raw.activeCount),
    activeLimit: num(raw.activeLimit),
    registered: Array.isArray(raw.registered) ? raw.registered : [],
    active: Array.isArray(raw.active) ? raw.active : [],
  };
}

/**
 * Degrade-open: any gate the backend did not send as a strict boolean is treated as allowed.
 * `defaults` lets a cohort override that for gates it is known never to send.
 */
function buildGates(raw, defaults = {}) {
  const g = isObject(raw) ? raw : {};
  const canRunModule1 = bool(g.canRunModule1, bool(defaults.canRunModule1, true));
  const module1ExhaustedAllowVcf = bool(g.module1ExhaustedAllowVcf, false);
  // The beta block omits canStageModule1 entirely; with runs left the run path *is* the staging
  // path, and once exhausted module1ExhaustedAllowVcf is the equivalent affordance.
  const stageFallback = defaults.canStageModule1 !== undefined
    ? defaults.canStageModule1
    : (canRunModule1 || module1ExhaustedAllowVcf);

  return {
    canRunModule1,
    canStageModule1: bool(g.canStageModule1, stageFallback),
    canRunModule2: bool(g.canRunModule2, bool(defaults.canRunModule2, true)),
    canChat: bool(g.canChat, bool(defaults.canChat, true)),
    canApplyAcmgExomiser: bool(g.canApplyAcmgExomiser, bool(defaults.canApplyAcmgExomiser, true)),
    module1ExhaustedAllowVcf,
  };
}

function buildRedirect(raw, fallback) {
  const g = isObject(raw) ? raw : {};
  if (g.redirectToTopup === true) return 'topup';
  if (g.redirectToSubscription === true) return 'subscription';
  return fallback ?? null;
}

function normalizeConcurrency(value) {
  if (value === 'unlimited' || value === Infinity) return Infinity;
  return num(value);
}

function shell(cohort, source, overrides = {}) {
  return {
    cohort,
    source,
    periodKey: null,
    fetchedAt: null,
    meters: {
      module1: emptyMeter('module1'),
      module2: emptyMeter('module2'),
      chat: emptyMeter('chat'),
      filterApplies: emptyMeter('filterApplies'),
    },
    devices: buildDevices(null),
    gates: buildGates(null),
    redirect: null,
    chat: {
      warningThreshold: DEFAULT_WARNING_THRESHOLD,
      maxVariantsWithoutFilter: null,
    },
    annovarConcurrency: null,
    upload: { previewMaxBytes: null },
    raw: null,
    ...overrides,
  };
}

/**
 * Everything open, nothing tracked. Used whenever we cannot trust our own numbers: fetch failed,
 * still loading, or an unrecognized planStatus. The backend still enforces.
 */
export function degradedLimits(cohort = 'free') {
  return shell(COHORT_SET.has(cohort) ? cohort : 'free', 'degraded');
}

/**
 * Guest limits from `GET /api/guest-status`.
 *
 * The server meters guests in Redis keyed on X-Device-Id, so this — not localStorage — is
 * authoritative. `uploads` has no equivalent on the signed-in tiers, so it is carried through
 * as an extra meter rather than forced into the shared four.
 */
export function guestLimitsFromApi(status) {
  const block = status?.guestLimits;
  if (!isObject(block)) return guestLimits();

  const gates = isObject(block.gates) ? block.gates : {};
  return shell('guest', 'api', {
    meters: {
      module1: buildMeter('module1', block.module1, { stagingOnly: true }),
      module2: buildMeter('module2', block.module2),
      chat: buildMeter('chat', block.chat),
      filterApplies: buildMeter('filterApplies', block.filterApplies),
    },
    uploads: buildMeter('uploads', block.uploads),
    // Guest gates come from the server and are mostly closed by design; unlike the signed-in
    // cohorts we do NOT degrade these open, because there is no identity to enforce against.
    gates: {
      canRunModule1: gates.canRunModule1 === true,
      canStageModule1: gates.canStageModule1 === true,
      canRunModule2: gates.canRunModule2 === true,
      canChat: gates.canChat !== false,
      canApplyAcmgExomiser: gates.canApplyAcmgExomiser === true,
      module1ExhaustedAllowVcf: false,
    },
    redirect: gates.redirectToSignup === true ? 'signup' : null,
    chat: {
      warningThreshold: DEFAULT_WARNING_THRESHOLD,
      maxVariantsWithoutFilter: num(block.chatMaxVariantsWithoutFilter),
    },
    upload: { previewMaxBytes: GUEST_UPLOAD_MAX_BYTES },
    persistence: typeof block.persistence === 'string' ? block.persistence : null,
    raw: status,
  });
}

/**
 * Offline fallback for guests, used before /api/guest-status answers or if it fails.
 *
 * Gates are deliberately CLOSED rather than degraded open like the signed-in cohorts: there is
 * no identity to enforce against, so guessing generously would hand out access the server will
 * then refuse.
 */
export function guestLimits() {
  return shell('guest', 'guest-default', {
    meters: {
      module1: emptyMeter('module1'),
      module2: emptyMeter('module2'),
      chat: buildMeter('chat', { limit: GUEST_CHAT_LIMIT, used: 0, remaining: GUEST_CHAT_LIMIT }),
      filterApplies: emptyMeter('filterApplies'),
    },
    gates: buildGates(null, {
      canRunModule1: false,
      canStageModule1: false,
      canRunModule2: false,
      canApplyAcmgExomiser: false,
      canChat: true,
    }),
    upload: { previewMaxBytes: GUEST_UPLOAD_MAX_BYTES },
  });
}

/**
 * Guest chat usage lives in localStorage (ChatPage owns it), not on the server. Injecting it here
 * keeps this module pure while still letting the guest meter render like every other meter.
 */
export function patchGuestChatUsed(limits, used) {
  if (!limits || limits.cohort !== 'guest') return limits;
  const n = num(used) ?? 0;
  const limit = limits.meters.chat.limit ?? GUEST_CHAT_LIMIT;
  return {
    ...limits,
    meters: {
      ...limits.meters,
      chat: { ...limits.meters.chat, used: n, remaining: Math.max(limit - n, 0) },
    },
  };
}

export function resolveCohort(subscriptionStatus, userTier, userId) {
  const fromApi = subscriptionStatus?.planStatus;
  if (SIGNED_IN_PLANS.has(fromApi)) return fromApi;
  if (userId && SIGNED_IN_PLANS.has(userTier)) return userTier;
  if (!userId) return 'guest';
  return 'free';
}

/** Which key on the status payload holds this cohort's block. */
function blockKeyFor(cohort) {
  if (cohort === 'beta') return 'betaLimits';
  if (cohort === 'free') return 'freeLimits';
  if (PRO_LIKE.has(cohort)) return 'proLimits';
  return null;
}

function fromFreeBlock(cohort, block, status) {
  return shell(cohort, 'api', {
    meters: {
      module1: buildMeter('module1', block.module1, { stagingOnly: true }),
      module2: buildMeter('module2', block.module2),
      chat: buildMeter('chat', block.chat),
      filterApplies: buildMeter('filterApplies', block.filterApplies),
    },
    devices: buildDevices(block.devices),
    gates: buildGates(block.gates),
    redirect: buildRedirect(block.gates, 'subscription'),
    chat: {
      warningThreshold: num(block.conversationWarningThreshold) ?? DEFAULT_WARNING_THRESHOLD,
      maxVariantsWithoutFilter: num(block.chatMaxVariantsWithoutFilter),
    },
    upload: {
      previewMaxBytes: legacyFreeUploadBytes(status),
    },
    raw: status,
  });
}

function fromBetaBlock(cohort, block, status) {
  return shell(cohort, 'api', {
    meters: {
      module1: buildMeter('module1', block.module1),
      module2: buildMeter('module2', block.module2),
      chat: buildMeter('chat', block.chat),
      filterApplies: buildMeter('filterApplies', block.filterApplies),
    },
    devices: buildDevices(block.devices),
    gates: buildGates(block.gates),
    redirect: buildRedirect(block.gates, 'subscription'),
    chat: {
      warningThreshold: num(block.conversationWarningThreshold) ?? DEFAULT_WARNING_THRESHOLD,
      maxVariantsWithoutFilter: num(block.chatMaxVariantsWithoutFilter),
    },
    raw: status,
  });
}

function fromProBlock(cohort, block, status) {
  return shell(cohort, 'api', {
    periodKey: typeof block.periodKey === 'string' ? block.periodKey : null,
    meters: {
      module1: buildMeter('module1', block.module1),
      module2: buildMeter('module2', block.module2),
      chat: buildMeter('chat', block.chat),
      filterApplies: buildMeter('filterApplies', block.filterApplies),
    },
    devices: buildDevices(block.devices),
    // Pro never stages — it runs. Staging is a free-tier concept.
    gates: buildGates(block.gates, { canStageModule1: true }),
    redirect: buildRedirect(block.gates, 'topup'),
    chat: {
      warningThreshold: num(block.conversationWarningThreshold) ?? DEFAULT_WARNING_THRESHOLD,
      maxVariantsWithoutFilter: num(block.chatMaxVariantsWithoutFilter),
    },
    annovarConcurrency: normalizeConcurrency(block.annovarConcurrency),
    raw: status,
  });
}

function legacyFreeUploadBytes(status) {
  const mb = num(status?.freeTierUsage?.upload_preview?.max_file_size_mb);
  return mb === null ? null : mb * 1024 * 1024;
}

/** Last resort for free before degrading: the pre-redesign `freeTierUsage` block. */
function fromLegacyFreeUsage(status) {
  const usage = status?.freeTierUsage;
  if (!isObject(usage)) return null;
  const chatLimit = num(usage.limits?.chat);
  if (chatLimit === null) return null;
  const chatUsed = num(usage.usage?.chat) ?? num(usage.chat_exchanges_used) ?? 0;
  return shell('free', 'legacy', {
    meters: {
      module1: emptyMeter('module1', { stagingOnly: true }),
      module2: emptyMeter('module2'),
      chat: buildMeter('chat', {
        limit: chatLimit,
        used: chatUsed,
        remaining: Math.max(chatLimit - chatUsed, 0),
      }),
      filterApplies: emptyMeter('filterApplies'),
    },
    redirect: 'subscription',
    upload: { previewMaxBytes: legacyFreeUploadBytes(status) },
    raw: status,
  });
}

function fromBlock(cohort, block, status) {
  if (cohort === 'free') return fromFreeBlock(cohort, block, status);
  if (cohort === 'beta') return fromBetaBlock(cohort, block, status);
  return fromProBlock(cohort, block, status);
}

/**
 * Never throws, never returns null. Callers can read `limits.gates.canChat` without `?.`.
 */
export function normalizeLimits(subscriptionStatus, userTier, userId) {
  const cohort = resolveCohort(subscriptionStatus, userTier, userId);
  if (cohort === 'guest') return guestLimits();

  const key = blockKeyFor(cohort);
  const block = key ? subscriptionStatus?.[key] : null;

  if (isObject(block)) {
    const normalized = fromBlock(cohort, block, subscriptionStatus);
    normalized.fetchedAt = num(subscriptionStatus?.fetchedAt);
    return normalized;
  }

  if (cohort === 'free') {
    const legacy = fromLegacyFreeUsage(subscriptionStatus);
    if (legacy) {
      legacy.fetchedAt = num(subscriptionStatus?.fetchedAt);
      return legacy;
    }
  }

  const degraded = degradedLimits(cohort);
  degraded.raw = subscriptionStatus ?? null;
  degraded.upload.previewMaxBytes = cohort === 'free' ? legacyFreeUploadBytes(subscriptionStatus) : null;
  degraded.fetchedAt = num(subscriptionStatus?.fetchedAt);
  return degraded;
}

/**
 * A chat response for free/beta carries a full refreshed block (meters + gates), so counters can
 * advance without a second round trip. Fields the block omits are inherited from `current`.
 */
export function patchLiveLimits(current, block) {
  if (!current || !isObject(block)) return current;
  const cohort = current.cohort;
  if (cohort === 'guest') return current;

  const patched = fromBlock(cohort, block, current.raw);
  patched.source = 'live';
  patched.fetchedAt = current.fetchedAt;
  patched.periodKey = patched.periodKey ?? current.periodKey;
  patched.annovarConcurrency = patched.annovarConcurrency ?? current.annovarConcurrency;
  patched.upload = patched.upload.previewMaxBytes === null ? current.upload : patched.upload;
  patched.chat = {
    warningThreshold: patched.chat.warningThreshold ?? current.chat.warningThreshold,
    maxVariantsWithoutFilter: patched.chat.maxVariantsWithoutFilter ?? current.chat.maxVariantsWithoutFilter,
  };
  return patched;
}

export function meterFor(limits, key) {
  return limits?.meters?.[key] ?? emptyMeter(key);
}

/** False whenever we do not actually know — untracked, unlimited, or no remaining reported. */
export function meterExhausted(limits, key) {
  const m = meterFor(limits, key);
  if (!m.tracked || m.unlimited || m.remaining === null) return false;
  return m.remaining <= 0;
}

/** True when a tracked, limited meter is at or under the soft-warning threshold. */
export function meterNearLimit(limits, key) {
  const m = meterFor(limits, key);
  if (!m.tracked || m.unlimited || m.remaining === null) return false;
  const threshold = num(limits?.chat?.warningThreshold) ?? DEFAULT_WARNING_THRESHOLD;
  return m.remaining > 0 && m.remaining <= threshold;
}

/** Meters worth rendering, in a stable order. */
export function visibleMeters(limits) {
  return METER_KEYS.map((k) => meterFor(limits, k)).filter((m) => m.tracked);
}

export function formatMeter(meter) {
  if (!meter?.tracked) return null;
  if (meter.unlimited) return 'Unlimited';
  if (meter.remaining === null || meter.limit === null) return null;
  return `${meter.remaining} of ${meter.limit} left`;
}

/**
 * Secondary line for the monthly pools: how the remaining total splits between the base
 * allowance and purchased top-ups, and when the base resets.
 *
 * Only meaningful for pro/super_pro; returns null everywhere else, so callers can render it
 * unconditionally.
 */
export function formatMeterDetail(limits, meter) {
  if (!meter?.tracked || meter.unlimited) return null;
  if (!PRO_LIKE.has(limits?.cohort)) return null;

  const parts = [];
  // Only worth splitting out when a top-up actually exists — otherwise base === remaining and
  // the extra line is noise.
  if (meter.topupRemaining !== null && meter.topupRemaining > 0) {
    parts.push(`${meter.baseRemaining ?? 0} base + ${meter.topupRemaining} top-up`);
  }
  if (limits.periodKey) {
    parts.push(`resets ${formatPeriodReset(limits.periodKey)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** "2026-08" -> "1 Sep" — the day the pool rolls, which is the start of the NEXT period. */
export function formatPeriodReset(periodKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || ''));
  if (!match) return String(periodKey || '');
  const year = Number(match[1]);
  const month = Number(match[2]);
  // Pools roll at the start of the following month (UTC), so month index `month` in a
  // 0-indexed constructor is already the next month.
  const next = new Date(Date.UTC(year, month, 1));
  return next.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* -------------------------------------------------------------------------- *
 * Action gating
 * -------------------------------------------------------------------------- */

const ACTION_TO_METER = {
  module1: 'module1',
  // module1Stage intentionally maps to the module1 meter for DISPLAY only; staging is never
  // blocked by the run budget (free ships limit: 0 by design). See METERED_ACTIONS.
  module1Stage: 'module1',
  module2: 'module2',
  annovar: 'module2',
  acmgExomiser: 'filterApplies',
  chat: 'chat',
};

/** Actions whose meter actually constrains them. Staging is gate-only. */
const METERED_ACTIONS = new Set(['module1', 'module2', 'annovar', 'acmgExomiser', 'chat']);

const ACTION_TO_GATE = {
  module1: 'canRunModule1',
  module1Stage: 'canStageModule1',
  module2: 'canRunModule2',
  annovar: 'canRunModule2',
  acmgExomiser: 'canApplyAcmgExomiser',
  chat: 'canChat',
};

/** CTA kind derived from the API's own redirect flag rather than from the tier name. */
function ctaFor(limits) {
  if (limits?.cohort === 'guest' || limits?.redirect === 'signup') {
    return { kind: 'signup', label: 'Sign up' };
  }
  if (limits?.redirect === 'topup') return { kind: 'topup', label: 'Get more runs' };
  if (limits?.redirect === 'subscription') return { kind: 'upgrade', label: 'Upgrade to Pro' };
  return { kind: 'upgrade', label: 'Upgrade to Pro' };
}

const GUEST_REASONS = {
  module1: 'Sign up to analyze raw sequencing data.',
  module1Stage: 'Sign up to analyze raw sequencing data.',
  module2: 'Sign up to run ANNOVAR annotation.',
  annovar: 'Sign up to run ANNOVAR annotation.',
  acmgExomiser: 'Sign up to apply ACMG and Exomiser filters.',
  chat: 'Sign up to keep chatting.',
};

function periodSuffix(limits) {
  return PRO_LIKE.has(limits?.cohort) ? ' this month' : '';
}

function exhaustedReason(action, limits, meter) {
  const total = meter.limit;
  const suffix = periodSuffix(limits);
  switch (action) {
    case 'module1':
    case 'module1Stage':
      if (limits.gates.module1ExhaustedAllowVcf) {
        return `You have used all ${total} Module 1 runs. You can still upload a VCF instead.`;
      }
      return `You have used all ${total} Module 1 runs${suffix}.`;
    case 'module2':
    case 'annovar':
      return `You have used all ${total} ANNOVAR runs${suffix}.`;
    case 'acmgExomiser':
      return `You have used all ${total} ACMG / Exomiser filter applies${suffix}. Manual filters are still available.`;
    case 'chat':
      return `You have used all ${total} chat exchanges${suffix}.`;
    default:
      return `You have reached this limit${suffix}.`;
  }
}

function blockedReason(action, limits) {
  if (action === 'module1' && limits.cohort === 'free') {
    return limits.gates.canStageModule1
      ? 'Module 1 runs require Pro. You can stage the files now and run once you upgrade.'
      : 'Module 1 runs require Pro.';
  }
  switch (action) {
    case 'module1':
    case 'module1Stage':
      return 'Module 1 is not available on your plan.';
    case 'module2':
    case 'annovar':
      return 'ANNOVAR is not available on your plan.';
    case 'acmgExomiser':
      return 'ACMG and Exomiser filters are not available on your plan. Manual filters are still available.';
    case 'chat':
      return 'Chat is not available on your plan.';
    default:
      return 'This action is not available on your plan.';
  }
}

/**
 * The gate leads (it is the backend's own opinion); the meter is a second signal, and only when
 * it is actually tracked. Unknown state resolves to allowed — see the degrade-open note above.
 */
export function actionGate(limits, action) {
  const meterKey = ACTION_TO_METER[action] ?? null;
  const meter = meterKey ? meterFor(limits, meterKey) : emptyMeter(action);
  const gateKey = ACTION_TO_GATE[action];
  const gateOpen = gateKey ? limits?.gates?.[gateKey] !== false : true;
  // A limit of 0 is not exhaustion, it is "never included in this plan" — different copy.
  const exhausted = meterKey && METERED_ACTIONS.has(action)
    && (meter.limit ?? 0) > 0
    && meterExhausted(limits, meterKey);

  if (gateOpen && !exhausted) {
    return { action, allowed: true, reason: null, cta: null, meter, staging: Boolean(meter.stagingOnly) };
  }

  const reason = limits?.cohort === 'guest'
    ? (GUEST_REASONS[action] || 'Sign up to continue.')
    : (exhausted ? exhaustedReason(action, limits, meter) : blockedReason(action, limits));

  return {
    action,
    allowed: false,
    reason,
    cta: ctaFor(limits),
    meter,
    staging: Boolean(meter.stagingOnly),
  };
}
