import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { auth } from '../services/firebase';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';
import { fetchGuestStatus, fetchSubscriptionStatus } from '@/services/backendApi';
import { identifyUser, resetAnalytics } from '@/lib/analytics';
import { normalizeLimits, patchLiveLimits, guestLimits, guestLimitsFromApi } from '@/services/tierLimits';
import { readTierDebugFixture } from '@/services/tierLimitsFixtures';

// Define the initial state for an authenticated user's profile
const initialProfileState = {
  planStatus: 'guest', // Default before fetching or when unauthenticated
  freeExperimentsUsed: 0,
};

// Define a safe, non-null default value for the context to prevent destructuring errors
const defaultAuthValue = {
  isAuthReady: false,
  userLoading: true,
  userId: null,
  userProfile: initialProfileState,
  userTier: 'guest',
  subscriptionStatus: null,
  subscriptionStatusLoading: false,
  limits: guestLimits(),
  patchLimitsFromChat: () => {},
  refreshSubscriptionStatus: () => Promise.resolve(null),
  refreshGuestStatus: () => Promise.resolve(null),
};

// --- CONTEXT SETUP ---
// Initialize context with a safe default value
const AuthContext = createContext(defaultAuthValue);

export const useAuth = () => {
  // TODO: TEMP BYPASS — remove this to restore real auth
  // return {
  //   userId: 'dev-user-123',
  //   isAuthReady: true,
  //   userLoading: false,
  //   userTier: 'pro',
  //   userProfile: { planStatus: 'pro', freeExperimentsUsed: 0 },
  //   markExperimentUsed: () => {},
  //   db: null,
  // };
  return useContext(AuthContext);
};


