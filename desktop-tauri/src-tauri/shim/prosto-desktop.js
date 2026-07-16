// prosto-desktop shim — injected into the remote web app BEFORE it runs, via
// Tauri's initialization script. It rebuilds the EXACT `window.prostoDesktop`
// bridge the old Electron preload exposed, on top of Tauri's invoke()/listen(),
// so NOT A SINGLE LINE of web code has to change.
//
// Contract reproduced 1:1 (see the old desktop/src/preload.js):
//   isDesktop, platform,
//   window.{minimize, toggleMaximize, close, isMaximized, onMaximizeChange},
//   setBadge(dataUrl, description), clearBadge(),
//   notify({title, body}), popout(relPath), signalReady()
(function () {
  'use strict';
  // Tauri v2 exposes these under window.__TAURI__ when withGlobalTauri = true.
  const T = window.__TAURI__;
  if (!T) return; // not running inside Tauri → leave window.prostoDesktop unset
  const invoke = T.core.invoke;
  const listen = T.event.listen;

  // Convert the PNG data URL the renderer draws (old badge API) into the raw
  // RGBA + dimensions Tauri's overlay-icon wants. Async; resolves to null on
  // failure so a bad badge can never throw into the app.
  function dataUrlToRgba(dataUrl) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || 16;
          const h = img.naturalHeight || 16;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);
          resolve({ rgba: Array.from(data), width: w, height: h });
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      } catch { resolve(null); }
    });
  }

  window.prostoDesktop = {
    isDesktop: true,
    platform: (T.os && T.os.platform && T.os.platform()) || 'unknown',
    window: {
      minimize: () => invoke('win_minimize'),
      toggleMaximize: () => invoke('win_toggle_maximize'),
      close: () => invoke('win_close'),
      isMaximized: () => invoke('win_is_maximized'),
      // Subscribe to maximize/unmaximize; returns an unsubscribe fn (same shape
      // the old preload returned, so desktop-titlebar.tsx works unchanged).
      onMaximizeChange: (cb) => {
        let un = () => {};
        listen('win:maximized-changed', (e) => cb(!!e.payload)).then((f) => { un = f; });
        return () => un();
      },
    },
    setBadge: async (dataUrl, description) => {
      const px = await dataUrlToRgba(dataUrl);
      if (!px) return;
      invoke('badge_set', { rgba: px.rgba, width: px.width, height: px.height, description });
    },
    clearBadge: () => invoke('badge_clear'),
    notify: (payload) => invoke('notify', { title: payload && payload.title, body: payload && payload.body }),
    popout: (relPath) => invoke('popout', { relPath }),
    signalReady: () => invoke('app_ready'),
    // Open a URL in the OS default browser (used for OAuth so the provider page
    // never loads inside the app window). Returns the invoke promise.
    openExternal: (url) => invoke('open_external', { url }),
  };
})();
