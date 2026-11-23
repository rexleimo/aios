//! AIOS desktop shell.
//!
//! The shell owns a window and the lifecycle of the capability process behind it.
//! It owns no facts: the page it loads asks `apps/shell/data/load.mjs` for the
//! matrix, and the server that renders it is the process this crate starts.
//!
//! Start order, and why it is this order:
//!
//! 1. Resolve the port (one declaration) and the install root.
//! 2. If the port already answers, attach — that is the development flow, where
//!    `npm run ui` is already running. Otherwise start the capability process with a
//!    CWD outside the install tree and wait for it to listen.
//! 3. Only then build the window, so the first paint is the real page rather than an
//!    error page that never reloads.
//!
//! Step 2 blocks on purpose. A window that shows "connection refused" and then
//! recovers would leave the user unable to tell "slow" from "broken".
//!
//! The third guarantee is that the process does not outlive the shell: `job` puts it
//! in a kill-on-close Job Object (Windows) or its own process group (Unix), because a
//! forced kill never runs an exit handler.

pub mod job;
pub mod sidecar;

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use tauri::{include_image, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The capability process this shell started, if it started one.
pub struct ServerHandle(std::sync::Mutex<Option<(Child, job::ProcessGuard)>>);

impl ServerHandle {
    fn attach() -> Self {
        Self(std::sync::Mutex::new(None))
    }

    fn started(child: Child, guard: job::ProcessGuard) -> Self {
        Self(std::sync::Mutex::new(Some((child, guard))))
    }

    fn owns_process(&self) -> bool {
        self.0.lock().map(|guard| guard.is_some()).unwrap_or(false)
    }

    /// Stop the process only if this shell started it. Attaching to a server that
    /// was already running means somebody else owns its lifetime.
    fn stop(&self) {
        let Ok(mut slot) = self.0.lock() else {
            return;
        };
        if let Some((mut child, guard)) = slot.take() {
            guard.terminate(&mut child);
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// The install root: the nearest ancestor (inclusive) holding `scripts/aios-ui.mjs`.
///
/// Walking upward is what makes a repository checkout work with no environment
/// variable; a packaged build declares `AIOS_SHELL_ROOT` instead of guessing.
pub fn install_root(start: &Path) -> Option<PathBuf> {
    let mut current = Some(start);
    while let Some(directory) = current {
        if sidecar::script_path(directory).is_file() {
            return Some(directory.to_path_buf());
        }
        current = directory.parent();
    }
    None
}

fn declared_root() -> Option<PathBuf> {
    std::env::var_os("AIOS_SHELL_ROOT").map(PathBuf::from)
}

fn node_binary(install_root: &Path) -> String {
    if let Ok(declared) = std::env::var(sidecar::NODE_ENV) {
        return declared;
    }
    // A self-contained bundle carries its own Node so the user needs no runtime
    // installed. A dev checkout has no bundled binary and falls back to PATH.
    let bundled = sidecar::bundled_node(install_root);
    if bundled.is_file() {
        return bundled.to_string_lossy().into_owned();
    }
    String::from("node")
}

fn volatile_work_dir() -> PathBuf {
    std::env::temp_dir().join("aios-shell")
}

/// Attach to a running capability process, or start one.
///
/// `Err(reason)` means the process was started and never listened. A port that
/// already answers is not an error — it is the development flow.
fn ensure_server(install_root: &Path, port: u16) -> Result<ServerHandle, String> {
    let address = sidecar::loopback(port);
    if sidecar::is_listening(address) {
        return Ok(ServerHandle::attach());
    }

    let work_dir = sidecar::resolve_work_dir(
        install_root,
        &std::env::current_dir().unwrap_or_default(),
        &volatile_work_dir(),
    );
    std::fs::create_dir_all(&work_dir)
        .map_err(|error| format!("cannot create the working directory {work_dir:?}: {error}"))?;

    let mut command = Command::new(node_binary(install_root));
    command
        .args(sidecar::server_args(install_root, port))
        .current_dir(&work_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = job::spawn_supervised(&mut command)
        .map_err(|error| format!("cannot start the capability process: {error}"))?;
    let guard = job::ProcessGuard::adopt(&child);
    if !guard.is_supervised() {
        // Not fatal: the window still works. It is fatal to the *promise* that a
        // forced kill reclaims the child, so it is said out loud rather than assumed.
        eprintln!(
            "[aios-shell] warning: the capability process is not in a kill-on-close job; \
             a forced kill of the shell will leave it running"
        );
    }

    let handle = ServerHandle::started(child, guard);
    if sidecar::wait_until_listening(
        address,
        sidecar::STARTUP_TIMEOUT,
        sidecar::PROBE_INTERVAL,
        sidecar::is_listening,
    ) {
        return Ok(handle);
    }
    Err(format!(
        "the capability process did not listen on {address} within {:?}",
        sidecar::STARTUP_TIMEOUT
    ))
}

/// Resolve the capability tree from a list of candidates, first one holding the
/// launcher wins. Kept separate from `run()` so the ordering itself is testable.
fn resolve_root(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|dir| sidecar::script_path(dir).is_file()).cloned()
}

/// Entry point shared by `main.rs` and the mobile targets.
pub fn run() {
    let port = sidecar::resolve_port(std::env::var(sidecar::PORT_ENV).ok().as_deref());

    let built = tauri::Builder::default()
        .setup(move |app| {
            // Three entry points, one rule: declared override > self-contained bundle
            // > a plain checkout. Tauri owns the platform-specific resource path
            // (Windows exe dir, macOS ../Resources, Linux /usr/lib/<name>), so asking
            // `app.path()` is the only correct way to find the bundled tree.
            let mut candidates: Vec<PathBuf> = Vec::new();
            if let Some(declared) = declared_root() {
                candidates.push(declared);
            }
            if let Ok(resources) = app.path().resource_dir() {
                candidates.push(resources.join(sidecar::BUNDLE_RUNTIME_REL));
            }
            if let Some(cwd) = std::env::current_dir().ok() {
                if let Some(found) = install_root(&cwd) {
                    candidates.push(found);
                }
            }
            let root = resolve_root(&candidates).ok_or_else(|| {
                std::io::Error::other(format!(
                    "the capability process is not reachable: no {} found in the declared root, the bundle resources, or the working directory",
                    sidecar::UI_SCRIPT_REL
                ))
            })?;

            let server = ensure_server(&root, port).map_err(std::io::Error::other)?;
            app.manage(server);

            // The token is minted by whoever runs the server, so it is read after the
            // server answers. No token means no gate, and no gate means no window.
            let published = sidecar::token_path(port, &std::env::temp_dir());
            let token = sidecar::read_token(
                std::env::var(sidecar::TOKEN_ENV).ok().as_deref(),
                &published,
            ).ok_or_else(|| {
                std::io::Error::other(format!(
                    "the capability process published no token at {published:?}; refusing to open an ungated page"
                ))
            })?;
            let url = sidecar::bootstrap_url(port, &token);
            let target: tauri::Url = url
                .parse()
                .map_err(|error| std::io::Error::other(format!("invalid capability URL {url}: {error}")))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(target))
                .title("AIOS")
                .icon(include_image!("icons/32x32.png"))?
                .inner_size(1280.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!());

    let app = match built {
        Ok(app) => app,
        Err(error) => fail(&format!("cannot build the shell: {error}")),
    };

    app.run(move |_app_handle, event| {
        if let RunEvent::Exit = event {
            // ServerHandle is managed; stop() is a no-op when we did not start it.
            if let Some(state) = _app_handle.try_state::<ServerHandle>() {
                state.stop();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_candidate_holding_the_launcher_wins() {
        let base = std::env::temp_dir().join(format!("aios-root-test-{}", std::process::id()));
        let declared = base.join("declared");
        let bundled = base.join("bundled");
        let script = sidecar::script_path(&bundled);
        std::fs::create_dir_all(script.parent().unwrap()).unwrap();
        std::fs::write(&script, "// fixture\n").unwrap();

        // A declared path that exists but is not a capability tree is skipped.
        std::fs::create_dir_all(&declared).unwrap();
        assert_eq!(resolve_root(&[declared.clone(), bundled.clone()]), Some(bundled));
        assert_eq!(resolve_root(&[declared]), None);
        std::fs::remove_dir_all(&base).ok();
    }
}

/// A GUI process has no terminal to read, so the reason goes to stderr *and* the
/// exit code is non-zero: a shell that silently shows nothing teaches nothing.
fn fail(reason: &str) -> ! {
    eprintln!("[aios-shell] {reason}");
    std::process::exit(1);
}
