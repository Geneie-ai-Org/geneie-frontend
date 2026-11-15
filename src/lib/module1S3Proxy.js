/**
 * Same-origin proxy for Module 1 BAM/BAI presigned URLs.
 *
 * JBrowse BamAdapter fetches with Range (+ often Accept/Cache-Control in the
 * CORS preflight). Direct browser→S3 calls have been unreliable under our CSP
 * and S3 CORS rules (TypeError: Failed to fetch). Routing through /s3-variant*
 * (Vercel rewrite → bucket) keeps the signed query string and Host that the
 * signature was issued for, while making the browser request same-origin.
 */

const REGIONAL_HOST = 'geneie-newprod-variant-files.s3.ap-south-1.amazonaws.com';
const GLOBAL_HOST = 'geneie-newprod-variant-files.s3.amazonaws.com';

/**
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function toSameOriginVariantProxy(url) {
  const raw = String(url || '').trim();
  if (!raw || typeof window === 'undefined') return raw;
  try {
    const u = new URL(raw);
    let prefix = null;
    if (u.hostname === REGIONAL_HOST) prefix = '/s3-variant-regional';
    else if (u.hostname === GLOBAL_HOST) prefix = '/s3-variant';
    if (!prefix) return raw;
    return `${window.location.origin}${prefix}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}
