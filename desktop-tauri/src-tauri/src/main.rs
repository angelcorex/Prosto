// Prevents a console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Prosto desktop shell (Tauri). A THIN client: it loads the deployed web app
//! by URL (https://prosto.ink) and reproduces the exact `window.prostoDesktop`
//! bridge the old Electron preload exposed, so ZERO web code changes.
//!
//! Commands mirror the Electron IPC 1:1:
//!   win_minimize / win_toggle_maximize / win_close / win_is_maximized
//!   badge_set / badge_clear · notify · popout · app_ready
//! Plus events emitted TO the web: `win:maximized-changed`.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

mod commands;
use commands::*;

/// The `window.prostoDesktop` bridge shim, injected before the remote page runs.
const SHIM: &str = include_str!("../shim/prosto-desktop.js");

/// The URL the main window opens at. `/feed` (not `/`) so a signed-in user lands
/// straight on the feed with no flash, and a signed-out user is redirected to
/// `/sign-in` on the SERVER — the public marketing landing page (rendered at `/`)
/// is never shown inside the desktop app.
const HOME_URL: &str = "https://prosto.ink/feed";

/// Guards against exchanging the same OAuth `code` twice. On Windows the
/// `prosto://` deep link can be delivered through BOTH the single-instance argv
/// hook AND the deep-link listener; without this, `handle_deep_link` navigates
/// the webview twice, the first navigation consumes the single-use code (and
/// clears the PKCE verifier), and the second surfaces "code verifier not found".
static LAST_AUTH_CODE: Mutex<Option<String>> = Mutex::new(None);

/// Route an incoming `prosto://` deep link (the OAuth return trip) into the
/// running main window. The web callback bounces the browser to
/// `prosto://auth?c=...&next=...`; we turn that back into a real
/// `https://prosto.ink/auth/desktop?c=...` navigation INSIDE the webview, where
/// the PKCE verifier cookie lives, so the code exchange completes CLIENT-SIDE
/// (the server route never sees the verifier on the desktop path) and the
/// session is established in the app. `/auth/desktop` then finalizes via
/// `/auth/callback?finalize=1`.
fn handle_deep_link<R: tauri::Runtime>(app: &tauri::AppHandle<R>, urls: &[Url]) {
    for u in urls {
        if u.scheme() != "prosto" {
            continue;
        }
        // Accept prosto://auth?... (host may land in either slot depending on
        // how the OS parses the URL — check both).
        let is_auth = u.host_str() == Some("auth") || u.path().trim_matches('/') == "auth";
        if !is_auth {
            continue;
        }
        let query = u.query().unwrap_or("");

        // Dedup: the same link can arrive twice on Windows (argv + listener).
        // Skip if we've already handled this exact code — a second navigation
        // would consume the single-use code again and fail the exchange.
        let code = u
            .query_pairs()
            .find(|(k, _)| k == "c")
            .map(|(_, v)| v.into_owned());
        if let Some(ref c) = code {
            let mut last = LAST_AUTH_CODE.lock().unwrap();
            if last.as_deref() == Some(c.as_str()) {
                continue;
            }
            *last = Some(c.clone());
        }

        let target = format!("https://prosto.ink/auth/desktop?{}", query);
        if let Ok(parsed) = target.parse() {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.navigate(parsed);
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    }
}

/// Best-effort connectivity check before the main window loads the remote app.
/// A plain TCP connect to `prosto.ink:443` with a short timeout — no new crates,
/// no DNS-less assumptions. Returns false when offline so the shell can show a
/// branded local `offline.html` instead of the WebView's native error page.
fn is_online() -> bool {
    use std::net::ToSocketAddrs;
    let addrs = match ("prosto.ink", 443).to_socket_addrs() {
        Ok(a) => a,
        Err(_) => return false,
    };
    for addr in addrs {
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(4)).is_ok() {
            return true;
        }
    }
    false
}

/// Hosts whose top-level navigation must be pushed to the system browser rather
/// than loaded in-app. OAuth providers (Google in particular) refuse to render
/// inside an embedded WebView, and we never want auth pages captured in-app.
/// Everything else (prosto.ink itself, plus embed hosts like YouTube/Vimeo used
/// inside the app) stays in the webview.
fn is_external_auth_host(host: &str) -> bool {
    const AUTH_HOSTS: &[&str] = &[
        "accounts.google.com",
        "github.com",
        "discord.com",
        "discordapp.com",
    ];
    AUTH_HOSTS.iter().any(|h| host == *h || host.ends_with(&format!(".{h}")))
        // Supabase's own auth host (…supabase.co /auth/v1/authorize) also bounces
        // through here on the way to the provider.
        || host.ends_with(".supabase.co")
}

