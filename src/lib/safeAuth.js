import { getAuth } from 'firebase/auth';
import { auth as firebaseAuth } from '@/services/firebase';

/** Firebase ID token when signed in; null for guests or when Firebase is not configured. */
export async function optionalIdToken() {
  const auth = firebaseAuth;
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
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
