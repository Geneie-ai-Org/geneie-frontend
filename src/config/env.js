/**
 * Central Vite environment reads. Use import.meta.env only here.
 * Copy .env.example → .env and set VITE_* values for local/production.
 *
 * Also accepts legacy VITE_APP_* names (older .env files on this branch).
 */

const DEFAULT_API_ORIGIN = 'http://localhost:8000';

/** Read VITE_FOO or legacy VITE_APP_FOO */
function viteVar(name) {
  const primary = import.meta.env[`VITE_${name}`];
  if (primary != null && String(primary).trim() !== '') return String(primary).trim();
  const legacy = import.meta.env[`VITE_APP_${name}`];
  if (legacy != null && String(legacy).trim() !== '') return String(legacy).trim();
  return '';
}

function readApiOrigin() {
  const raw = viteVar('API_URL');
  if (!raw) return DEFAULT_API_ORIGIN;
  return raw.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '') || DEFAULT_API_ORIGIN;
}

export const env = {
  apiOrigin: readApiOrigin(),
  chatApiUrl: (() => {
    const raw = viteVar('API_URL');
    if (!raw) return `${DEFAULT_API_ORIGIN}/api/chat`;
    if (raw.includes('/api/chat')) return raw.replace(/\/$/, '');
    return `${readApiOrigin()}/api/chat`;
  })(),
  variantDirectUploadMinBytes: Number(
    viteVar('VARIANT_DIRECT_UPLOAD_MIN_BYTES') || 5 * 1024 * 1024
  ),
  firebase: {
    apiKey: viteVar('FIREBASE_API_KEY'),
    authDomain: viteVar('FIREBASE_AUTH_DOMAIN'),
    projectId: viteVar('FIREBASE_PROJECT_ID'),
    storageBucket: viteVar('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: viteVar('FIREBASE_MESSAGING_SENDER_ID'),
    appId: viteVar('FIREBASE_APP_ID'),
  },
};

export function isFirebaseConfigured() {
  const { apiKey, projectId, appId } = env.firebase;
  return Boolean(apiKey && projectId && appId);
}
