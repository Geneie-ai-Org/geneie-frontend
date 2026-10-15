import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { postLoginPath } from '@/lib/postLoginPath';
import { auth, GoogleAuthProvider, OAuthProvider } from '../services/firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    sendEmailVerification,
    sendPasswordResetEmail,
    signOut,
    applyActionCode,
    linkWithCredential,
    EmailAuthProvider,
} from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { authErrorMessage } from '@/lib/authErrors';
import { Button } from '@/components/ui/button';
import {
    TextField,
    PasswordField,
    Notice,
    SubmitButton,
    PasswordRules,
} from '@/components/public/AuthFields';

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign-in and sign-up codes get specific sentences; anything else falls back to the shared helper. */
function signInErrorMessage(code) {
    switch (code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
            return 'Email or password is incorrect. Check them and try again, or reset your password.';
        case 'auth/email-already-in-use':
            return 'This email is already registered. Log in instead, or reset your password.';
        default:
            return authErrorMessage(code, 'Could not complete that. Please try again.');
    }
}

function providerFailureMessage(providerName, err) {
    switch (err?.code) {
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return 'Sign-in was cancelled. Try again when you are ready.';
        case 'auth/popup-blocked':
            return 'Your browser blocked the sign-in window. Allow popups for this site and try again.';
        default:
            return authErrorMessage(err?.code, `${providerName} sign-in failed. Please try again.`);
    }
}

