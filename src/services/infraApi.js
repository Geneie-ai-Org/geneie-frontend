/**
 * Admin infra levers (the "Infra" tab on the unlisted admin page).
 *
 * Talks to /api/admin/infra/*, /api/admin/config/* and /api/admin/audit. Every route is gated
 * server-side by the same admin dependency as the rest of /api/admin; nothing here is a
 * security boundary.
 *
 * Errors keep `status`, `code` and the server message so the page can show exactly what the
 * backend rejected (OUT_OF_BOUNDS, a 409 on scale-in, a 429 on a too-fast floor rewrite).
 * `parseApiErrorDetail` alone would return null for a code-only detail, and the existing config
 * routes raise plain string details, so both shapes are handled.
 */

import { apiUrl } from '@/config/api';
import { getAuthHeaders, parseApiErrorDetail } from './backendApi';

export const WORKER_KINDS = ['annovar', 'exomiser'];
export const INTAKE_KINDS = ['annovar', 'exomiser', 'module1', 'pgx'];

/** Module-1 keys the page may write. `module1.gpu_subnet_ids` is deliberately absent (read-only). */
export const MODULE1_KEYS = {
  gpuCap: 'module1.gpu_max_concurrent',
  cpuCap: 'module1.cpu_max_concurrent',
  gpuTypes: 'module1.gpu_instance_types',
  gpuSubnets: 'module1.gpu_subnet_ids',
};

function infraApiError(data, response, fallback) {
  const detail = data?.detail;
  const err = new Error(parseApiErrorDetail(detail) || (detail && detail.code) || fallback);
  err.status = response.status;
  err.code = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail.code : undefined;
  return err;
}

