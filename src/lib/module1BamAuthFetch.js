/**
 * Wrap window.fetch so JBrowse BamAdapter Range GETs for Module 1 BAM bytes
 * carry Firebase Bearer + device id.
 *
 * Byte URLs are same-origin (`geneie.chat/api/module1/bam/.../file|index` via
 * Vercel rewrite → api-newprod) so the browser never hits cross-origin CORS on
 * Range responses. Idempotent. Only touches those paths.
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

    // no-store: avoid Chrome's cached-CORS false failure on Range GETs
    // (generic-filehandle documents this as "Failed to fetch").
    const nextInit = {
      ...(init || {}),
      headers,
      cache: 'no-store',
    };

    if (typeof Request !== 'undefined' && input instanceof Request) {
      // Do not pass init.headers again — it would drop Authorization.
      const { headers: _drop, ...rest } = nextInit;
      return nativeFetch(new Request(input, { headers }), rest);
    }
    return nativeFetch(input, nextInit);
  };
}
