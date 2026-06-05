import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';
import { fetchSubscriptionStatus } from '@/services/backendApi';

// Define the initial state for an authenticated user's profile
const initialProfileState = {
  planStatus: 'guest', // Default before fetching or when unauthenticated
  freeExperimentsUsed: 0,
};

// Define a safe, non-null default value for the context to prevent destructuring errors
const defaultAuthValue = {
  // Expose db with a safe fallback to prevent TypeError if firebase.js fails
  db: db || null,
  isAuthReady: false,
  userLoading: true,
  userId: null,
  userProfile: initialProfileState,
  userTier: 'guest',
  subscriptionStatus: null,
  subscriptionStatusLoading: false,
  refreshSubscriptionStatus: () => Promise.resolve(null),
  markExperimentUsed: () => console.warn("markExperimentUsed called outside Provider"),
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

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Path 1: User is successfully authenticated (via form or successful token)
        setUserId(user.uid);
        setIsAuthReady(true);
        setUserLoading(false); // UNLOCK
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


  // --- Step B: Fetch User Profile (Tier Status) from Firestore ---
  useEffect(() => {
    let unsubscribeProfile;

    // Only subscribe to Firestore if we have a valid userId AND db is initialized
    if (userId && db) {
      const docRef = doc(db, 'users', userId);

      unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile({
            planStatus: data.planStatus || 'free',
            freeExperimentsUsed: data.freeExperimentsUsed || 0,
          });
        } else {
          // If profile doesn't exist for an authenticated user, default them to 'free'
          setUserProfile(prev => ({ ...prev, planStatus: 'free' }));
        }
      }, (error) => {
        console.error("Error listening to user profile:", error);
      });
    } else {
      // When userId is null (unauthenticated), set the profile to guest
      setUserProfile(initialProfileState);
    }

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, [userId]);


  const refreshSubscriptionStatus = useCallback(async () => {
    if (!userId) {
      setSubscriptionStatus(null);
      return null;
    }
    try {
      setSubscriptionStatusLoading(true);
      const data = await fetchSubscriptionStatus();
      setSubscriptionStatus(data);
      return data;
    } catch (error) {
      console.warn('[useAuth] Failed to fetch subscription status:', error);
      return null;
    } finally {
      setSubscriptionStatusLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setSubscriptionStatus(null);
      return undefined;
    }
    refreshSubscriptionStatus();
    return undefined;
  }, [userId, refreshSubscriptionStatus]);


  // --- Utility Function: Update Experiments Count ---
  const markExperimentUsed = async () => {
    if (!userId || userTier === 'guest' || !db) return;

    try {
      const userRef = doc(db, 'users', userId);
      const newCount = (userProfile.freeExperimentsUsed || 0) + 1;
      // setDoc will create the document if it doesn't exist
      await setDoc(userRef, { freeExperimentsUsed: newCount }, { merge: true });
    } catch (error) {
      console.error("Failed to update experiment count:", error);
    }
  };


  const value = {
    db,
    isAuthReady,
    userLoading,
    userId,
    userProfile,
    userTier,
    subscriptionStatus,
    subscriptionStatusLoading,
    refreshSubscriptionStatus,
    markExperimentUsed,
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Show Loader if Firebase hasn't checked the auth state yet */}
      {userLoading && !isAuthReady ? (
        <SessionLoadingScreen />
      ) : children}
    </AuthContext.Provider>
  );
};

// You must wrap your root component with <AuthProvider>