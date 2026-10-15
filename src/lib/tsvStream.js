/**
 * Incremental TSV reader for a fetch Response body.
 *
 * Reads the stream chunk by chunk, splits complete lines, and stops as soon as more than `maxRows`
 * data rows (after the header) have been seen, cancelling the rest of the download. Reading one row
 * past the cap is what lets `truncated` be honest: a file with exactly `maxRows` rows is not truncated.
 *
 * Resolves { header: string[], rows: string[][], truncated: boolean }.
 * `onProgress(header, rows)` fires after each chunk so callers can paint early rows.
 * `signal` (optional AbortSignal) stops reading and rejects with an AbortError.
 *
 * Rows are padded to the header width, so a short line never produces `undefined` cells.
 */
export async function readTsvStream(response, { maxRows = 500, onProgress, signal } = {}) {
  let header = null;
  const rows = [];
  let truncated = false;

  const takeLine = (line) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (header === null) {
      if (line === '') return;
      if (line.charCodeAt(0) === 0xfeff) line = line.slice(1); // BOM would glue onto the first column name
      header = line.split('\t');
    } else if (line !== '') {
      const cells = line.split('\t');
      while (cells.length < header.length) cells.push('');
      rows.push(cells);
    }
  };

  const finish = () => {
    if (rows.length > maxRows) {
      rows.length = maxRows;
      truncated = true;
    }
    return { header: header || [], rows, truncated };
  };

  // Some environments hand back a body that cannot be streamed; read it whole instead.
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    for (const line of text.split('\n')) {
      takeLine(line);
      if (rows.length > maxRows) break;
    }
    return finish();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const onAbort = () => reader.cancel().catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        takeLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (rows.length > maxRows) break;
      }
      if (rows.length > maxRows) break;
      if (header) onProgress?.(header, rows);
    }
    if (rows.length <= maxRows) {
      buffer += decoder.decode();
      if (buffer) takeLine(buffer);
    }
  } finally {
    // Stop the download once we have enough (or on error/abort); ignore cancel failures.
    signal?.removeEventListener('abort', onAbort);
    reader.cancel().catch(() => {});
  }
  return finish();
}
