/**
 * Pure SSE helpers for the chat stream (/api/chat/stream). No imports, no env, no DOM: testable with plain
 * node (`node src/lib/sseFrames.test.mjs`).
 *
 * Parser semantics are exactly the ones useChatMessaging used inline: frames are separated by a blank line
 * ("\n\n"), the payload is the first line starting with "data: ", and frames without one (SSE comments such as
 * ": keepalive") or with malformed JSON are skipped. The trailing partial frame stays in the buffer.
 */

/**
 * Split a growing buffer into complete frames.
 * @param {string} buffer accumulated decoded text
 * @returns {{ frames: string[], rest: string }} complete frames and the unfinished tail to keep buffering
 */
export function splitSseFrames(buffer) {
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';
  return { frames, rest };
}

/**
 * Parse one frame's `data: ` payload as JSON.
 * @param {string} frame
 * @returns {*} the parsed payload, or `undefined` for a frame to skip (comment frames such as ": keepalive",
 *   frames without a data line, malformed JSON). A literal `data: null` parses to null, as it did inline.
 */
export function parseSseFrame(frame) {
  const line = frame.split('\n').find((l) => l.startsWith('data: '));
  if (!line) return undefined;
  try {
    return JSON.parse(line.slice(6));
  } catch {
    return undefined;
  }
}

/** Fixed, user-safe note shown on (and stored with) an answer whose stream closed before `done`. */
export const STREAM_CUT_NOTE = 'Connection dropped; the answer may be incomplete.';

const STREAM_CUT_PREFIX = `_${STREAM_CUT_NOTE}_\n\n`;

/**
 * The text rendered and persisted for a cut stream: the note first, then the partial answer. The backend message
 * store keeps only role/text/sources/duration_ms, so the note travels in the text and a reload shows the same thing.
 */
export function withStreamCutNote(partial) {
  return `${STREAM_CUT_PREFIX}${partial ?? ''}`;
}

/** Drop the note again (history sent back to the model should carry only the partial answer). */
export function stripStreamCutNote(text) {
  return typeof text === 'string' && text.startsWith(STREAM_CUT_PREFIX)
    ? text.slice(STREAM_CUT_PREFIX.length)
    : text;
}

/**
 * Decide what a finished chat stream means. Pure: the caller passes what the reader loop saw.
 *   - an `error` event wins (today's behaviour, handled by the caller);
 *   - `done` seen -> complete answer;
 *   - no `done`, some text -> cut: keep the partial, never present it as complete;
 *   - no `done`, no text -> failed: the caller falls back to the JSON endpoint (one retry, as today).
 * @returns {'error'|'complete'|'cut'|'failed'}
 */
export function classifyStreamEnd({ sawDone, sawError, text }) {
  if (sawError) return 'error';
  if (sawDone) return 'complete';
  return text ? 'cut' : 'failed';
}
