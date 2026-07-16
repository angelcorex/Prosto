/**
 * Auth feature — public surface.
 */
export { AuthCard } from './components/auth-card';
export { SignInForm } from './components/sign-in-form';
export { SignUpForm } from './components/sign-up-form';
export { CodeLoginForm } from './components/code-login-form';
export { ForgotPasswordForm } from './components/forgot-password-form';
export { ResetPasswordForm } from './components/reset-password-form';
export { ChangePasswordForm } from './components/change-password-form';
export { DeleteAccountDialog } from './components/delete-account-dialog';
export { AuthWatcher } from './components/auth-watcher';
export { signIn, signUp, signOut, changePassword, deleteAccount } from './api/actions';
export { loginWithCode, requestPasswordReset, updateRecoveryPassword } from './api/email-auth';
export { PASSWORD_MIN_LENGTH } from './validation';
export { validateUsernameFormat, normalizeUsername, USERNAME_MIN, USERNAME_MAX } from './username-rules';
