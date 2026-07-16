//! Command implementations for the `window.prostoDesktop` bridge + the tray.

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use crate::open_popout;

// ── Window controls (was win:* IPC) ─────────────────────────────────────────

#[tauri::command]
pub fn win_minimize<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn win_toggle_maximize<R: Runtime>(window: tauri::Window<R>) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
pub fn win_close<R: Runtime>(window: tauri::Window<R>) {
    // Hide to tray instead of quitting (Discord-style), matching the old shell.
    let _ = window.hide();
}

#[tauri::command]
pub fn win_is_maximized<R: Runtime>(window: tauri::Window<R>) -> bool {
    window.is_maximized().unwrap_or(false)
}

// ── Taskbar overlay badge (was badge:set / badge:clear) ──────────────────────
// The renderer draws a small PNG and passes it as raw RGBA bytes; we set it as
// the taskbar overlay icon. On platforms without overlay support this is a
// silent no-op (same effective behaviour as the old shell).

#[tauri::command]
pub fn badge_set<R: Runtime>(window: tauri::Window<R>, rgba: Vec<u8>, width: u32, height: u32, _description: Option<String>) {
    if rgba.is_empty() || width == 0 || height == 0 {
        return;
    }
    let icon = Image::new_owned(rgba, width, height);
    let _ = window.set_overlay_icon(Some(icon));
}

#[tauri::command]
pub fn badge_clear<R: Runtime>(window: tauri::Window<R>) {
    let _ = window.set_overlay_icon(None);
}

// ── Native notification (was notify:show) ────────────────────────────────────

#[tauri::command]
pub fn notify<R: Runtime>(app: AppHandle<R>, title: Option<String>, body: Option<String>) {
    let _ = app
        .notification()
        .builder()
        .title(title.unwrap_or_else(|| "Prosto".into()))
        .body(body.unwrap_or_default())
        .show();
}

// ── Popout window (was win:popout) ───────────────────────────────────────────

#[tauri::command]
pub fn popout<R: Runtime>(app: AppHandle<R>, rel_path: String) {
    // Only allow same-app relative paths (no external URLs / no scheme).
    if rel_path.starts_with('/') && !rel_path.starts_with("//") {
        open_popout(&app, &rel_path);
    }
}

// ── Open a URL in the system browser (OAuth, external links) ─────────────────
// The web app calls this for social sign-in so the provider page (GitHub /
// Google / Discord) opens in the user's real browser instead of hijacking the
// app window. Only http(s) is allowed — never a custom scheme or a local path.

#[tauri::command]
pub fn open_external<R: Runtime>(app: AppHandle<R>, url: String) {
    if url.starts_with("https://") || url.starts_with("http://") {
        let _ = app.opener().open_url(url, None::<&str>);
    }
}

// ── Ready handoff (was app:ready → close splash + show main) ──────────────────

#[tauri::command]
pub fn app_ready<R: Runtime>(app: AppHandle<R>) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

// ── System tray (was tray.js) ────────────────────────────────────────────────

pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Prosto", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .tooltip("Prosto")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
