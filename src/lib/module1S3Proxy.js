/**
 * Same-origin proxy for Module 1 BAM/BAI presigned URLs.
 *
 * JBrowse BamAdapter Range GETs must stay same-origin: browser→S3 CORS and
 * browser→api-newprod auth'd Range have both surfaced as TypeError: Failed to
 * fetch. /s3-variant* (Vercel → bucket) keeps the signed query string.
 */

const BUCKET = 'geneie-newprod-variant-files';
const REGIONAL_HOSTS = new Set([
  `${BUCKET}.s3.ap-south-1.amazonaws.com`,
  `${BUCKET}.s3.dualstack.ap-south-1.amazonaws.com`,
]);
const GLOBAL_HOSTS = new Set([
  `${BUCKET}.s3.amazonaws.com`,
  `${BUCKET}.s3.dualstack.amazonaws.com`,
]);

/**
 * @param {string} hostname
 * @returns {'regional' | 'global' | null}
 */
export function variantProxyKindForHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (REGIONAL_HOSTS.has(h) || h === `${BUCKET}.s3.ap-south-1.amazonaws.com`) return 'regional';
  if (GLOBAL_HOSTS.has(h)) return 'global';
  // Virtual-hosted / accidental casing
  if (h.startsWith(`${BUCKET}.s3.`) && h.includes('ap-south-1')) return 'regional';
  if (h.startsWith(`${BUCKET}.s3.`)) return 'global';
  return null;
}

/**
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function toSameOriginVariantProxy(url) {
  const raw = String(url || '').trim();
  if (!raw || typeof window === 'undefined') return raw;
  try {
    const u = new URL(raw);
    const kind = variantProxyKindForHost(u.hostname);
    if (!kind) return raw;
    const prefix = kind === 'regional' ? '/s3-variant-regional' : '/s3-variant';
    return `${window.location.origin}${prefix}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}
