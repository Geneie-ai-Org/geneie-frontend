/**
 * Admin config reads for the tuning panel.
 *
 * The panel needs the CURRENT global value of every tunable key so each field can be prefilled and
 * so "reset to baseline" has something to reset TO. That is exactly what GET /api/admin/config
 * returns, filtered client-side to the allow-listed namespaces - the backend's allow-list is the
 * authority; this is only a convenience filter for the UI, and a key the backend would drop anyway
 * is never sent as an override.
 *
 * Note the asymmetry that is deliberate: this reads BACKEND config only. The sidecar's persona/pack/
 * agent keys live in the S3 manifest, not in this collection, so they are NOT prefillable from here.
 * See the plan's open question 1 - surfacing them needs a sidecar read endpoint, which is not built.
 * Until then the panel can still SET those keys (they travel in the override header), it just cannot
 * prefill them, and the field is marked as "no baseline shown".
 */

import { apiUrl } from '@/config/api';
import { getAuthHeaders, parseApiErrorDetail } from './backendApi';
import { TUNABLE_PREFIXES, TUNABLE_EXACT, isTunableKey } from './streamCompare';

const LIST_URL = apiUrl('/api/admin/config');

/** All tunable BACKEND keys with their current global value. Admin-only (403s otherwise). */
export async function fetchTunableConfig() {
  const headers = await getAuthHeaders();
  const response = await fetch(LIST_URL, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Admin access required');
  }
  const all = Array.isArray(data.config) ? data.config : [];
  const tunable = all.filter((doc) => isTunableKey(doc.key));
  const byKey = {};
  for (const doc of tunable) {
    byKey[doc.key] = {
      key: doc.key,
      value: doc.value,
      default: doc.default,
      type: doc.type,
      namespace: doc.namespace,
      description: doc.description || '',
      version: doc.version,
    };
  }
  return { byKey, keys: Object.keys(byKey).sort(), cacheTtlSec: data.cacheTtlSec, namespaces: TUNABLE_PREFIXES };
}

export { TUNABLE_PREFIXES, TUNABLE_EXACT };
