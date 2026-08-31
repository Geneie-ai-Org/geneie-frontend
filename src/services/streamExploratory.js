/**
 * Exploratory-mode SSE client. Self-contained, framework-agnostic parser for the neutral
 * StreamEvent vocabulary emitted by the exploratory service (domain/streaming.py).
 *
 * Kept separate from useChatMessaging so the streaming concern is modular and easy to
 * reason about / swap. Consumers pass an onEvent(evt) callback; each evt is
 * { type, label, data } exactly as the backend defines it.
 *
 * type ∈ planning | tool_call | tool_result | verifying | answer_delta | refused | done | error
 */

const STREAM_URL = '/exploratory/stream'; // same-origin -> Vite proxy -> :8100

export async function streamExploratory(question, onEvent, signal, conversationId, authHeaders = {}) {
  const res = await fetch(STREAM_URL, {
    method: 'POST',
    // forward auth so the backend can enforce ownership + scope data to this conversation
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    // conversation_id enables native multi-turn memory + the per-conversation data path
    body: JSON.stringify({ question, conversation_id: conversationId }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`exploratory stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // parse SSE frames: events separated by a blank line, payload after "data: "
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
