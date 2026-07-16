/**
 * Multi-account support — keep several accounts signed in on one device and
 * switch between them (Discord/Twitter style). Inactive accounts' refresh
 * tokens are stored encrypted in an HttpOnly cookie; all switching happens in
 * server actions with token rotation. See `@/lib/accounts` for the store.
 */

export { AccountsModal } from './components/accounts-modal';
export { AddAccountModal } from './components/add-account-modal';
export { AccountSwitcherRow } from './components/account-switcher-row';
export { AccountSwitchOverlay } from './components/account-switch-overlay';
export { logoutCurrentAccount } from './api/actions';
export type { AccountSummary } from './types';
