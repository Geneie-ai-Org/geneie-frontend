import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  GoogleAuthProvider,
  OAuthProvider
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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
let db = null;
let storage = null;

if (isFirebaseConfigured()) {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
    console.log("♻️ Reusing existing Firebase app");
  }
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  console.error(
    '[Firebase] Missing config. Set VITE_FIREBASE_* in geneie-frontend/.env (see .env.example).'
  );
}

// ---- Persistence ----
if (auth) {
  setPersistence(auth, browserLocalPersistence)
    .catch(() => setPersistence(auth, inMemoryPersistence));
}

export { app, auth, db, storage, GoogleAuthProvider, OAuthProvider };
