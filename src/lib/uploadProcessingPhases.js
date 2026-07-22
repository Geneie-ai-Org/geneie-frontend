export function getUploadDisplayMessage({ uploadProgress }) {
  // if (uploadProgress != null && uploadProgress < 100) {
  //   const pct = Math.round(uploadProgress);
  //   return pct > 0 ? `Sending file to server (${pct}%)…` : 'Sending file to server…';
  // }
  // At 100% (and when progress is null) callers supply their own "Processing…" fallback.
  return null;
}
