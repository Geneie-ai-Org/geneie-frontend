import { apiUrl } from '@/config/api';
import { getDeviceId } from '@/lib/deviceId';

export const GUEST_CONVERSATION_STORAGE_KEY = 'geneie_guest_conversation_id';

/** A minted, per-device guest conversation id, persisted in localStorage like deviceId.js does.
 * Returns the cached id if one exists; otherwise asks the backend to mint one (POST
 * /api/guest/conversation, added by the backend's WP-02 — see guide section 0b) and caches it.
 * Replaces the old shared constant 'guest-session' (S-003/F2): every guest used to share one id. */
export async function getOrMintGuestConversationId() {
  try {
    const existing = localStorage.getItem(GUEST_CONVERSATION_STORAGE_KEY);
    if (existing?.trim()) return existing;
  } catch {
    // localStorage unavailable (private browsing / blocked) — fall through to minting a fresh one
    // each time; not persisted, but still unique per call, which is still safe (never shared).
  }

  const response = await fetch(apiUrl('/api/guest/conversation'), {
    method: 'POST',
    headers: { 'X-Device-Id': getDeviceId() },
  });
  if (!response.ok) {
    throw new Error('Failed to mint a guest conversation id');
  }
  const data = await response.json();
  const cid = data.conversation_id;
  try {
    localStorage.setItem(GUEST_CONVERSATION_STORAGE_KEY, cid);
  } catch {
    // ignore — see the catch above, same reasoning
  }
  return cid;
}
