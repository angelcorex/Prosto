/**
 * Bridge exposed by the Prosto desktop client. Present only when the web app
 * runs inside the desktop client; `undefined` in a normal browser.
 */
export {};

declare global {
  interface Window {
    prostoDesktop?: {
      isDesktop: true;
      platform: string;
      window: {
        minimize: () => void;
        toggleMaximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        onMaximizeChange: (cb: (value: boolean) => void) => () => void;
      };
      setBadge: (dataUrl: string, description?: string) => void;
      clearBadge: () => void;
      notify: (payload: { title: string; body: string; icon?: string; url?: string }) => void;
      /** Open a chat/channel path in a floating always-on-top widget window. */
      popout?: (relPath: string) => void;
      /** Tell the shell the app is interactive so it can drop the splash. */
      signalReady?: () => void;
      /** Open a URL in the OS default browser (used for OAuth sign-in). */
      openExternal?: (url: string) => void;
    };
  }
}