async function request(path, { method = 'GET', body, fallback } = {}) {
  const headers = await getAuthHeaders();
  const init = { method, headers };
  if (body !== undefined) {
    init.headers = { ...headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(apiUrl(path), init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw infraApiError(data, response, fallback || `Request failed (${response.status})`);
  return data;
}

/** One aggregated snapshot; cached server-side for ~15 s, so a read right after a write can be stale. */
export function adminGetInfraStatus() {
  return request('/api/admin/infra/status', { fallback: 'Failed to load infra status' });
}

/** Returns the updated worker panel. */
export function adminSetWorkerFloor(kind, { floor, hours, reason }) {
  return request(`/api/admin/infra/workers/${encodeURIComponent(kind)}/floor`, {
    method: 'POST',
    body: { floor, hours, reason },
    fallback: 'Failed to set worker floor',
  });
}

/** Returns the updated worker panel. */
export function adminClearWorkerFloor(kind) {
  return request(`/api/admin/infra/workers/${encodeURIComponent(kind)}/floor`, {
    method: 'DELETE',
    fallback: 'Failed to clear worker floor',
  });
}

/** "Allow up to M workers for H hours" — raises the ASG max_size; the Lambda reverts it. Returns the worker panel. */
export function adminRaiseWorkerMax(kind, { max, hours, reason }) {
  return request(`/api/admin/infra/workers/${encodeURIComponent(kind)}/max`, {
    method: 'POST',
    body: { max, hours, reason },
    fallback: 'Failed to raise worker max',
  });
}

/** Requests an early revert (until = now); the Lambda lowers the max once desired <= default. */
export function adminEndWorkerMaxRaise(kind) {
  return request(`/api/admin/infra/workers/${encodeURIComponent(kind)}/max`, {
    method: 'DELETE',
    fallback: 'Failed to end the max raise',
  });
}

/** Module-1 lane cap with optional expiry. `hours: null` = permanent until reset. */
export function adminSetModule1Cap({ lane, cap, hours, reason }) {
  return request('/api/admin/infra/module1/cap', {
    method: 'POST',
    body: { lane, cap, hours, reason },
    fallback: `Failed to set the Module-1 ${lane} cap`,
  });
}

export function adminScaleInNow(kind, { reason }) {
  return request(`/api/admin/infra/workers/${encodeURIComponent(kind)}/scale-in-now`, {
    method: 'POST',
    body: { reason },
    fallback: 'Failed to scale in',
  });
}

export function adminPauseIntake(kind, { hours, reason }) {
  return request(`/api/admin/infra/intake/${encodeURIComponent(kind)}/pause`, {
    method: 'POST',
    body: { hours, reason },
    fallback: 'Failed to pause intake',
  });
}

export function adminResumeIntake(kind) {
  return request(`/api/admin/infra/intake/${encodeURIComponent(kind)}/pause`, {
    method: 'DELETE',
    fallback: 'Failed to resume intake',
  });
}

/**
 * Existing config store write. The body is `{ value }`; the stored type is kept server-side, so
 * numbers go as numbers and the GPU instance list as a comma-joined string, never an array.
 */
export function adminSetConfig(key, value) {
  return request(`/api/admin/config/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { value },
    fallback: `Failed to set ${key}`,
  });
}

/** Existing single-key read; used only for the recorded `default` of the Module-1 caps. */
export function adminGetConfig(key) {
  return request(`/api/admin/config/${encodeURIComponent(key)}`, { fallback: `Failed to load ${key}` });
}

export function adminResetConfig(key) {
  return request(`/api/admin/config/${encodeURIComponent(key)}/reset`, {
    method: 'POST',
    body: {},
    fallback: `Failed to reset ${key}`,
  });
}

/** Newest first. Accepts a bare array or a wrapped `{ actions | entries | audit | items }` body. */
export async function adminListAudit({ limit = 50 } = {}) {
  const data = await request(`/api/admin/audit?limit=${encodeURIComponent(String(limit))}`, {
    fallback: 'Failed to load the audit log',
  });
  if (Array.isArray(data)) return data;
  for (const k of ['actions', 'entries', 'audit', 'items', 'records']) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

/* --- Form validation (pure, so it can be exercised without a browser) ------------------ */

export const FLOOR_HOURS_MIN = 0.5;
export const INTAKE_HOURS_MIN = 0.25;

/**
 * Validates the "keep N workers running for H hours" form against the live bounds.
 * Returns null when valid, otherwise a message for the first problem found.
 */
export function validateFloorForm({ floor, hours, reason }, { floorMax, hoursMax = 8 } = {}) {
  if (!Number.isFinite(floorMax)) return 'Worker bounds unavailable — refresh before writing.';
  const n = Number(floor);
  if (floor === '' || floor === null || floor === undefined || !Number.isInteger(n)) {
    return 'Workers must be a whole number.';
  }
  if (n < 0 || n > floorMax) return `Workers must be between 0 and ${floorMax}.`;
  const h = Number(hours);
  if (hours === '' || hours === null || hours === undefined || !Number.isFinite(h)) {
    return 'Hours must be a number.';
  }
  if (h < FLOOR_HOURS_MIN || h > hoursMax) return `Hours must be between ${FLOOR_HOURS_MIN} and ${hoursMax}.`;
  if (!String(reason ?? '').trim()) return 'A reason is required.';
  return null;
}

export const MAX_RAISE_HOURS_MIN = 0.5;
export const MODULE1_CAP_HOURS_MIN = 0.5;
export const MODULE1_CAP_HOURS_MAX = 24;

/** "Allow up to M workers for H hours": default <= M <= ceiling, 0.5 <= H <= hoursMax, reason required. */
export function validateMaxRaiseForm({ max, hours, reason }, { maxDefault, maxCeiling, hoursMax = 24 } = {}) {
  if (!Number.isFinite(maxDefault) || !Number.isFinite(maxCeiling)) {
    return 'Max bounds unavailable — refresh before writing.';
  }
  const n = Number(max);
  if (max === '' || max === null || max === undefined || !Number.isInteger(n)) return 'Max must be a whole number.';
  if (n < maxDefault || n > maxCeiling) return `Max must be between ${maxDefault} and ${maxCeiling}.`;
  const h = Number(hours);
  if (hours === '' || hours === null || hours === undefined || !Number.isFinite(h)) return 'Hours must be a number.';
  if (h < MAX_RAISE_HOURS_MIN || h > hoursMax) return `Hours must be between ${MAX_RAISE_HOURS_MIN} and ${hoursMax}.`;
  if (!String(reason ?? '').trim()) return 'A reason is required.';
  return null;
}

/** Module-1 lane cap: cap within bounds; `hours` null (permanent) or 0.5..24; reason required. */
export function validateModule1CapForm({ cap, hours, reason }, range) {
  const capError = validateCap(cap, range);
  if (capError) return capError;
  if (hours !== null && hours !== undefined) {
    const h = Number(hours);
    if (hours === '' || !Number.isFinite(h)) return 'Revert-after hours must be a number.';
    if (h < MODULE1_CAP_HOURS_MIN || h > MODULE1_CAP_HOURS_MAX) {
      return `Revert-after must be between ${MODULE1_CAP_HOURS_MIN} and ${MODULE1_CAP_HOURS_MAX} h.`;
    }
  }
  if (!String(reason ?? '').trim()) return 'A reason is required.';
  return null;
}

/** Intake pause: 15 min .. `hoursMax` (24 h by contract), reason required. */
export function validateIntakeForm({ hours, reason }, { hoursMax = 24 } = {}) {
  const h = Number(hours);
  if (hours === '' || hours === null || hours === undefined || !Number.isFinite(h)) {
    return 'Duration must be a number of hours.';
  }
  if (h < INTAKE_HOURS_MIN || h > hoursMax) return `Duration must be between 15 min and ${hoursMax} h.`;
  if (!String(reason ?? '').trim()) return 'A reason is required.';
  return null;
}

/** Integer cap within an inclusive `[min, max]` bounds pair. */
export function validateCap(value, range) {
  if (!Array.isArray(range) || range.length !== 2) return 'Bounds unavailable — refresh before writing.';
  const n = Number(value);
  if (value === '' || !Number.isInteger(n)) return 'Cap must be a whole number.';
  if (n < range[0] || n > range[1]) return `Cap must be between ${range[0]} and ${range[1]}.`;
  return null;
}

/** Ordered, non-empty, every entry in the allowlist. */
export function validateInstanceTypes(list, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return 'Allowlist unavailable — refresh before writing.';
  if (!Array.isArray(list) || list.length === 0) return 'Pick at least one instance type.';
  const bad = list.filter((t) => !allowlist.includes(t));
  if (bad.length) return `Not in the allowlist: ${bad.join(', ')}.`;
  return null;
}

/** Data Plane v2 (annotation) flags the page may write. All live in the existing config store; the new path is OFF
 *  until `dataplane.annotation.backend.<build>` (or the canary list) says otherwise. */
export const DATAPLANE_KEYS = {
  kill: 'dataplane.annotation.kill_switch',
  backendHg38: 'dataplane.annotation.backend.hg38',
  backendHg19: 'dataplane.annotation.backend.hg19',
  releaseHg38: 'dataplane.annotation.release.hg38',
  releaseHg19: 'dataplane.annotation.release.hg19',
  canaryUsers: 'dataplane.annotation.canary_users',
  canaryBackend: 'dataplane.annotation.canary_backend',
  maxLines: 'dataplane.annotation.v2_max_variant_lines',
  fallback: 'dataplane.annotation.v2_fallback_to_annovar',
  shadowParity: 'dataplane.annotation.shadow_parity',
};
export const DATAPLANE_BACKENDS = ['annovar', 'shadow', 'v2'];
const DATAPLANE_RELEASE_RE = /^(hg19|hg38)-[0-9A-Za-z.-]+-r[0-9]+$/;

export function validateDataplaneRelease(value, build) {
  const v = String(value ?? '').trim();
  if (!v) return null; // empty = no release (the router keeps using annovar)
  if (!DATAPLANE_RELEASE_RE.test(v)) return 'Release ids look like hg38-20261012-r1.';
  if (!v.startsWith(`${build}-`)) return `This release is not for ${build}.`;
  return null;
}

/** Comma / newline separated emails or user ids -> trimmed unique list. */
export function parseCanaryUsers(text) {
  return [...new Set(String(text ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Exomiser fast path flags the page may write (config store, namespace `dataplane.exomiser.*`). The fast path is OFF until
 *  `backend` (or the canary list) says otherwise. `fast` serves users from the resident engine, which needs a licence
 *  decision first: the page only offers it for canary accounts. */
export const EXOMISER_KEYS = {
  backend: 'dataplane.exomiser.backend',
  canaryUsers: 'dataplane.exomiser.canary_users',
  canaryBackend: 'dataplane.exomiser.canary_backend',
  kill: 'dataplane.exomiser.kill_switch',
  fallback: 'dataplane.exomiser.fallback_to_classic',
  shadowRate: 'dataplane.exomiser.shadow_rate',
  shadowParity: 'dataplane.exomiser.shadow_parity',
  outputFormats: 'dataplane.exomiser.output_formats',
  nominalSlots: 'dataplane.exomiser.nominal_slots',
};
export const EXOMISER_BACKENDS = ['classic', 'shadow']; // the global path: `fast` is canary-only for now
export const EXOMISER_CANARY_BACKENDS = ['shadow', 'fast'];
export const EXOMISER_OUTPUT_FORMATS = ['all', 'tsv_variant'];
export const EXOMISER_SLOTS_RANGE = [1, 4];

/** Parses the shadow-rate field (0 to 1). Returns { value } or { error }. */
export function parseShadowRate(text) {
  const t = String(text ?? '').trim();
  if (!t) return { error: 'Enter a number between 0 and 1.' };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 1) return { error: 'Shadow rate must be between 0 (none) and 1 (every job).' };
  return { value: n };
}

/** Parses the nominal-slots field (whole number in the allowed range). Returns { value } or { error }. */
export function parseNominalSlots(text, range = EXOMISER_SLOTS_RANGE) {
  const t = String(text ?? '').trim();
  const n = Number(t);
  if (!t || !Number.isInteger(n) || n < range[0] || n > range[1]) return { error: `Whole number from ${range[0]} to ${range[1]}.` };
  return { value: n };
}
