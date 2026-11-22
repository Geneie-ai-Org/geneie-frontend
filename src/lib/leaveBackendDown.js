import { signOut } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { DEVICE_ID_STORAGE_KEY } from '@/lib/deviceId';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kept across the wipe: the theme, and the device id (a fresh id would count as a new device against the free-tier device limit). */
const KEEP = [THEME_STORAGE_KEY, DEVICE_ID_STORAGE_KEY];

function deleteDatabase(name) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
      setTimeout(resolve, 1500); // an open connection can block the delete; the reload below closes it anyway
    } catch {
      resolve();
    }
  });
}

/**
 * "Back to home" on the backend-down screen. A signed-in visitor who goes to the landing page is sent straight back to
 * /app, so a plain link left people stuck on this screen. This signs out, clears what the browser kept for this site
 * (storage, IndexedDB where Firebase keeps its session, Cache Storage, service workers, readable cookies), and then
 * loads the landing page fresh. Every step is best effort and the navigation always happens. The sign-out does not wait
 * for the backend, which is the thing that is down.
 */
export async function clearSessionAndGoHome() {
  try {
    await Promise.race([signOut(auth), sleep(2000)]);
  } catch {
    // The local session is cleared below regardless.
  }
  try {
    const kept = KEEP.map((k) => [k, localStorage.getItem(k)]);
    localStorage.clear();
    sessionStorage.clear();
    kept.forEach(([k, v]) => v != null && localStorage.setItem(k, v));
  } catch {
    // Storage blocked: nothing to clear.
  }
  try {
    const dbs = (await indexedDB.databases?.()) || [];
    const names = new Set(['firebaseLocalStorageDb', ...dbs.map((d) => d.name).filter(Boolean)]);
    await Promise.all([...names].map(deleteDatabase));
  } catch {
    // Older browsers have no indexedDB.databases(); Firebase's own database was handled above.
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // No Cache Storage here.
  }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs || []).map((r) => r.unregister()));
  } catch {
    // No service workers here.
  }
  try {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
  } catch {
    // Cookies blocked.
  }
  window.location.replace('/');
}
