import { getAuth, signOut } from 'firebase/auth';
import { releaseDevice } from '@/services/backendApi';

const RELEASE_TIMEOUT_MS = 2000;

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function performLogout(navigate, { to = '/auth' } = {}) {
  try {
    await Promise.race([releaseDevice({ unregister: true }), timeout(RELEASE_TIMEOUT_MS)]);
  } catch (error) {
    console.warn('[logout] device release failed, signing out anyway:', error);
  }

  try {
    localStorage.removeItem('guest_chat_count');
  } catch {
    /* blocked storage — nothing to clean up */
  }

  try {
    await signOut(getAuth());
  } catch (error) {
    console.error('[logout] signOut failed:', error);
  } finally {
    if (navigate) navigate(to);
    else window.location.href = to;
  }
}
