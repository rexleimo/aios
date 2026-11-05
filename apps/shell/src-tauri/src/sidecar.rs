// The capability process the window hosts.
//
// ADR 0007 decision 3 splits the two: a resident process owns ContextDB, memory,
// the CLI, files and child processes; the window, the browser panel and the TUI are
// only views. This module is the shell's half of that split — it decides *whether*
// to start the capability process, *where* it may run, and *when* the window may
// load the page. It does not know what the page shows.
//
// Two rules here are not style choices:
//
// 1. The capability process must not have its CWD inside the install tree. Measured
//    in 6.9.0: a process whose CWD sits inside that subtree makes the directory
//    move during `aios update` fail with EPERM/EBUSY; killing it restores the move.
//    `resolve_work_dir` is the single owner of that judgement.
// 2. The port has one declaration. It is `AIOS_UI_PORT`, else the default — and the
//    default is pinned to `scripts/aios-ui.mjs` by a test, so the two cannot drift.
use std::ffi::OsString;
use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

/// Must equal `UI_DEFAULT_PORT` in `scripts/aios-ui.mjs`; pinned by
/// `scripts/tests/tooling/shell/shell-sidecar.test.mjs`.
pub const DEFAULT_UI_PORT: u16 = 3126;

/// The capability-process entry point, relative to the install root.
pub const UI_SCRIPT_REL: &str = "scripts/aios-ui.mjs";

/// How long the window waits for the capability process before it reports failure.
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(45);

/// Poll interval while waiting for the listening socket.
pub const PROBE_INTERVAL: Duration = Duration::from_millis(150);

pub const PORT_ENV: &str = "AIOS_UI_PORT";
pub const NODE_ENV: &str = "AIOS_NODE";
/// The token the capability process publishes; also readable as an environment
/// variable so an operator can pin one instead of letting the server mint it.
pub const TOKEN_ENV: &str = "AIOS_UI_TOKEN";

/// Where the launcher publishes the token for a port. Kept in the volatile temp
/// directory, one file per port: two ports are two services, and two keys.
pub fn token_path(port: u16, temp_dir: &Path) -> PathBuf {
    temp_dir.join(format!("aios-ui-token-{port}"))
}

