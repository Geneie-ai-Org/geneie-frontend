/**
 * Conversation title rules shared by the rail and the first-message auto title.
 * Mirrors biochat-backend/conversation_titles.py: a user title is capped at MAX_USER_TITLE and the
 * server refuses to let any automatic write replace one.
 */

export const MAX_USER_TITLE = 120;

const QUOTES = '"\'`“”‘’';
const LEAD_FILLER =
  /^(?:hi|hello|hey|please|pls|can you|could you|would you|i want to|i would like to|i'd like to|i need to|i need|help me|let'?s)\b[\s,:-]*/i;
const TRAILING = /[\s.,;:!?…\-–—]+$/;
const EDGE_QUOTES = new RegExp(`^[${QUOTES}\\s]+|[${QUOTES}\\s]+$`, 'g');

/** Short rail title from a first message: first sentence, at most 6 words, no quotes or trailing punctuation. */
export function deriveTitle(message, maxWords = 6, maxChars = 48) {
  const text = String(message || '').trim();
  if (!text) return '';
  let first = text.split(/(?<=[.!?])\s|\n/)[0].replace(EDGE_QUOTES, '');
  const stripped = first.replace(LEAD_FILLER, '').trim();
  if (stripped.split(/\s+/).filter(Boolean).length >= 2) first = stripped;
  const words = first.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  let title = words.slice(0, maxWords).join(' ');
  if (title.length > maxChars) {
    const cut = title.slice(0, maxChars);
    title = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  }
  title = title.replace(EDGE_QUOTES, '').replace(TRAILING, '');
  return title ? title[0].toUpperCase() + title.slice(1) : '';
}
