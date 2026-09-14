import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    applyActionCode,
    confirmPasswordReset,
    verifyPasswordResetCode,
} from 'firebase/auth';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { auth } from '../services/firebase';
import { authErrorMessage } from '@/lib/authErrors';
import { useForcedTheme } from '@/hooks/useTheme';
import { useSeo } from '@/hooks/useSeo';

/**
 * Where Firebase's account emails land: password resets today, email verification too.
 *
 * Deliberately NOT wrapped in PublicRoute — that hard-redirects signed-in users to /app,
 * which would throw away the oobCode for anyone resetting on a device they are still
 * signed in on.
 */

const MIN_PASSWORD_LENGTH = 6;

const inputClass =
    'w-full h-10 px-3 pr-10 border border-zinc-800 rounded-md bg-black/90 text-sm text-white focus:border-zinc-500 focus:outline-none transition-colors';

const AuthActionPage = () => {
    useForcedTheme('dark');
    useSeo({
        title: 'Account · Geneie',
        description: 'Complete your account action',
        path: '/auth/action',
        noindex: true,
    });

    const navigate = useNavigate();
    const [params] = useSearchParams();
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    // 'checking' | 'ready' | 'saving' | 'done' | 'invalid'
    const [status, setStatus] = useState('checking');
    const [accountEmail, setAccountEmail] = useState('');
    const [errorText, setErrorText] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!oobCode || !mode) {
            setStatus('invalid');
            setErrorText('This link is missing information. Request a new email and try again.');
            return;
        }

        let active = true;

        if (mode === 'resetPassword') {
            // Checks the code before showing the form, so an expired link fails here rather
            // than after someone has typed a new password twice.
            verifyPasswordResetCode(auth, oobCode)
                .then((emailForCode) => {
                    if (!active) return;
                    setAccountEmail(emailForCode);
                    setStatus('ready');
                })
                .catch((err) => {
                    if (!active) return;
                    setStatus('invalid');
                    setErrorText(authErrorMessage(err.code, 'This link is invalid or has expired.'));
                });
        } else if (mode === 'verifyEmail') {
            applyActionCode(auth, oobCode)
                .then(() => {
                    if (!active) return;
                    localStorage.removeItem('pendingEmailVerification');
                    setStatus('done');
                })
                .catch((err) => {
                    if (!active) return;
                    setStatus('invalid');
                    setErrorText(authErrorMessage(err.code, 'This link is invalid or has expired.'));
                });
        } else {
            setStatus('invalid');
            setErrorText('This link is not something we can handle.');
        }

        return () => {
            active = false;
        };
    }, [mode, oobCode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) {
            setErrorText(`Password should be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (password !== confirm) {
            setErrorText('The two passwords do not match.');
            return;
        }

        setErrorText('');
        setStatus('saving');
        try {
            await confirmPasswordReset(auth, oobCode, password);
            setStatus('done');
            // Long enough to read the confirmation, short enough not to feel stuck.
            setTimeout(() => navigate('/auth'), 2500);
        } catch (err) {
            setStatus('ready');
            setErrorText(authErrorMessage(err.code, 'Could not set your new password. Try again.'));
        }
    };

    const heading =
        mode === 'verifyEmail' ? 'Verifying your email' : 'Choose a new password';

    return (
        <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center px-5 py-16">
            <div className="w-full max-w-[400px]">
                <h1 className="text-2xl sm:text-3xl font-medium tracking-tight mb-2 text-center">
                    {status === 'done' && mode === 'verifyEmail' ? 'Email verified' : heading}
                </h1>

                {status === 'checking' && (
                    <div className="flex items-center justify-center gap-2 text-sm text-zinc-400 mt-8">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Checking your link…</span>
                    </div>
                )}

                {status === 'invalid' && (
                    <>
                        <div className="flex items-start gap-2 px-3 py-2.5 mt-6 rounded-md text-xs bg-red-500/10 border border-red-500/20 text-red-300">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{errorText}</span>
                        </div>
                        <p className="mt-8 text-center text-sm text-zinc-400">
                            <Link
                                to="/auth"
                                className="font-medium text-[#60a5fa] hover:text-[#3b82f6] hover:underline transition-colors"
                            >
                                Back to log in
                            </Link>
                        </p>
                    </>
                )}

                {status === 'done' && (
                    <>
                        <div className="flex items-start gap-2 px-3 py-2.5 mt-6 rounded-md text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                                {mode === 'verifyEmail'
                                    ? 'Your email is verified. You can log in now.'
                                    : 'Password updated. Taking you to the login page…'}
                            </span>
                        </div>
                        <p className="mt-8 text-center text-sm text-zinc-400">
                            <Link
                                to="/auth"
                                className="font-medium text-[#60a5fa] hover:text-[#3b82f6] hover:underline transition-colors"
                            >
                                Go to log in
                            </Link>
                        </p>
                    </>
                )}

                {(status === 'ready' || status === 'saving') && (
                    <>
                        <p className="text-sm text-zinc-400 text-center mb-6">
                            For <span className="text-white">{accountEmail}</span>
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="new-password" className="block text-xs font-medium text-zinc-400">
                                    New password
                                </label>
                                <div className="relative">
                                    <input
                                        id="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="new-password"
                                        className={inputClass}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="confirm-password" className="block text-xs font-medium text-zinc-400">
                                    Confirm password
                                </label>
                                <input
                                    id="confirm-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                    className={inputClass}
                                />
                            </div>

                            {errorText && (
                                <div className="flex items-start gap-2 px-3 py-2.5 rounded-md text-xs bg-red-500/10 border border-red-500/20 text-red-300">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>{errorText}</span>
                                </div>
                            )}

                            <div className="pt-2 flex justify-center">
                                <button
                                    type="submit"
                                    disabled={status === 'saving' || password.length < MIN_PASSWORD_LENGTH}
                                    className="w-[60%] h-10 bg-gradient-to-b from-zinc-700 to-black hover:from-neutral-800 hover:to-black disabled:opacity-65 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white shadow-[0px_0.5px_0px_0px_#404040_inset,1px_4px_4px_1px_#171717] [text-shadow:0px_1px_2px_black] transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    {status === 'saving' ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        'Set new password'
                                    )}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthActionPage;