fn main() {
    let shim = SHIM;
    tauri::Builder::default()
        // One running instance; a second launch focuses the existing window AND
        // carries the prosto:// deep link (OAuth return) into it. Registered
        // FIRST, before deep-link, per the plugin's requirements.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            // On Windows the deep link arrives as a CLI arg to the second process.
            let urls: Vec<Url> = argv
                .iter()
                .filter_map(|a| a.parse().ok())
                .collect();
            if !urls.is_empty() {
                handle_deep_link(app, &urls);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // Launch at login — VISIBLE (no hidden flag), matching the old shell.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Restore window size/position across launches (was window-state.js).
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Native OS notifications (was notify:show IPC).
        .plugin(tauri_plugin_notification::init())
        // Auto-update from GitHub releases (was electron-updater).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            // Splash window (local HTML), shown instantly; closed on app_ready.
            let _ = WebviewWindowBuilder::new(app, "splash", WebviewUrl::App("splash.html".into()))
                .title("Prosto")
                .inner_size(420.0, 260.0)
                .decorations(false)
                .center()
                .resizable(false)
                .always_on_top(true)
                .build();

            // Decide the initial URL up front: the remote app when online, or a
            // local branded offline page when there's no connection — so the
            // user never sees the WebView's native "can't reach this domain"
            // error. offline.html auto-retries and navigates to /feed on
            // reconnect.
            let online = is_online();
            let initial_url = if online {
                WebviewUrl::External(HOME_URL.parse().unwrap())
            } else {
                WebviewUrl::App("offline.html".into())
            };

            // Main window — loads the remote app, with the bridge shim injected
            // BEFORE the page runs. Hidden until app_ready swaps out the splash.
            let main = WebviewWindowBuilder::new(app, "main", initial_url)
            .title("Prosto")
            .inner_size(1280.0, 832.0)
            .min_inner_size(940.0, 560.0)
            .decorations(false)
            .center()
            .visible(false)
            .initialization_script(shim)
            // Safety net: if a top-level navigation heads to an OAuth provider
            // host, open it in the system browser and block the in-app load.
            // The web app normally opens auth via `openExternal` before this
            // fires; this catches any path that slips through (e.g. a provider
            // redirecting through another provider). prosto.ink + embed hosts
            // (YouTube/Vimeo players, images) are left to load normally.
            .on_navigation({
                let handle = app.handle().clone();
                move |url: &Url| {
                    if let Some(host) = url.host_str() {
                        if is_external_auth_host(host) {
                            let _ = tauri_plugin_opener::OpenerExt::opener(&handle)
                                .open_url(url.as_str(), None::<&str>);
                            return false;
                        }
                    }
                    true
                }
            })
            .build()?;

            // Offline: the local offline.html never calls signalReady (that's a
            // bridge invoke made by the web app), so drop the splash and show the
            // main window right away instead of waiting out the 8s failsafe.
            if !online {
                let _ = main.show();
                let _ = main.set_focus();
                if let Some(s) = app.get_webview_window("splash") {
                    let _ = s.close();
                }
            }

            // Emit maximize/unmaximize to the web so the custom titlebar's
            // maximize icon stays in sync (was win:maximized-changed).
            let w = main.clone();
            main.on_window_event(move |ev| {
                if let tauri::WindowEvent::Resized(_) = ev {
                    let is_max = w.is_maximized().unwrap_or(false);
                    let _ = w.emit("win:maximized-changed", is_max);
                }
            });

            build_tray(app.handle())?;

            // Deep link (prosto://auth?...) — the OAuth return trip. Force-register
            // the scheme so it works for the installed app on Windows, handle a
            // link that cold-started the app, and listen for links while running.
            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();
            }
            if let Ok(Some(start)) = app.deep_link().get_current() {
                handle_deep_link(app.handle(), &start);
            }
            let dl_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                handle_deep_link(&dl_handle, event.urls().as_slice());
            });

            // Launch at login (visible). Enable once on first run so existing
            // installs opt in too; the user can still disable it from the OS.
            {
                use tauri_plugin_autostart::ManagerExt;
                let am = app.autolaunch();
                if !am.is_enabled().unwrap_or(false) {
                    let _ = am.enable();
                }
            }

            // Failsafe: if the web app never calls app_ready (signalReady), show
            // the main window and drop the splash after 8s so we never hang.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(8));
                if let Some(m) = handle.get_webview_window("main") {
                    if !m.is_visible().unwrap_or(true) {
                        let _ = m.show();
                    }
                }
                if let Some(s) = handle.get_webview_window("splash") {
                    let _ = s.close();
                }
            });

            // Auto-update: check the release feed on startup and, if a newer
            // build exists, download + install it silently in the background.
            // The plugin was registered but never DRIVEN before, so 1.0.x users
            // never actually updated — this closes that gap. Runs off-thread so
            // it never blocks launch; installs on next restart.
            let up_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(up_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            win_minimize,
            win_toggle_maximize,
            win_close,
            win_is_maximized,
            badge_set,
            badge_clear,
            notify,
            popout,
            app_ready,
            open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prosto desktop");
}

/// Check the GitHub release feed and, if a newer signed build is available,
/// download and install it in the background. Best-effort: any failure (offline,
/// no update, bad signature) is swallowed so it never disrupts the app. The
/// installed update takes effect on the next launch.
async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(_) => return,
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let _ = update.download_and_install(|_chunk, _total| {}, || {}).await;
        }
        _ => {}
    }
}

/// Build a floating always-on-top popout window for a chat/channel path
/// (was win:popout). Exposed to commands.rs via this helper.
pub fn open_popout<R: tauri::Runtime>(app: &tauri::AppHandle<R>, rel_path: &str) {
    let url = format!("https://prosto.ink{}", rel_path);
    let _ = WebviewWindowBuilder::new(
        app,
        format!("popout-{}", fastrand_label()),
        WebviewUrl::External(url.parse().expect("valid popout url")),
    )
    .title("Prosto")
    .inner_size(400.0, 600.0)
    .always_on_top(true)
    .decorations(false)
    .build();
}

/// Cheap unique-ish label so multiple popouts don't collide.
fn fastrand_label() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}
