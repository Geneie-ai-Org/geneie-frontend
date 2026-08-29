import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  GoogleAuthProvider,
  OAuthProvider
} from 'firebase/auth';

import { env, isFirebaseConfigured } from '../config/env.js';

// ---- Load Config ----
const getFirebaseConfig = () => {
  if (typeof window !== 'undefined' && window.__firebase_config) {
    return window.__firebase_config;
  }
  if (typeof __firebase_config !== 'undefined') {
    return typeof __firebase_config === 'string'
      ? JSON.parse(__firebase_config)
      : __firebase_config;
  }
  return env.firebase;
};

const firebaseConfig = getFirebaseConfig();

// ---- SINGLETON PROTECTION ----
let app = null;
let auth = null;

if (isFirebaseConfigured()) {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
    console.log("♻️ Reusing existing Firebase app");
  }
  auth = getAuth(app);
} else {
  console.error(
    'Missing config. Set VITE_FIREBASE_* in geneie-frontend/.env (see .env.example).'
  );
}

// ---- Persistence ----
if (auth) {
  setPersistence(auth, browserLocalPersistence)
    .catch(() => setPersistence(auth, inMemoryPersistence));
}

/* Firestore is deliberately NOT initialised or exported.
 *
 * User and entitlement data lives in MongoDB behind the backend API. Firestore was
 * reachable from the browser, and its per-document rules meant "a user may write their own
 * profile" also meant "a user may set their own planStatus and quota counters". Not
 * exporting `db` is what stops that path being reintroduced by accident — if you find
 * yourself adding getFirestore() back, the data you want almost certainly belongs behind
 * an API endpoint instead.
 *
 * Firebase Auth stays: it does authentication, which was never the problem.
 */
export { app, auth, GoogleAuthProvider, OAuthProvider };
