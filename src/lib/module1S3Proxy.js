/**
 * Same-origin proxy for Module 1 BAM/BAI presigned URLs.
 *
 * JBrowse BamAdapter Range GETs must stay same-origin when possible. Direct
 * browser→S3 is also allow-listed in CSP as a fallback (dualstack / path-style).
 */

const BUCKET = 'geneie-newprod-variant-files';

/**
 * @param {string} hostname
 * @param {string} pathname
 * @returns {{ kind: 'regional' | 'global', pathname: string } | null}
 */
export function variantProxyTarget(hostname, pathname) {
  const h = String(hostname || '').toLowerCase();
  const path = String(pathname || '');

  // Path-style: https://s3.ap-south-1.amazonaws.com/bucket/key
  const pathStyleRegional = h === 's3.ap-south-1.amazonaws.com' || h === 's3.dualstack.ap-south-1.amazonaws.com';
  const pathStyleGlobal = h === 's3.amazonaws.com' || h === 's3.dualstack.amazonaws.com';
  const bucketPrefix = `/${BUCKET}/`;
  if ((pathStyleRegional || pathStyleGlobal) && path.startsWith(bucketPrefix)) {
    return {
      kind: pathStyleRegional ? 'regional' : 'global',
      pathname: path.slice(BUCKET.length + 1), // leading slash kept via slice(`/bucket`.length) → `/key`
    };
  }

  // Virtual-hosted: https://bucket.s3.ap-south-1.amazonaws.com/key
  if (
    h === `${BUCKET}.s3.ap-south-1.amazonaws.com`
    || h === `${BUCKET}.s3.dualstack.ap-south-1.amazonaws.com`
    || (h.startsWith(`${BUCKET}.s3.`) && h.includes('ap-south-1'))
  ) {
    return { kind: 'regional', pathname: path };
  }
  if (
    h === `${BUCKET}.s3.amazonaws.com`
    || h === `${BUCKET}.s3.dualstack.amazonaws.com`
    || h.startsWith(`${BUCKET}.s3.`)
  ) {
    return { kind: 'global', pathname: path };
  }
  return null;
}

/** @deprecated use variantProxyTarget — kept for tests / call sites */
export function variantProxyKindForHost(hostname) {
  const t = variantProxyTarget(hostname, `/${BUCKET}/x`);
  if (t) return t.kind;
  const t2 = variantProxyTarget(hostname, '/x');
  return t2 ? t2.kind : null;
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
    const target = variantProxyTarget(u.hostname, u.pathname);
    if (!target) return raw;
    const prefix = target.kind === 'regional' ? '/s3-variant-regional' : '/s3-variant';
    const path = target.pathname.startsWith('/') ? target.pathname : `/${target.pathname}`;
    return `${window.location.origin}${prefix}${path}${u.search}`;
  } catch {
    return raw;
  }
}
