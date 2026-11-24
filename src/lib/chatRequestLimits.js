/**
 * Match backend MessageRequest / ChatMessage caps in biochat-backend/main.py:
 *   message + history[].text max_length=8000, history max_length=20.
 * create_message allows up to 20000, so a saved assistant reply can exceed the chat
 * request cap and produce a FastAPI 422 on the next turn unless we clamp here.
 */
export const CHAT_TEXT_MAX = 8000;
export const CHAT_HISTORY_MAX = 20;

export function clampChatText(text) {
  const s = text == null ? '' : String(text);
  return s.length > CHAT_TEXT_MAX ? s.slice(0, CHAT_TEXT_MAX) : s;
}

/**
 * Build the history array for POST /api/chat (and /stream).
 * @param {Array<{role: string, text?: string}>} messages  prior turns (UI may keep longer text)
 * @param {{ extraUserText?: string, mapText?: (text: string) => string }} [opts]
 */
export function buildChatHistoryPayload(messages, opts = {}) {
  const mapText = typeof opts.mapText === 'function' ? opts.mapText : (t) => t;
  const rows = (Array.isArray(messages) ? messages : []).map((msg) => ({
    role: msg.role,
    text: clampChatText(mapText(msg.text)),
  }));
  if (opts.extraUserText != null) {
    rows.push({ role: 'user', text: clampChatText(opts.extraUserText) });
  }
  return rows.length > CHAT_HISTORY_MAX ? rows.slice(-CHAT_HISTORY_MAX) : rows;
}
