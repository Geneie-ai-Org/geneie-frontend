/**
 * Helpers for showing generated documents (report HTML / PDF) safely inside the app.
 *
 * Rule: server-made HTML is only ever shown inside a sandboxed <iframe> (never injected into the
 * app DOM). A blob: URL inherits the ORIGIN of the page that made it, so HTML opened in a new tab
 * through a blob URL would run with the app's origin (tokens, IndexedDB). `hardenHtml` therefore
 * puts a Content-Security-Policy that forbids scripts, frames, forms and network access in front of
 * the document before it is shown or opened anywhere.
 */

/** The report HTML is self-contained: inline CSS, inline SVG, data: fonts and images. Nothing else. */
export const DOCUMENT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'";

/**
 * Put a script-blocking CSP meta in front of an HTML document. It is prepended as its own
 * `<head>`, so it takes effect before anything the document contains (even a script placed ahead
 * of the document's own <head>); the parser then folds the document's own <html>/<head>/<body>
 * into it.
 */
export function hardenHtml(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${DOCUMENT_CSP}"></head>${String(html ?? '')}`;
}

/**
 * Normalise an iframe sandbox value. Default is "" (the strictest: no scripts, no same-origin, no
 * forms, no popups, no modals). `allow-scripts` together with `allow-same-origin` would let the
 * framed page remove its own sandbox, so the same-origin token is dropped whenever scripts are on.
 */
export function safeSandbox(sandbox = '') {
  const tokens = String(sandbox || '').split(/\s+/).filter(Boolean);
  const out = tokens.includes('allow-scripts') ? tokens.filter((t) => t !== 'allow-same-origin') : tokens;
  return [...new Set(out)].join(' ');
}

/** Can this browser draw a PDF inside the page? Phones/tablets (coarse pointer) and browsers without a viewer cannot. */
export function canEmbedPdf() {
  try {
    if (typeof navigator === 'undefined') return false;
    if (navigator.pdfViewerEnabled !== true) return false;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return false;
    return true;
  } catch {
    return false;
  }
}

/** Revoke a few seconds late: a new tab needs the URL until it has loaded it. */
const REVOKE_DELAY_MS = 60_000;

function clickAnchor(href, { download } = {}) {
  const a = document.createElement('a');
  a.href = href;
  if (download) a.download = download;
  else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** HTML -> new tab, as a script-free blob document. The user prints from the browser. */
export function openHtmlInNewTab(html) {
  const url = URL.createObjectURL(new Blob([hardenHtml(html)], { type: 'text/html;charset=utf-8' }));
  clickAnchor(url);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** A PDF blob URL (or any URL) -> new tab. Blob URLs owned by the caller are NOT revoked here. */
export function openUrlInNewTab(url) {
  if (!url) return;
  clickAnchor(url);
}

/** Save a blob as a file without touching the network. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  clickAnchor(url, { download: filename || 'report.pdf' });
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The stable key for "which picks produced this document". Compare to the current one to know it is stale. */
export function picksSignature(body) {
  try { return JSON.stringify(body); } catch { return String(Math.random()); }
}
