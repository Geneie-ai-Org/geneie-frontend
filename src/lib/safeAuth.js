import { getAuth } from 'firebase/auth';
import { auth as firebaseAuth } from '@/services/firebase';

/** Firebase ID token when signed in; null for guests or when Firebase is not configured.
 * NOTE: getIdToken() returns a CACHED token that can be expired (Firebase caches ~1h). On a
 * long-lived session that stale token gets rejected by the backend, which then treats the
 * request as a GUEST (wrong owner -> 400 / "conversation not found"). The Firebase SDK
 * auto-refreshes only when the cached token is within ~5min of expiry; to be safe on very long
 * sessions we force a refresh so we never send a stale token. */
export async function optionalIdToken() {
  const auth = firebaseAuth;
  if (!auth?.currentUser) return null;
  try {
    // forceRefresh=true: exchange for a fresh token if the cached one is stale.
    return await auth.currentUser.getIdToken(true);
  } catch {
    // a refresh failure (offline, revoked) -> fall back to the cached token rather than null,
    // so a transient refresh error doesn't silently downgrade the user to guest.
    try { return await auth.currentUser.getIdToken(); } catch { return null; }
  }
}

/** ID token for signed-in API calls; throws when auth is required but unavailable. */
export async function requiredIdToken() {
  const token = await optionalIdToken();
  if (token) return token;
  try {
    const auth = firebaseAuth || getAuth();
    if (auth?.currentUser) {
      return auth.currentUser.getIdToken();
    }
  } catch {
    // Firebase not initialized — handled below.
  }
  throw new Error('Authentication required. Please log in.');
}
