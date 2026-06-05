import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, GoogleAuthProvider, OAuthProvider } from '../services/firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    sendEmailVerification,
    signOut,
    applyActionCode,
    linkWithCredential,
    EmailAuthProvider,
    reauthenticateWithCredential
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const AuthForm = ({ triggerReason = 'default', onSignupSuccess, onEmailVerificationPending }) => {
    const navigate = useNavigate();

    // Form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [signupSuccess, setSignupSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [verifyingEmail, setVerifyingEmail] = useState(false);
    const [verificationSuccess, setVerificationSuccess] = useState(false);

    // Account linking state
    const [pendingCredential, setPendingCredential] = useState(null);
    const [showLinkingPrompt, setShowLinkingPrompt] = useState(false);
    const [linkingEmail, setLinkingEmail] = useState('');

    // Handle email verification from URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const oobCode = urlParams.get('oobCode');

        if (mode === 'verifyEmail' && oobCode) {
            setVerifyingEmail(true);
            applyActionCode(auth, oobCode)
                .then(() => {
                    setVerifyingEmail(false);
                    setIsLogin(true);
                    setSignupSuccess(false);
                    localStorage.removeItem('pendingEmailVerification');
                    if (onEmailVerificationPending) {
                        onEmailVerificationPending(false);
                    }
                    window.history.replaceState({}, '', window.location.pathname);
                    toast.success("Email Verified! You can now log in.");
                })
                .catch((err) => {
                    setVerifyingEmail(false);
                    window.history.replaceState({}, '', window.location.pathname);
                    toast.error('Email verification failed: ' + err.message);
                });
        }
    }, []);

    // Check for pending email verification
    const pendingEmail = localStorage.getItem('pendingEmailVerification');

    useEffect(() => {
        if (pendingEmail && isLogin) {
            setIsLogin(false);
        }
    }, [pendingEmail, isLogin]);

    // Create Firestore profile
    const createFirestoreProfile = async (user) => {
        try {
            await setDoc(doc(db, 'users', user.uid), {
                email: user.email,
                planStatus: 'free',
                freeExperimentsUsed: 0,
            });
        } catch (e) {
            console.error("Error setting user profile document: ", e);
        }
    };

    // Google Sign-In handler
    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);

        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userDoc = await getDoc(doc(db, 'users', user.uid));

            if (!userDoc.exists()) {
                await createFirestoreProfile(user);
            }

            navigate('/app');
        } catch (err) {
            if (err.code === 'auth/account-exists-with-different-credential') {
                // Handle account linking
                const pendingCred = err.credential;
                const linkingEmail = err.email;
                setPendingCredential(pendingCred);
                setLinkingEmail(linkingEmail);
                setShowLinkingPrompt(true);
                setError('');
                setLoading(false);
                return;
            }

            let friendlyError = 'Google sign-in failed.';
            if (err.code) {
                switch (err.code) {
                    case 'auth/popup-closed-by-user':
                        friendlyError = 'Sign-in cancelled.';
                        break;
                    case 'auth/popup-blocked':
                        friendlyError = 'Popup was blocked. Please allow popups for this site.';
                        break;
                    default:
                        friendlyError = `Google sign-in failed: ${err.code.replace('auth/', '')}`;
                }
            }
            toast.error(friendlyError);
            setLoading(false);
        }
    };

    // Microsoft Sign-In handler
    const handleMicrosoftSignIn = async () => {
        setError('');
        setLoading(true);

        try {
            const provider = new OAuthProvider('microsoft.com');
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userDoc = await getDoc(doc(db, 'users', user.uid));

            if (!userDoc.exists()) {
                await createFirestoreProfile(user);
            }

            navigate('/app');
        } catch (err) {
            if (err.code === 'auth/account-exists-with-different-credential') {
                // Handle account linking
                const pendingCred = err.credential;
                const linkingEmail = err.email;
                setPendingCredential(pendingCred);
                setLinkingEmail(linkingEmail);
                setShowLinkingPrompt(true);
                setError('');
                setLoading(false);
                return;
            }

            let friendlyError = 'Microsoft sign-in failed.';
            if (err.code) {
                switch (err.code) {
                    case 'auth/popup-closed-by-user':
                        friendlyError = 'Sign-in cancelled.';
                        break;
                    case 'auth/popup-blocked':
                        friendlyError = 'Popup was blocked. Please allow popups for this site.';
                        break;
                    default:
                        friendlyError = `Microsoft sign-in failed: ${err.code.replace('auth/', '')}`;
                }
            }
            toast.error(friendlyError);
            setLoading(false);
        }
    };

    // Account linking handler
    const handleAccountLinking = async (linkingEmail, linkingPassword) => {
        setError('');
        setLoading(true);

        try {
            // Sign in with email/password first
            const credential = EmailAuthProvider.credential(linkingEmail, linkingPassword);
            const userCredential = await signInWithEmailAndPassword(auth, linkingEmail, linkingPassword);

            // Link the pending OAuth credential
            if (pendingCredential) {
                await linkWithCredential(userCredential.user, pendingCredential);
            }

            // Clear linking state
            setPendingCredential(null);
            setShowLinkingPrompt(false);
            setLinkingEmail('');

            // Navigate to app
            navigate('/app');
        } catch (err) {
            let friendlyError = 'Failed to link accounts.';
            if (err.code) {
                switch (err.code) {
                    case 'auth/wrong-password':
                    case 'auth/user-not-found':
                        friendlyError = 'Incorrect email or password. Please try again.';
                        break;
                    case 'auth/credential-already-in-use':
                        friendlyError = 'This account is already linked.';
                        break;
                    default:
                        friendlyError = `Linking failed: ${err.code.replace('auth/', '')}`;
                }
            }
            toast.error(friendlyError);
            setLoading(false);
        }
    };

    const cancelAccountLinking = () => {
        setPendingCredential(null);
        setShowLinkingPrompt(false);
        setLinkingEmail('');
        setError('');
    };

    // Email/Password form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSignupSuccess(false);
        setLoading(true);

        try {
            if (isLogin) {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                let user = userCredential.user;

                let emailVerified = user.emailVerified;

                if (!emailVerified) {
                    try {
                        const tokenResult = await user.getIdTokenResult(true);
                        emailVerified = tokenResult.claims.email_verified || user.emailVerified;
                    } catch (tokenError) {
                        console.log('[AuthForm] Could not refresh token, using user object:', tokenError);
                    }
                }

                if (!emailVerified) {
                    toast.error('Your email may not be verified yet. Please check your inbox.');
                    await signOut(auth);
                    return;
                }

                toast.success('Logged in successfully!');

            } else {
                localStorage.setItem('pendingEmailVerification', email);

                if (onEmailVerificationPending) {
                    onEmailVerificationPending(true);
                }

                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await createFirestoreProfile(user);
                await sendEmailVerification(user);

                await signOut(auth);

                toast.success(`Account created! We've sent a verification email to ${email}.`, { duration: 6000 });
                setIsLogin(true); // Automatically toggle to login flow
                setEmail('');
                setPassword('');
            }
        } catch (err) {
            let friendlyError = 'An unknown error occurred.';
            if (err.code) {
                switch (err.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        friendlyError = 'Invalid email or password.';
                        break;
                    case 'auth/email-already-in-use':
                        friendlyError = 'This email is already registered. Try logging in.';
                        break;
                    case 'auth/weak-password':
                        friendlyError = 'Password should be at least 6 characters.';
                        break;
                    default:
                        friendlyError = `Authentication failed: ${err.code.replace('auth/', '')}`;
                }
            }
            toast.error(friendlyError);
        } finally {
            setLoading(false);
        }
    };

    // Contextual heading
    let mainHeading = isLogin ? 'Log in to Geneie' : 'Create an account';
    let subMessage = null;

    if (triggerReason === 'guestLimit') {
        mainHeading = 'Guest Access Ended';
        subMessage = "Your 5 free exchanges have been used. Please sign up or log in to save your progress and continue chatting!";
    }

    return (
        <div className="w-full">
            {/* === Header === */}
            <div className="text-center mb-6 sm:mb-8">
                <h2 className="text-2xl sm:text-3xl font-medium text-white mb-2 tracking-tight">
                    {showLinkingPrompt ? 'Link Your Account' : mainHeading}
                </h2>
                {showLinkingPrompt ? (
                    <p className="text-sm text-zinc-400 mt-2">
                        An account already exists for <strong className="text-white">{linkingEmail}</strong>. Sign in with your email to link your Microsoft/Google account.
                    </p>
                ) : subMessage ? (
                    <p className="text-sm text-zinc-400">
                        {subMessage}
                    </p>
                ) : (
                    <p className="text-sm text-zinc-400 mt-2">
                        Connect to <span className="font-semibold text-white">Geneie</span> with:
                    </p>
                )}
            </div>

            {/* === Account Linking Prompt === */}
            {showLinkingPrompt && (
                <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
                    <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div className="flex-1 space-y-3">
                            <div>
                                <h3 className="text-sm font-medium text-white">Account Already Exists</h3>
                                <p className="text-xs text-zinc-400 mt-1">
                                    Sign in with your email password to link your {pendingCredential?.providerId?.includes('google') ? 'Google' : 'Microsoft'} account.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <input
                                    type="email"
                                    value={linkingEmail}
                                    readOnly
                                    className="w-full h-9 px-3 border border-zinc-700 rounded-md bg-zinc-900/50 text-sm text-zinc-400 cursor-not-allowed"
                                />
                                <input
                                    type="password"
                                    id="linking-password"
                                    placeholder="Enter your email password"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAccountLinking(linkingEmail, e.target.value);
                                        }
                                    }}
                                    className="w-full h-9 px-3 border border-zinc-700 rounded-md bg-black/90 backdrop-blur-sm text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none transition-colors"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => {
                                        const passwordInput = e.target.parentElement.querySelector('input[type="password"]');
                                        if (passwordInput) handleAccountLinking(linkingEmail, passwordInput.value);
                                    }}
                                    disabled={loading}
                                    className="flex-1 h-9 bg-[#0a0a0a] border border-zinc-700/80 hover:bg-zinc-900 disabled:opacity-50 rounded-md text-sm font-medium text-white transition-all"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Link Accounts'}
                                </button>
                                <button
                                    onClick={cancelAccountLinking}
                                    disabled={loading}
                                    className="px-4 h-9 border border-zinc-700/80 hover:bg-zinc-900 rounded-md text-sm font-medium text-zinc-400 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* === Social Login Buttons === */}
            {!showLinkingPrompt && (
                <div className="space-x-3 mb-6 flex flex-row">
                    {/* Google Button */}
                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full h-10 px-4 flex items-center justify-center gap-3 border border-zinc-700/80 rounded-md bg-black/80 backdrop-blur-sm hover:bg-zinc-900 transition-colors duration-200 text-sm font-medium text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span>Google</span>
                    </button>

                    {/* Microsoft Button */}
                    <button
                        type="button"
                        onClick={handleMicrosoftSignIn}
                        disabled={loading}
                        className="w-full h-10 px-4 flex items-center justify-center gap-3 border border-zinc-700/80 rounded-md bg-black/80 backdrop-blur-sm hover:bg-zinc-900 transition-colors duration-200 text-sm font-medium text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 23 23" fill="none">
                            <rect width="11" height="11" fill="#F25022" />
                            <rect x="12" width="11" height="11" fill="#7FBA00" />
                            <rect y="12" width="11" height="11" fill="#00A4EF" />
                            <rect x="12" y="12" width="11" height="11" fill="#FFB900" />
                        </svg>
                        <span>Microsoft</span>
                    </button>
                </div>
            )}

            {/* === Divider === */}
            {!showLinkingPrompt && (
                <div className="flex items-center gap-3 my-6">
                    <div className="flex-1 h-px bg-zinc-800"></div>
                    <span className="text-xs text-zinc-500 shrink-0">or continue with</span>
                    <div className="flex-1 h-px bg-zinc-800"></div>
                </div>
            )}

            {/* === Auth Form === */}
            {!showLinkingPrompt && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email Field */}
                    <div className="space-y-1.5">
                        <label htmlFor="email" className="block text-xs font-medium text-zinc-400">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className="w-full h-10 px-3 border border-zinc-800 rounded-md bg-black/90 backdrop-blur-sm text-sm text-white focus:border-zinc-500 focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Password Field */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label htmlFor="password" className="block text-xs font-medium text-zinc-400">
                                Password
                            </label>
                            {/* {isLogin && (
                                <button type="button" className="text-xs text-[#4ad6cd] hover:underline" tabIndex={-1}>
                                    Forgot Password?
                                </button>
                            )} */}
                        </div>
                        <div className="relative">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete={isLogin ? "current-password" : "new-password"}
                                className="w-full h-10 px-3 pr-10 border border-zinc-800 rounded-md bg-black/90 backdrop-blur-sm text-sm text-white focus:border-zinc-500 focus:outline-none transition-colors"
                                placeholder=""
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-200 transition-colors"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2 flex justify-center">
                        <button
                            type="submit"
                            disabled={loading || password.length < 6 || email.length < 3}
                            className="hover:animate-none w-[60%] h-10 bg-gradient-to-b from-zinc-700 to-black hover:from-neutral-800 hover:to-black disabled:opacity-65 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white shadow-[0px_0.5px_0px_0px_#404040_inset,1px_4px_4px_1px_#171717] [text-shadow:0px_1px_2px_black] transition-all duration-200 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                isLogin ? 'Log in' : 'Sign up'
                            )}
                        </button>
                    </div>
                </form>
            )}

            {/* === Toggle Link === */}
            <p className="mt-8 text-center text-sm text-zinc-400">
                {isLogin ? "New to Geneie? " : "Already have an account? "}
                <button
                    type="button"
                    onClick={() => { setIsLogin(!isLogin); setError(''); setSignupSuccess(false); }}
                    className="font-medium text-[#4ad6cd] hover:text-[#38b1a8] hover:underline transition-colors duration-200"
                    disabled={loading}
                >
                    {isLogin ? 'Sign up' : 'Log in'}
                </button>
            </p>
        </div>
    );
};

export default AuthForm;
