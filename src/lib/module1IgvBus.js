/** Lightweight open requests for Module 1 alignment browser (variant → IGV). */

const EVENT = 'geneie:module1-igv-open';

/**
 * @param {{ conversationId: string, locus?: string|null }} detail
 */
export function requestModule1IgvOpen(detail) {
  if (typeof window === 'undefined') return;
  const conversationId = String(detail?.conversationId || '').trim();
  if (!conversationId) return;
  window.dispatchEvent(
    new CustomEvent(EVENT, {
      detail: {
        conversationId,
        locus: detail?.locus || null,
        token: Date.now(),
      },
    }),
  );
}

export function subscribeModule1IgvOpen(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = (ev) => handler(ev.detail || {});
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
