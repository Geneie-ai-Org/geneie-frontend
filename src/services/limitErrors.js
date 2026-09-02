/**
 * One place that turns a backend limit error into UX.
 *
 * The backend namespaces the same failure per tier (`BETA_CHAT_LIMIT_REACHED`,
 * `FREE_CHAT_LIMIT_REACHED`, `PRO_CHAT_LIMIT_REACHED`, …). Handling them separately would
 * multiply every branch by four, so the prefix is parsed off and only the family is switched on.
 * The one thing that legitimately varies by cohort — which CTA to show — is read from the API's
 * own `redirect*` flag via `limits.redirect`, not from the code prefix. That way an unforeseen
 * `ENTERPRISE_CHAT_LIMIT_REACHED` still renders correctly.
 */

import { PRO_LIKE } from './tierLimits';

/** Longest first, so SUPER_PRO_ is not mis-parsed as PRO_'s sibling. */
const PREFIXES = ['SUPER_PRO_', 'PRO_', 'BETA_', 'FREE_'];

const FAMILIES = {
  MODULE1_LIMIT_REACHED: 'module1',
  MODULE2_LIMIT_REACHED: 'module2',
  CHAT_LIMIT_REACHED: 'chat',
  FILTER_APPLY_LIMIT_REACHED: 'filterApplies',
  MODULE1_REQUIRES_PRO: 'module1RequiresPro',
  DEVICE_FROZEN: 'deviceFrozen',
  DEVICE_LIMIT_REACHED: 'deviceLimit',
  DEVICE_ID_REQUIRED: 'deviceIdRequired',
};

const UNPREFIXED = {
  ANNOVAR_ALREADY_RUN: 'annovarAlreadyRun',
  GUEST_LIMIT_REACHED: 'guestChat',
  FREE_TIER_LIMIT_REACHED: 'legacyFreeLimit',
  // Retired backend-side in favour of the monthly pool. Keeping the alias costs one line and
  // avoids a regression window if any deploy still emits it.
  PRO_DAILY_CHAT_LIMIT_REACHED: 'chat',
};

/** Backend codes that mean "verify your email", which is the ONE 403 allowed to take the page. */
const EMAIL_VERIFICATION_CODES = new Set([
  'EMAIL_NOT_VERIFIED',
  'EMAIL_VERIFICATION_REQUIRED',
  'ACCOUNT_NOT_VERIFIED',
]);

export function isEmailVerificationCode(code) {
  return typeof code === 'string' && EMAIL_VERIFICATION_CODES.has(code);
}

export function parseLimitCode(code) {
  if (typeof code !== 'string' || !code) return null;
  if (UNPREFIXED[code]) return { family: UNPREFIXED[code], prefix: null, code };
  for (const prefix of PREFIXES) {
    if (code.startsWith(prefix)) {
      const family = FAMILIES[code.slice(prefix.length)];
      if (family) return { family, prefix, code };
    }
  }
  return null;
}

/** Every code this module recognizes. Doubles as the chat retry short-circuit whitelist. */
export const LIMIT_ERROR_CODES = new Set([
  ...Object.keys(UNPREFIXED),
  ...PREFIXES.flatMap((p) => Object.keys(FAMILIES).map((f) => `${p}${f}`)),
]);

export function isLimitCode(code) {
  return typeof code === 'string' && LIMIT_ERROR_CODES.has(code);
}

const DEVICE_FAMILIES = new Set(['deviceFrozen', 'deviceLimit', 'deviceIdRequired']);

/** Accepts a thrown Error carrying .status/.code, or a raw `detail` object. */
function unwrap(err) {
  if (!err) return {};
  const detail = err.detail && typeof err.detail === 'object' ? err.detail : null;
  const source = detail || err;
  return {
    status: err.status ?? null,
    code: source.code ?? err.code ?? null,
    message: source.message ?? err.message ?? null,
    metric: source.metric ?? null,
    remaining: source.remaining ?? null,
    limit: source.limit ?? null,
  };
}

function ctaFor(family, limits) {
  if (DEVICE_FAMILIES.has(family)) return { kind: 'devices', label: 'Sign out other devices' };
  if (family === 'annovarAlreadyRun') return { kind: 'none', label: null };
  if (family === 'guestChat') return { kind: 'signup', label: 'Sign Up / Log In' };
  if (limits?.redirect === 'topup' || PRO_LIKE.has(limits?.cohort)) {
    return { kind: 'topup', label: 'Get more runs' };
  }
  return { kind: 'upgrade', label: 'Upgrade to Pro' };
}

const TITLES = {
  module1: 'Module 1 limit reached',
  module1RequiresPro: 'Module 1 requires Pro',
  module2: 'ANNOVAR limit reached',
  chat: 'Chat limit reached',
  filterApplies: 'Filter limit reached',
  annovarAlreadyRun: 'Already annotated',
  guestChat: 'Chat limit reached',
  legacyFreeLimit: 'Limit reached',
  deviceFrozen: 'Session paused on this device',
  deviceLimit: 'Device limit reached',
  deviceIdRequired: 'Session error',
};

const FALLBACK_MESSAGES = {
  module1: 'Module 1 limit reached. Upgrade to Pro for more runs.',
  module1RequiresPro: 'Running Module 1 requires Pro. You can stage your files now and run once you upgrade.',
  module2: 'ANNOVAR limit reached for this account. Upgrade to Pro to continue.',
  chat: 'Chat limit reached for this account. Upgrade to Pro to continue.',
  filterApplies: 'ACMG / Phenotype apply limit reached. Manual filters are still available.',
  annovarAlreadyRun: 'ANNOVAR has already been run on this conversation. Start a new conversation to annotate another file.',
  guestChat: 'Guest chat limit reached. Sign up to continue.',
  legacyFreeLimit: 'You have reached your free tier limit. Upgrade to Pro to continue.',
  deviceFrozen: 'Another session is active on a different device. Close it or sign out there to continue here.',
  deviceLimit: 'Too many registered devices. Sign out on another device to free a slot.',
  deviceIdRequired: 'Device identification required. Please refresh the page.',
};

/** The legacy free code carries no metric, so the caller's context disambiguates it. */
const LEGACY_BY_CONTEXT = {
  chat: 'chat',
  annovar: 'module2',
  module1: 'module1',
  filter: 'filterApplies',
};

/**
 * @returns descriptor `{ family, title, message, variant, cta, refresh, blocking }`
 *          or `null` when the code is not a recognized limit error — in which case the caller
 *          must fall back to its own generic error path rather than invent a limit modal.
 */
export function describeLimitError(err, { context, limits } = {}) {
  const { code, message } = unwrap(err);
  const parsed = parseLimitCode(code);
  if (!parsed) return null;

  let family = parsed.family;
  if (family === 'legacyFreeLimit') {
    family = LEGACY_BY_CONTEXT[context] || 'legacyFreeLimit';
  }

  const isDevice = DEVICE_FAMILIES.has(family);
  const cta = ctaFor(family, limits);

  return {
    family,
    code,
    title: TITLES[family] || 'Limit reached',
    // The backend's own copy is always preferable — it knows the real numbers.
    message: message || FALLBACK_MESSAGES[family] || 'You have reached a limit on your plan.',
    variant: isDevice ? 'error' : 'info',
    cta,
    // Our cached counters are provably wrong the moment the server rejects on quota.
    refresh: family !== 'annovarAlreadyRun',
    blocking: family === 'deviceFrozen' || family === 'deviceLimit',
  };
}
