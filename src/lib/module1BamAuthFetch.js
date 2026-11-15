/**
 * Wrap window.fetch so JBrowse BamAdapter Range GETs to the Module 1 BAM
 * API proxy carry Firebase Bearer + device id (api-newprod is cross-origin).
 *
 * Idempotent. Only touches /api/module1/bam/.../file|index.
 */

import { getAuthHeaders } from '@/services/backendApi';

const PATH_RE = /\/api\/module1\/bam\/[^/]+\/(file|index)(\?|$)/;

let installed = false;
let nativeFetch = null;

/** @param {string} url */
export function isModule1BamByteUrl(url) {
  return typeof url === 'string' && PATH_RE.test(url);
}

export function installModule1BamAuthFetch() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  installed = true;
  nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input && typeof input === 'object' && 'url' in input
          ? String(input.url)
          : '';

    if (!isModule1BamByteUrl(url)) {
      return nativeFetch(input, init);
    }

    const auth = await getAuthHeaders();
    const headers = new Headers(
      (init && init.headers) ||
        (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
    );
    headers.set('Authorization', auth.Authorization);
    headers.set('X-Device-Id', auth['X-Device-Id']);

    if (typeof Request !== 'undefined' && input instanceof Request) {
      return nativeFetch(new Request(input, { headers }), init);
    }
    return nativeFetch(input, { ...(init || {}), headers });
  };
}
