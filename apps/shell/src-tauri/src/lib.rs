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

pub mod sidecar;

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// The capability process this shell started, if it started one.
pub struct ServerHandle(std::sync::Mutex<Option<Child>>);

impl ServerHandle {
    fn attach() -> Self {
        Self(std::sync::Mutex::new(None))
    }

    fn started(child: Child) -> Self {
        Self(std::sync::Mutex::new(Some(child)))
    }

    fn owns_process(&self) -> bool {
        self.0.lock().map(|guard| guard.is_some()).unwrap_or(false)
    }

    /// Stop the process only if this shell started it. Attaching to a server that
    /// was already running means somebody else owns its lifetime.
    fn stop(&self) {
        let Ok(mut guard) = self.0.lock() else {
            return;
        };
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
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

fn node_binary() -> String {
    std::env::var(sidecar::NODE_ENV).unwrap_or_else(|_| String::from("node"))
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

    let child = Command::new(node_binary())
        .args(sidecar::server_args(install_root, port))
        .current_dir(&work_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("cannot start the capability process: {error}"))?;

    let handle = ServerHandle::started(child);
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

/// Entry point shared by `main.rs` and the mobile targets.
pub fn run() {
    let port = sidecar::resolve_port(std::env::var(sidecar::PORT_ENV).ok().as_deref());
    let start = declared_root()
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();

    let Some(root) = install_root(&start) else {
        fail(&format!(
            "the capability process is not reachable from {start:?}: no {} found in it or any parent",
            sidecar::UI_SCRIPT_REL
        ));
    };

    let server = match ensure_server(&root, port) {
        Ok(server) => server,
        Err(reason) => fail(&reason),
    };
    let owns_process = server.owns_process();
    let url = format!("http://127.0.0.1:{port}/");

    let built = tauri::Builder::default()
        .manage(server)
        .setup(move |app| {
            let target: tauri::Url = url
                .parse()
                .map_err(|error| format!("invalid capability URL {url}: {error}"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(target))
                .title("AIOS")
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

    app.run(move |app_handle, event| {
        if let RunEvent::Exit = event {
            if owns_process {
                app_handle.state::<ServerHandle>().stop();
            }
        }
    });
}

/// A GUI process has no terminal to read, so the reason goes to stderr *and* the
/// exit code is non-zero: a shell that silently shows nothing teaches nothing.
fn fail(reason: &str) -> ! {
    eprintln!("[aios-shell] {reason}");
    std::process::exit(1);
}
