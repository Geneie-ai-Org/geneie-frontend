/**
 * Same-origin URLs for Module 1 BAM/BAI byte proxy.
 * Browser → geneie.chat/api/module1/bam/... → Vercel rewrite → api-newprod.
 * Avoids cross-origin Range + CORS (TypeError: Failed to fetch in BamAdapter).
 */

/**
 * @param {string} conversationId
 * @param {{ bam_proxy_path?: string|null, bai_proxy_path?: string|null }} [artifacts]
 * @returns {{ bamUri: string, baiUri: string }}
 */
export function module1BamByteUris(conversationId, artifacts = {}) {
  const cid = encodeURIComponent(String(conversationId || '').trim());
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';
  const filePath = artifacts.bam_proxy_path || `/api/module1/bam/${cid}/file`;
  const indexPath = artifacts.bai_proxy_path || `/api/module1/bam/${cid}/index`;
  // Paths from the API are already absolute-from-root; never prefix api-newprod.
  const file = filePath.startsWith('http') ? filePath : `${origin}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
  const index = indexPath.startsWith('http') ? indexPath : `${origin}${indexPath.startsWith('/') ? '' : '/'}${indexPath}`;
  return { bamUri: file, baiUri: index };
}