/// The token, from the declaration first, then from the published file.
///
/// `None` means no token exists, and the caller must refuse to open the page: an
/// ungated capability process is exactly the state the gate exists to prevent.
pub fn read_token(declared: Option<&str>, path: &Path) -> Option<String> {
    if let Some(value) = declared {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    std::fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// The URL the window opens. The launcher mints the token, the gate exchanges it for
/// a cookie, and the page itself is `/`; this shape must match
/// `bootstrapUiUrl` in `scripts/aios-ui.mjs` and `bootstrapUrl` in the gate's module.
pub fn bootstrap_url(port: u16, token: &str) -> String {
    format!("http://127.0.0.1:{port}/t/{token}/")
}

/// The declared port, or the default. An unusable declaration falls back instead of
/// reaching the server: a port of `0` or `70000` must not become a different fact
/// silently, and it must not be forwarded either.
pub fn resolve_port(declared: Option<&str>) -> u16 {
    declared
        .and_then(|value| value.trim().parse::<u32>().ok())
        .filter(|value| *value > 0 && *value < 65_536)
        .map(|value| value as u16)
        .unwrap_or(DEFAULT_UI_PORT)
}

/// The server script inside a given install root.
pub fn script_path(install_root: &Path) -> PathBuf {
    install_root.join(UI_SCRIPT_REL)
}

/// Arguments for `scripts/aios-ui.mjs`: the mode, then the declared port.
///
/// `start` rather than `dev`: the shell serves what `next build` produced, so the
/// window and the browser panel load the same artifact.
pub fn server_args(install_root: &Path, port: u16) -> Vec<OsString> {
    vec![
        script_path(install_root).into_os_string(),
        OsString::from("start"),
        OsString::from("--port"),
        OsString::from(port.to_string()),
    ]
}

/// True when `candidate` is the root itself or lives below it.
///
/// Component-wise rather than string prefix: `C:\aios2` must not read as inside
/// `C:\aios`, and the comparison must not depend on a trailing separator.
pub fn is_inside(candidate: &Path, root: &Path) -> bool {
    let mut candidate_parts = candidate.components();
    for root_part in root.components() {
        match candidate_parts.next() {
            Some(part) if same_component(&part, &root_part) => {}
            _ => return false,
        }
    }
    true
}

fn same_component(left: &Component<'_>, right: &Component<'_>) -> bool {
    // Windows paths are case-insensitive; comparing the raw components would call
    // `C:\AIOS` and `C:\aios` different directories.
    left.as_os_str()
        .to_string_lossy()
        .eq_ignore_ascii_case(&right.as_os_str().to_string_lossy())
}

/// The directory the capability process runs in.
///
/// `candidate` is honoured only when it is outside the install tree. When it is not,
/// or when it is empty, the volatile directory wins — the failure this prevents is
/// silent and only shows up later, during an update.
pub fn resolve_work_dir(install_root: &Path, candidate: &Path, volatile: &Path) -> PathBuf {
    if candidate.as_os_str().is_empty() || candidate.components().next().is_none() {
        return volatile.to_path_buf();
    }
    if is_inside(candidate, install_root) {
        return volatile.to_path_buf();
    }
    candidate.to_path_buf()
}

/// The address the window talks to. Loopback only: the page is served to this
/// machine, and binding wider would publish the capability process to the network.
pub fn loopback(port: u16) -> SocketAddrV4 {
    SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)
}

/// Whether something already accepts connections on the loopback port.
pub fn is_listening(address: SocketAddrV4) -> bool {
    probe_once(address)
}

fn probe_once(address: SocketAddrV4) -> bool {
    TcpStream::connect_timeout(&address.into(), Duration::from_millis(250)).is_ok()
}

/// Wait for the capability process to accept connections.
///
/// The probe is injected so the wait itself is testable without a socket: a wait
/// that only ever returns `true` looks identical to a working one.
pub fn wait_until_listening<F>(
    address: SocketAddrV4,
    timeout: Duration,
    interval: Duration,
    mut probe: F,
) -> bool
where
    F: FnMut(SocketAddrV4) -> bool,
{
    let deadline = Instant::now() + timeout;
    loop {
        if probe(address) {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(interval.min(timeout));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("C:\\aios")
    }

    #[test]
    fn declared_port_wins_and_garbage_falls_back() {
        assert_eq!(resolve_port(Some("3400")), 3400);
        assert_eq!(resolve_port(Some(" 3400 ")), 3400);
        assert_eq!(resolve_port(Some("0")), DEFAULT_UI_PORT);
        assert_eq!(resolve_port(Some("65536")), DEFAULT_UI_PORT);
        assert_eq!(resolve_port(Some("eighty")), DEFAULT_UI_PORT);
        assert_eq!(resolve_port(None), DEFAULT_UI_PORT);
    }

    #[test]
    fn the_server_is_started_from_the_install_root_and_told_the_port() {
        let args = server_args(&root(), 3400);
        assert_eq!(
            args,
            vec![
                root().join(UI_SCRIPT_REL).into_os_string(),
                OsString::from("start"),
                OsString::from("--port"),
                OsString::from("3400"),
            ]
        );
    }

    #[test]
    fn a_sibling_directory_with_the_same_prefix_is_not_inside() {
        assert!(is_inside(&root(), &root()));
        assert!(is_inside(&root().join("apps").join("shell"), &root()));
        assert!(!is_inside(&PathBuf::from("C:\\aios2"), &root()));
    }

    #[test]
    fn windows_casing_does_not_escape_the_root() {
        assert!(is_inside(&PathBuf::from("C:\\AIOS\\apps"), &root()));
    }

    #[test]
    fn a_work_dir_inside_the_install_tree_is_replaced() {
        let volatile = PathBuf::from("C:\\Users\\me\\AppData\\Local\\Temp\\aios-shell");
        assert_eq!(
            resolve_work_dir(&root(), &root().join("apps"), &volatile),
            volatile
        );
        assert_eq!(resolve_work_dir(&root(), &Path::new(""), &volatile), volatile);
        let outside = PathBuf::from("C:\\Users\\me\\AppData\\Local\\Temp\\aios-shell");
        assert_eq!(resolve_work_dir(&root(), &outside, &volatile), outside);
    }

    #[test]
    fn the_token_comes_from_the_declaration_first_and_then_from_the_file() {
        let path = token_path(3126, Path::new("temp"));
        assert!(path.ends_with("aios-ui-token-3126"));
        assert_eq!(
            read_token(Some("declared"), &path).as_deref(),
            Some("declared"),
            "an explicit declaration wins over whatever the file holds"
        );
        assert_eq!(read_token(Some("   "), &path), None, "blank is not a token");
        assert_eq!(read_token(None, &path), None, "no file, no token");
    }

    #[test]
    fn the_window_url_is_the_token_exchange_not_the_bare_page() {
        assert_eq!(
            bootstrap_url(3126, "abc123"),
            "http://127.0.0.1:3126/t/abc123/"
        );
    }

    #[test]
    fn the_wait_gives_up_instead_of_hanging() {
        let address = loopback(3126);
        assert!(!wait_until_listening(
            address,
            Duration::from_millis(300),
            Duration::from_millis(50),
            |_| false
        ));
        assert!(wait_until_listening(
            address,
            Duration::from_secs(5),
            Duration::from_millis(50),
            |_| true
        ));
    }
}
