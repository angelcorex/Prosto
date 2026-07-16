import type { ReactNode } from 'react';

import { SettingsShell } from './settings-shell';

/**
 * Settings render as a full-screen overlay on top of the app. The nav shell
 * lives here (in the layout) so it persists across tab navigations — switching
 * a tab only swaps the content, no full reload / skeleton flash
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-overlay fixed inset-0 z-modal flex bg-background animate-fade-in">
      <div className="relative flex h-full w-full overflow-hidden bg-card">
        <SettingsShell>{children}</SettingsShell>
      </div>
    </div>
  );
}
