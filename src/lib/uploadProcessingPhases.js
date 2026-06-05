/** Upload status copy while POST /api/upload-variant-file is in flight (XHR byte progress only). */

export function getUploadDisplayMessage({ uploadProgress }) {
  if (uploadProgress != null && uploadProgress < 100) {
    const pct = Math.round(uploadProgress);
    return pct > 0 ? `Sending file to server (${pct}%)…` : 'Sending file to server…';
  }
  if (uploadProgress != null && uploadProgress >= 100) {
    return 'Processing your variant file on the server…';
  }
  return null;
}