export const AuthProvider = ({ children }) => {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userLoading, setUserLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  // State for user profile and chat limits
  const [userProfile, setUserProfile] = useState(initialProfileState);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionStatusLoading, setSubscriptionStatusLoading] = useState(false);
  const [liveLimits, setLiveLimits] = useState(null);
  // Guest usage is metered server-side (Redis, keyed on X-Device-Id), so it has to be fetched
  // rather than derived from localStorage — which a guest can simply clear.
  const [guestStatus, setGuestStatus] = useState(null);

  // Determine the final active tier for easy access
  // Treat 'admin' as 'pro' for feature checks (admin gets all pro features)
  const userTier = userProfile.planStatus === 'admin' ? 'pro' : userProfile.planStatus; // 'guest', 'free', or 'pro'


  // --- Step A: Subscribe to Firebase Auth State and Handle Custom Token (Fixed Logic) ---
  useEffect(() => {
    // 1. Critical Check: If Firebase services failed to initialize (e.g., bad .env keys)
    if (!auth) {
      console.error("Auth instance not found. Firebase setup failed. Unlocking app as unauthenticated.");
      setIsAuthReady(true);
      setUserLoading(false); // CRITICAL: Unlock the loading screen
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        localStorage.removeItem('pendingEmailVerification');
        setUserId(user.uid);
        setIsAuthReady(true);
        setUserLoading(false);
      } else {
        // Path 2: User is unauthenticated (or listener just started)

        const canvasToken = (typeof window !== 'undefined' && window.__initial_auth_token)
          ? window.__initial_auth_token
          : null;

        if (canvasToken) {
          console.log("🔐 Found Canvas Auth Token. Attempting Custom Sign-In...");
          signInWithCustomToken(auth, canvasToken)
            .then(() => {
              // Success path will re-trigger the listener with a valid 'user' object (Path 1)
            })
            .catch((error) => {
              // Path 2b: Custom Token Auth Failed
              console.error("❌ Custom Token Auth Failed:", error);
              setUserId(null);
              setUserProfile(initialProfileState);

              // CRITICAL UNLOCK HERE: Token failed, so we finalize the state.
              setIsAuthReady(true);
              setUserLoading(false);
            });
        } else {
          // Path 2a: No token present or manual sign-out. Finalize state.
          setUserId(null);
          setUserProfile(initialProfileState);
          setIsAuthReady(true);
          setUserLoading(false); // UNLOCK
        }
      }
      // Note: Final unlock flags removed from here to prevent race conditions.
    });

    return () => unsubscribeAuth();
  }, []);


  // --- Analytics identity ---
  // Keyed on tier too, so the person property updates once Firestore resolves the
  // plan (userId lands first, tier follows). Firebase UID only — no email is sent.
  useEffect(() => {
    if (userId) {
      identifyUser(userId, userTier);
    } else if (isAuthReady) {
      // Signed out: drop the identity so the next visitor starts a fresh person.
      resetAnalytics();
    }
  }, [userId, userTier, isAuthReady]);

  /* --- Step B: Derive the profile from GET /api/subscription-status ---
   * Previously a Firestore onSnapshot on users/{uid}. That document is no longer the
   * source of truth (the backend reads MongoDB), and it is client-writable — which is the
   * vulnerability this migration closes. The API is now the only place a tier comes from.
   *
   * What is lost: the live push, so a webhook upgrading someone to Pro no longer updates
   * an open tab instantly. refreshSubscriptionStatus already runs after checkout, Module 1,
   * ANNOVAR, filter applies and every limit 403, so the gap is small.
   */
  useEffect(() => {
    if (!userId) {
      setUserProfile(initialProfileState);
      return;
    }
    if (!subscriptionStatus) return;
    setUserProfile({
      planStatus: subscriptionStatus.planStatus || 'free',
      freeExperimentsUsed: subscriptionStatus.freeExperimentsUsed || 0,
    });
  }, [userId, subscriptionStatus]);

  const refreshGuestStatus = useCallback(async () => {
    try {
      const data = await fetchGuestStatus();
      setGuestStatus(data);
      return data;
    } catch (error) {
      // Falls back to the conservative offline guest defaults rather than blocking the app.
      console.warn('[useAuth] Failed to fetch guest status:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (userId) {
      setGuestStatus(null);
      return;
    }
    if (!isAuthReady) return;
    refreshGuestStatus();
  }, [userId, isAuthReady, refreshGuestStatus]);

  const refreshSubscriptionStatus = useCallback(async () => {
    if (!userId) {
      setSubscriptionStatus(null);
      setLiveLimits(null);
      return null;
    }
    try {
      setSubscriptionStatusLoading(true);
      const data = await fetchSubscriptionStatus();
      const stamped = { ...data, fetchedAt: Date.now() };
      setSubscriptionStatus(stamped);
      setLiveLimits(null);
      return stamped;
    } catch (error) {
      console.warn('[useAuth] Failed to fetch subscription status:', error);
      return null;
    } finally {
      setSubscriptionStatusLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLiveLimits(null);
    if (!userId) {
      setSubscriptionStatus(null);
      return undefined;
    }
    refreshSubscriptionStatus();
    return undefined;
  }, [userId, refreshSubscriptionStatus]);


  // --- Normalized usage limits (single seam for every cohort) ---
  const limits = useMemo(() => {
    let status = subscriptionStatus;
    if (import.meta.env.DEV) {
      status = readTierDebugFixture() || status;
    }
    if (!userId) {
      return guestStatus ? guestLimitsFromApi(guestStatus) : guestLimits();
    }
    const base = normalizeLimits(status, userTier, userId);
    if (liveLimits && liveLimits.at >= (base.fetchedAt ?? 0)) {
      return patchLiveLimits(base, liveLimits.block);
    }
    return base;
  }, [subscriptionStatus, userTier, userId, liveLimits, guestStatus]);

  const patchLimitsFromChat = useCallback((payload) => {
    const block = payload?.beta_limits || payload?.free_limits;
    if (block && typeof block === 'object') {
      setLiveLimits({ block, at: Date.now() });
    }
  }, []);

  /* markExperimentUsed was removed with the Firestore write path. It computed the new
   * count IN THE BROWSER (current + 1) and wrote it to a client-writable document, so it
   * was never trustworthy; nothing enforced on it and it was read only for display. If a
   * limit is ever keyed on it, the counter has to move server-side.
   */

  /* The tier is unknown until subscription-status answers. Gating on this keeps the
   * existing SessionLoadingScreen up rather than briefly rendering a paying user as free
   * — the flicker-then-block failure mode. */
  const profileReady = !userId || subscriptionStatus !== null || !subscriptionStatusLoading;

  const value = {
    isAuthReady,
    userLoading,
    userId,
    userProfile,
    userTier,
    subscriptionStatus,
    subscriptionStatusLoading,
    limits,
    patchLimitsFromChat,
    refreshSubscriptionStatus,
    refreshGuestStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Wait for Firebase auth AND, for a signed-in user, the first
        * subscription-status response — the tier is not known before it lands, and
        * rendering early would show a paying user free-tier gating for a beat. */}
      {(userLoading && !isAuthReady) || !profileReady ? (
        <SessionLoadingScreen />
      ) : children}
    </AuthContext.Provider>
  );
};

// You must wrap your root component with <AuthProvider>