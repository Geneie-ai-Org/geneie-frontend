import { apiUrl } from '@/config/api';
import { getAuthHeaders, parseApiErrorDetail } from '@/services/backendApi';

/**
 * Fetch helpers for the in-app report viewer. None of these downloads anything and none of them
 * is a report generation:
 *   POST /api/conversations/{id}/clinical-report/preview   -> text/html   (same body as generate)
 *   GET  /api/case-report/{id}.html | sample.html          -> text/html
 *   GET  /api/case-report/{id}.pdf  | sample.pdf           -> application/pdf (read, not saved)
 * The sample endpoints are public; every other call carries the user's auth headers.
 */

async function readError(response, fallback) {
  let data = {};
  try { data = await response.json(); } catch { /* not JSON */ }
  let message = parseApiErrorDetail(data?.detail);
  if (response.status === 404 && (!message || message === 'Not Found')) message = 'This preview is not available on the server yet.';
  const err = new Error(message || `${fallback} (HTTP ${response.status})`);
  err.status = response.status;
  err.code = data?.detail?.code || null;
  return err;
}

async function readHtml(response, fallback) {
  if (!response.ok) throw await readError(response, fallback);
  const type = response.headers.get('Content-Type') || '';
  if (!/text\/html/i.test(type)) throw new Error('The server did not return a document.');
  return response.text();
}

async function authHeaders(conversationId) {
  return conversationId === 'sample' ? {} : getAuthHeaders();
}

/** Clinical report as HTML, built from the same picks the PDF would use. Not counted as a generation. */
export async function fetchClinicalReportPreviewHtml(conversationId, body, { signal } = {}) {
  const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  const response = await fetch(
    apiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/clinical-report/preview`),
    { method: 'POST', headers, body: JSON.stringify(body), signal },
  );
  return readHtml(response, 'Could not build the preview');
}

/** The 1-page case report (or `sample`) as HTML. */
export async function fetchCaseReportHtml(conversationId, { signal } = {}) {
  const response = await fetch(
    apiUrl(`/api/case-report/${encodeURIComponent(conversationId)}.html`),
    { headers: await authHeaders(conversationId), signal },
  );
  return readHtml(response, 'Could not load the case report');
}

/** The 1-page case report PDF bytes for viewing/saving (no automatic download). */
export async function fetchCaseReportPdfBlob(conversationId, { signal } = {}) {
  const response = await fetch(
    apiUrl(`/api/case-report/${encodeURIComponent(conversationId)}.pdf`),
    { headers: await authHeaders(conversationId), signal },
  );
  if (!response.ok) throw await readError(response, 'Could not load the case report PDF');
  const blob = await response.blob();
  const filenameMatch = (response.headers.get('Content-Disposition') || '').match(/filename="(.+?)"/);
  return { blob, filename: filenameMatch?.[1] || `Geneie_CaseReport_${conversationId}.pdf` };
}
