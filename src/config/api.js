import { env } from './env';

/** Backend origin without trailing slash, e.g. http://localhost:8000 */
export function getApiOrigin() {
  return env.apiOrigin;
}

/** Full URL for POST /api/chat */
export function getChatApiUrl() {
  return env.chatApiUrl;
}

/** Full URL for POST /api/chat/stream (SSE token streaming) */
export function getChatStreamApiUrl() {
  return `${getApiOrigin()}/api/chat/stream`;
}

/** Build a backend API URL from a path, e.g. apiUrl('/api/conversations') */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${normalized}`;
}
