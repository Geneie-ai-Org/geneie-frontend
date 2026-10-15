/**
 * Incremental TSV reader for a fetch Response body.
 *
 * Reads the stream chunk by chunk, splits complete lines, and stops as soon as `maxRows` data rows
 * (after the header) have been collected, cancelling the rest of the download.
 *
 * Resolves { header: string[], rows: string[][], truncated: boolean }.
 * `onProgress(header, rows)` fires after each chunk so callers can paint early rows.
 */
export async function readTsvStream(response, { maxRows = 500, onProgress } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let header = null;
  const rows = [];
  let buffer = '';
  let truncated = false;

  const takeLine = (line) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (header === null) {
      if (line === '') return;
      header = line.split('\t');
    } else if (line !== '') {
      rows.push(line.split('\t'));
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        takeLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (rows.length >= maxRows) break;
      }
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      if (header) onProgress?.(header, rows);
    }
    if (!truncated) {
      buffer += decoder.decode();
      if (buffer) takeLine(buffer);
    }
  } finally {
    // Stop the download once we have enough (or on error/abort); ignore cancel failures.
    reader.cancel().catch(() => {});
  }
  if (rows.length > maxRows) rows.length = maxRows;
  return { header: header || [], rows, truncated };
}
