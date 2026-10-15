import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    applyActionCode,
    confirmPasswordReset,
    verifyPasswordResetCode,
} from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth } from '../services/firebase';
import { authErrorMessage } from '@/lib/authErrors';
import AuthPageLayout from '@/components/chat/AuthPageLayout';
import { PasswordField, Notice, SubmitButton, PasswordRules } from '@/components/public/AuthFields';
import { useSeo } from '@/hooks/useSeo';

/**
 * Where Firebase's account emails land: password resets today, email verification too.
 *
 * Deliberately NOT wrapped in PublicRoute — that hard-redirects signed-in users to /app,
 * which would throw away the oobCode for anyone resetting on a device they are still
 * signed in on.
 */

const MIN_PASSWORD_LENGTH = 6;

const AuthActionPage = () => {
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
    const title = status === 'done' && mode === 'verifyEmail' ? 'Email verified' : status === 'invalid' ? 'This link cannot be used' : heading;

    const linkClass = 'inline-flex h-11 items-center justify-center rounded-lg text-sm font-medium text-primary hover:underline';

    return (
        <AuthPageLayout>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

            {status === 'checking' && (
                <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{mode === 'verifyEmail' ? 'Verifying your email…' : 'Checking your link…'}</span>
                </div>
            )}

            {status === 'invalid' && (
                <>
                    <Notice type="error" className="mt-5">{errorText}</Notice>
                    <p className="mt-6">
                        <Link to="/auth" className={linkClass}>Back to log in to request a new link</Link>
                    </p>
                </>
            )}

            {status === 'done' && (
                <>
                    <Notice type="success" className="mt-5">
                        {mode === 'verifyEmail'
                            ? 'Your email is verified. You can log in now.'
                            : 'Password updated. Taking you to the login page…'}
                    </Notice>
                    <p className="mt-6">
                        <Link to="/auth" className={linkClass}>Go to log in</Link>
                    </p>
                </>
            )}

            {(status === 'ready' || status === 'saving') && (
                <>
                    <p className="mt-2 text-sm text-muted-foreground">
                        For <span className="font-medium text-foreground">{accountEmail}</span>
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                        <div className="space-y-3">
                            <PasswordField
                                id="new-password"
                                label="New password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                autoFocus
                            />
                            <PasswordRules password={password} minLength={MIN_PASSWORD_LENGTH} />
                        </div>

                        <PasswordField
                            id="confirm-password"
                            label="Confirm password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            error={confirm && password !== confirm ? 'The two passwords do not match.' : undefined}
                        />

                        {errorText && <Notice type="error">{errorText}</Notice>}

                        <SubmitButton
                            loading={status === 'saving'}
                            loadingLabel="Saving…"
                            disabled={password.length < MIN_PASSWORD_LENGTH}
                        >
                            Set new password
                        </SubmitButton>
                    </form>
                </>
            )}
        </AuthPageLayout>
    );
};

export default AuthActionPage;
