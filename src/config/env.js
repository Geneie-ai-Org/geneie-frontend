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
  // 'same-origin' sentinel -> empty origin so apiUrl() yields relative '/api/...' paths
  // that go through the Vite dev proxy. Lets ONE ngrok tunnel (on the FE) serve remote
  // teammates with no separate backend tunnel.
  if (raw.trim() === 'same-origin') return '';
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
    viteVar('VARIANT_DIRECT_UPLOAD_MIN_BYTES') || 10 * 1024 * 1024
  ),
  /* Comma-separated emails allowed into /admin-haha. Env-driven so the list is not committed,
   * and email-based rather than planStatus-based so changing your own tier for testing does not
   * lock you out of the page that sets tiers. Firestore rules are the real boundary either way. */
  adminEmails: (viteVar('ADMIN_EMAILS') || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  firebase: {
    apiKey: viteVar('FIREBASE_API_KEY'),
    authDomain: viteVar('FIREBASE_AUTH_DOMAIN'),
    projectId: viteVar('FIREBASE_PROJECT_ID'),
    storageBucket: viteVar('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: viteVar('FIREBASE_MESSAGING_SENDER_ID'),
    appId: viteVar('FIREBASE_APP_ID'),
  },
  posthog: {
    key: viteVar('POSTHOG_KEY'),
    host: viteVar('POSTHOG_HOST') || 'https://us.i.posthog.com',
  },
};

export function isFirebaseConfigured() {
  const { apiKey, projectId, appId } = env.firebase;
  return Boolean(apiKey && projectId && appId);
}

export function isPostHogConfigured() {
  return Boolean(env.posthog.key);
}
