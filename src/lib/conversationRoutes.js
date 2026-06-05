const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidConversationId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

/** Path for an authenticated user's conversation (shareable / refresh-safe). */
export function conversationPath(conversationId) {
  if (!conversationId) return '/app';
  return `/app/${conversationId}`;
}