const GoogleMark = () => (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const MicrosoftMark = () => (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 23 23" fill="none" aria-hidden="true">
        <rect width="11" height="11" fill="#F25022" />
        <rect x="12" width="11" height="11" fill="#7FBA00" />
        <rect y="12" width="11" height="11" fill="#00A4EF" />
        <rect x="12" y="12" width="11" height="11" fill="#FFB900" />
    </svg>
);

const AuthForm = ({ triggerReason = 'default', onSignupSuccess, onEmailVerificationPending }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    /* Which request is in flight: 'google' | 'microsoft' | 'email' | 'link' | null. */
    const [busy, setBusy] = useState(null);
    const loading = busy !== null;
    const [signupSuccess, setSignupSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [verifyingEmail, setVerifyingEmail] = useState(false);
    const [verificationSuccess, setVerificationSuccess] = useState(false);
    const [inlineMessage, setInlineMessage] = useState(null);
    /* Separate from isLogin, which already drives headings, autoComplete and the submit
     * label — overloading it with a third value would touch all of those. */
    const [resetMode, setResetMode] = useState(false);

    // Inline validation: a field shows its error once it has been left or a submit was tried.
    const [touched, setTouched] = useState({ email: false, password: false });
    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    // Account linking state
    const [pendingCredential, setPendingCredential] = useState(null);
    const [showLinkingPrompt, setShowLinkingPrompt] = useState(false);
    const [linkingEmail, setLinkingEmail] = useState('');
    const [linkingPassword, setLinkingPassword] = useState('');

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
                    setInlineMessage({ type: 'success', text: 'Email verified. You can log in now.' });
                })
                .catch((err) => {
                    setVerifyingEmail(false);
                    window.history.replaceState({}, '', window.location.pathname);
                    setInlineMessage({
                        type: 'error',
                        text: authErrorMessage(err.code, 'We could not verify your email. The link may have expired; log in to request a new one.'),
                    });
                });
        }
    }, []);

    /* createFirestoreProfile was removed: the backend auto-provisions the user document
     * on the first authenticated request (user_dependency -> user_store.ensure_user), so
     * the client no longer needs to create one — and can no longer write to it at all.
     */

    // Google Sign-In handler
    const handleGoogleSignIn = async () => {
        setError('');
        setInlineMessage(null);
        setBusy('google');

        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Profile creation happens server-side on the first authenticated request.

            if (onSignupSuccess) {
                onSignupSuccess(true);
            }
            navigate(postLoginPath(location));
        } catch (err) {
            if (err.code === 'auth/account-exists-with-different-credential') {
                // Handle account linking
                const pendingCred = err.credential;
                const linkingEmail = err.email;
                setPendingCredential(pendingCred);
                setLinkingEmail(linkingEmail);
                setShowLinkingPrompt(true);
                setError('');
                setBusy(null);
                return;
            }

            setInlineMessage({ type: 'error', text: providerFailureMessage('Google', err) });
            setBusy(null);
        }
    };

    // Microsoft Sign-In handler
    const handleMicrosoftSignIn = async () => {
        setError('');
        setInlineMessage(null);
        setBusy('microsoft');

        try {
            const provider = new OAuthProvider('microsoft.com');
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // Profile creation happens server-side on the first authenticated request.

            if (onSignupSuccess) {
                onSignupSuccess(true);
            }
            navigate(postLoginPath(location));
        } catch (err) {
            if (err.code === 'auth/account-exists-with-different-credential') {
                // Handle account linking
                const pendingCred = err.credential;
                const linkingEmail = err.email;
                setPendingCredential(pendingCred);
                setLinkingEmail(linkingEmail);
                setShowLinkingPrompt(true);
                setError('');
                setBusy(null);
                return;
            }

            setInlineMessage({ type: 'error', text: providerFailureMessage('Microsoft', err) });
            setBusy(null);
        }
    };

    // Account linking handler
    const handleAccountLinking = async (linkingEmail, linkingPassword) => {
        setError('');
        setInlineMessage(null);
        setBusy('link');

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

            if (onSignupSuccess) {
                onSignupSuccess(true);
            }
            navigate(postLoginPath(location));
        } catch (err) {
            let friendlyError = 'We could not link the accounts. Please try again.';
            if (err.code) {
                switch (err.code) {
                    case 'auth/wrong-password':
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential':
                        friendlyError = 'That password is not correct. Try again.';
                        break;
                    case 'auth/credential-already-in-use':
                        friendlyError = 'This account is already linked. Log in with it directly.';
                        break;
                    default:
                        friendlyError = authErrorMessage(err.code, friendlyError);
                }
            }
            setInlineMessage({ type: 'error', text: friendlyError });
            setBusy(null);
        }
    };

    const cancelAccountLinking = () => {
        setPendingCredential(null);
        setShowLinkingPrompt(false);
        setLinkingEmail('');
        setLinkingPassword('');
        setInlineMessage(null);
        setError('');
    };

    // Field-level validation (presentation only; the request is still made by handleSubmit).
    const emailError = !email.trim()
        ? 'Enter your email address.'
        : !EMAIL_PATTERN.test(email.trim())
            ? 'Enter a valid email address, like name@lab.org.'
            : '';
    const passwordError = resetMode
        ? ''
        : !password
            ? (isLogin ? 'Enter your password.' : 'Choose a password.')
            : (!isLogin && password.length < MIN_PASSWORD_LENGTH)
                ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
                : '';
    const showEmailError = touched.email && emailError;
    const showPasswordError = touched.password && passwordError;

    // Email/Password form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setTouched({ email: true, password: true });
        if (emailError || passwordError) {
            setInlineMessage(null);
            (emailError ? emailRef : passwordRef).current?.focus();
            return;
        }
        setError('');
        setSignupSuccess(false);
        setInlineMessage(null);
        setBusy('email');

        try {
            if (resetMode) {
                await sendPasswordResetEmail(auth, email, {
                    // Where Firebase sends them after the reset completes. Origin-relative so
                    // a preview deployment continues to itself rather than to production.
                    url: `${window.location.origin}/auth`,
                    handleCodeInApp: false,
                });
                setInlineMessage({
                    type: 'success',
                    text: `If an account exists for ${email}, we've sent a reset link. Check your inbox, including spam.`,
                });
                setTouched({ email: false, password: false });
                return;
            }

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
                    setInlineMessage({
                        type: 'error',
                        text: 'Your email is not verified yet. Open the verification link we sent you (check spam), then log in.',
                    });
                    await signOut(auth);
                    return;
                }

                if (onSignupSuccess) {
                    onSignupSuccess(true);
                }
                navigate(postLoginPath(location));

            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await sendEmailVerification(user);

                localStorage.setItem('pendingEmailVerification', email);

                if (onEmailVerificationPending) {
                    onEmailVerificationPending(true);
                }

                await signOut(auth);

                setInlineMessage({
                    type: 'success',
                    text: `Account created. We sent a verification link to ${email}. Verify it, then log in here.`,
                });
                setIsLogin(true); // Automatically toggle to login flow
                setPassword('');
                setTouched({ email: false, password: false });
            }
        } catch (err) {
            /* A reset request answers the same way whether or not the address has an
             * account — anything else tells a stranger who is registered here. Rate
             * limiting is about the requester, not the account, so it is worth saying. */
            if (resetMode) {
                if (err.code === 'auth/too-many-requests' || err.code === 'auth/invalid-email') {
                    setInlineMessage({ type: 'error', text: authErrorMessage(err.code) });
                } else {
                    setInlineMessage({
                        type: 'success',
                        text: `If an account exists for ${email}, we've sent a reset link. Check your inbox, including spam.`,
                    });
                }
                return;
            }

            setInlineMessage({ type: 'error', text: signInErrorMessage(err.code) });
        } finally {
            setBusy(null);
        }
    };

    const switchMode = () => {
        if (resetMode) {
            setResetMode(false);
            setIsLogin(true);
        } else {
            setIsLogin(!isLogin);
        }
        setError('');
        setSignupSuccess(false);
        setInlineMessage(null);
        setTouched({ email: false, password: false });
    };

    // Contextual heading
    let mainHeading = isLogin ? 'Log in to Geneie' : 'Create your account';
    let subMessage = isLogin
        ? 'Welcome back. Continue with your work account or email.'
        : 'Start with your work account or email.';

    if (resetMode) {
        mainHeading = 'Reset your password';
        subMessage = "Enter the email you signed up with and we'll send you a link to set a new password.";
    }

    if (triggerReason === 'guestLimit') {
        mainHeading = 'Free preview ended';
        subMessage = 'Your 5 free exchanges are used. Log in or create an account to keep your progress and continue.';
    }

    const submitLabel = resetMode ? 'Send reset link' : isLogin ? 'Log in' : 'Create account';
    const submitBusyLabel = resetMode ? 'Sending link…' : isLogin ? 'Logging in…' : 'Creating account…';

    return (
        <div className="w-full">
            {/* === Header === */}
            <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {showLinkingPrompt ? 'Link your account' : mainHeading}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {showLinkingPrompt ? (
                        <>
                            An account already exists for <strong className="font-medium text-foreground">{linkingEmail}</strong>.
                            Enter its password once to connect your{' '}
                            {pendingCredential?.providerId?.includes('google') ? 'Google' : 'Microsoft'} sign-in.
                        </>
                    ) : (
                        subMessage
                    )}
                </p>
            </div>

            {verifyingEmail && (
                <Notice type="info" className="mb-5">
                    <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Verifying your email…
                    </span>
                </Notice>
            )}

            {inlineMessage && (
                <Notice type={inlineMessage.type} className="mb-5">
                    {inlineMessage.text}
                </Notice>
            )}

            {/* === Account Linking Prompt === */}
            {showLinkingPrompt && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (linkingPassword) handleAccountLinking(linkingEmail, linkingPassword);
                    }}
                    className="space-y-4"
                >
                    <TextField id="linking-email" label="Email" type="email" value={linkingEmail} readOnly />
                    <PasswordField
                        id="linking-password"
                        label="Password"
                        value={linkingPassword}
                        onChange={(e) => setLinkingPassword(e.target.value)}
                        autoComplete="current-password"
                        autoFocus
                    />
                    <div className="flex gap-2 pt-1">
                        <SubmitButton
                            loading={busy === 'link'}
                            loadingLabel="Linking…"
                            disabled={!linkingPassword}
                            className="flex-1"
                        >
                            Link accounts
                        </SubmitButton>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11 px-4"
                            onClick={cancelAccountLinking}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            )}

            {/* === Social sign-in: the fastest path, so it comes first === */}
            {!showLinkingPrompt && !resetMode && (
                <>
                    <div className="space-y-2.5">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            aria-busy={busy === 'google' || undefined}
                            className="h-11 w-full gap-2.5 text-sm font-medium"
                        >
                            {busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GoogleMark />}
                            Continue with Google
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleMicrosoftSignIn}
                            disabled={loading}
                            aria-busy={busy === 'microsoft' || undefined}
                            className="h-11 w-full gap-2.5 text-sm font-medium"
                        >
                            {busy === 'microsoft' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MicrosoftMark />}
                            Continue with Microsoft
                        </Button>
                    </div>

                    <div className="my-6 flex items-center gap-3" role="separator" aria-label="or">
                        <div className="h-px flex-1 bg-border" />
                        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">or use email</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                </>
            )}

            {/* === Email form === */}
            {!showLinkingPrompt && (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <TextField
                        id="email"
                        ref={emailRef}
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                        autoComplete="email"
                        inputMode="email"
                        error={showEmailError || undefined}
                        placeholder="name@lab.org"
                    />

                    {!resetMode && (
                        <div className="space-y-3">
                            <PasswordField
                                id="password"
                                ref={passwordRef}
                                label="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                show={showPassword}
                                onToggle={() => setShowPassword((v) => !v)}
                                error={showPasswordError && (isLogin || !password) ? showPasswordError : undefined}
                                labelAction={isLogin ? (
                                    <button
                                        type="button"
                                        onClick={() => { setResetMode(true); setPassword(''); setInlineMessage(null); setTouched({ email: false, password: false }); }}
                                        className="-my-2 rounded-md py-2 text-xs font-medium text-primary hover:underline"
                                        disabled={loading}
                                    >
                                        Forgot password?
                                    </button>
                                ) : null}
                            />
                            {!isLogin && <PasswordRules password={password} minLength={MIN_PASSWORD_LENGTH} />}
                        </div>
                    )}

                    <SubmitButton loading={busy === 'email'} loadingLabel={submitBusyLabel} disabled={loading} className="mt-2">
                        {submitLabel}
                    </SubmitButton>
                </form>
            )}

            {/* === Toggle + consent === */}
            {!showLinkingPrompt && (
                <>
                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        {resetMode ? 'Remembered it? ' : isLogin ? 'New to Geneie? ' : 'Already have an account? '}
                        <button
                            type="button"
                            onClick={switchMode}
                            className="rounded-sm py-2 font-medium text-primary hover:underline"
                            disabled={loading}
                        >
                            {resetMode ? 'Back to log in' : isLogin ? 'Create an account' : 'Log in'}
                        </button>
                    </p>
                    {!isLogin && !resetMode && (
                        <p className="mt-2 text-center text-xs leading-5 text-[var(--text-tertiary)]">
                            By creating an account you agree to the{' '}
                            <Link to="/legal/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">Terms</Link>
                            {' '}and{' '}
                            <Link to="/legal/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default AuthForm;
