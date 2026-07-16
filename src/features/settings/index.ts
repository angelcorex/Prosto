/**
 * Settings feature — public surface (privacy + global notification prefs).
 */
export { PrivacySettings } from './components/privacy-settings';
export { NotificationsSettings } from './components/notifications-settings';
export {
  setPrivacySettings, setNotifyPrefs,
  type PrivacyLevel, type PrivacySettings as PrivacySettingsValues, type NotifyPrefs,
} from './api/actions';
