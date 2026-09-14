/**
 * Firebase auth error codes as sentences a person can act on.
 *
 * AuthForm still maps sign-in and sign-up codes inline; this covers the password-reset
 * and action-link codes, which none of those blocks handle.
 */
const MESSAGES = {
  'auth/invalid-action-code':
    'This link is invalid or has already been used. Request a new password reset email.',
  'auth/expired-action-code':
    'This link has expired. Request a new password reset email.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/too-many-requests':
    'Too many attempts. Wait a few minutes and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact support@geneie.chat.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
};

export function authErrorMessage(code, fallback = 'Something went wrong. Please try again.') {
  return MESSAGES[code] || fallback;
}
