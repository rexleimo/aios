// `npm run app` — one command that opens the desktop window.
//
// Why this exists at all: `npm run ui` starts a *browser* view, and `npm run shell:dev`
// is a bare `cargo run` that compiles Rust for minutes before anything appears. Neither
// is "start the desktop app", so the person trying it concludes it does not work — the
// measured complaint that produced this file.
//
// This launcher owns three decisions and nothing else:
//
//   1. Is a server already answering? Then attach, and say so. Starting a second one on
//      the same port is how stale servers pile up.
//   2. Otherwise start one through `scripts/aios-ui.mjs auto`, which picks `start` when
//      a production build exists and `dev` when it does not — so a fresh checkout works
//      without `npm run ui:build` first.
//   3. Use an existing shell binary; compile once, visibly, only when there is none.
//
// What it deliberately does not do: install the UI dependencies. A silent 200 MB
// install during "open the app" is worse than one line naming the command.
//
// The window's own facts (port, token, install root, attach-or-spawn) still belong to
// the Rust shell (`apps/shell/src-tauri/src/lib.rs`); this process only guarantees that
// there is something to attach to.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';
import {
  NEXT_BIN_REL_PATH,
  UI_BIND_HOST,
  UI_REL_PATH,
  resolveUiPort,
  tokenPath,
} from './aios-ui.mjs';

export const SHELL_TARGET_REL = path.join('apps', 'shell', 'src-tauri', 'target');
export const SHELL_MANIFEST_REL = path.join('apps', 'shell', 'src-tauri', 'Cargo.toml');

export function resolveRepoRoot(fromUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(fromUrl)), '..');
}

/** The UI needs its own dependencies before any server can start. */
export function missingUiDependencies({ rootDir, existsImpl = fs.existsSync } = {}) {
  const uiDir = path.join(rootDir, UI_REL_PATH);
  return {
    uiDir,
    missing: [path.join(uiDir, 'node_modules'), path.join(uiDir, NEXT_BIN_REL_PATH)].filter(
      (entry) => !existsImpl(entry),
    ),
  };
}

/**
 * Release before debug, and `needsBuild` only when neither exists.
 *
 * Debug is the honest fallback: it is what a developer's first `cargo run` produces.
 */
export function resolveShellBinary({ rootDir, existsImpl = fs.existsSync, platform = process.platform }) {
  const name = platform === 'win32' ? 'aios-shell.exe' : 'aios-shell';
  const release = path.join(rootDir, SHELL_TARGET_REL, 'release', name);
  const debug = path.join(rootDir, SHELL_TARGET_REL, 'debug', name);
  if (existsImpl(release)) return { path: release, profile: 'release', needsBuild: false };
  if (existsImpl(debug)) return { path: debug, profile: 'debug', needsBuild: false };
  return { path: debug, profile: 'debug', needsBuild: true };
}

/** The one-off compile, so the wait is announced by cargo itself rather than by silence. */
export function shellBuildCommand({ rootDir, cargo = 'cargo' }) {
  return {
    command: cargo,
    args: ['build', '--manifest-path', path.join(rootDir, SHELL_MANIFEST_REL)],
  };
}

/** The server this launcher may start, described rather than started. */
export function serverCommand({ rootDir, port, execPath = process.execPath }) {
  return {
    command: execPath,
    args: [path.join(rootDir, 'scripts', 'aios-ui.mjs'), 'auto', '--port', String(port)],
    port,
  };
}

/** Whether the page's port answers at all. A 403 is an answer: the gate is up. */
export async function isPortAnswering(port, { timeoutMs = 1_500 } = {}) {
  try {
    await fetch(`http://${UI_BIND_HOST}:${port}/`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate, { timeoutMs, intervalMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Kill the server this launcher started, and only that one. */
export function stopServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

export async function runApp({
  rootDir = resolveRepoRoot(),
  port,
  log = process.stderr,
  existsImpl = fs.existsSync,
  execPath = process.execPath,
  spawnImpl = spawn,
  spawnSyncImpl = spawnSync,
  answeringImpl = isPortAnswering,
  tokenPathImpl = tokenPath,
  stopImpl = stopServer,
  buildSpawnImpl,
} = {}) {
  const { uiDir, missing } = missingUiDependencies({ rootDir, existsImpl });
  if (missing.length > 0) {
    log.write(
      `[app] the interface dependencies are not installed in ${uiDir}\n` +
        '  run: npm run ui:setup\n' +
        `  missing: ${missing.map((entry) => path.relative(rootDir, entry)).join(', ')}\n`,
    );
    return { ok: false, exitCode: 1, startedServer: false };
  }

  const resolvedPort = resolveUiPort(port);
  let server = null;
  if (await answeringImpl(resolvedPort)) {
    log.write(`[app] reusing the server already answering on ${UI_BIND_HOST}:${resolvedPort}\n`);
  } else {
    const plan = serverCommand({ rootDir, port: resolvedPort, execPath });
    log.write(`[app] starting the capability process on ${UI_BIND_HOST}:${resolvedPort} (first start compiles the page)\n`);
    server = spawnImpl(plan.command, plan.args, {
      windowsHide: true,
      cwd: rootDir,
      // A group of its own so the whole server tree can be stopped with us.
      detached: process.platform !== 'win32',
      stdio: 'ignore',
      env: { ...process.env, AIOS_UI_PORT: String(resolvedPort) },
    });
    const published = await waitFor(
      async () => existsImpl(tokenPathImpl(resolvedPort)) && (await answeringImpl(resolvedPort)),
      { timeoutMs: 180_000 },
    );
    if (!published) {
      stopImpl(server);
      log.write(`[app] the capability process did not answer on ${UI_BIND_HOST}:${resolvedPort}\n`);
      return { ok: false, exitCode: 1, startedServer: true };
    }
  }

  const binary = resolveShellBinary({ rootDir, existsImpl });
  if (binary.needsBuild) {
    const build = shellBuildCommand({ rootDir });
    log.write('[app] no shell binary yet; compiling it once with cargo (this is the slow part)\n');
    const runBuild = buildSpawnImpl ?? spawnSyncImpl;
    const built = runBuild(build.command, build.args, { cwd: rootDir, stdio: 'inherit' });
    if ((built?.status ?? 1) !== 0) {
      if (server) stopImpl(server);
      log.write('[app] cargo build failed; the window cannot open\n');
      return { ok: false, exitCode: built?.status ?? 1, startedServer: Boolean(server) };
    }
  }

  const shell = spawnSyncImpl(binary.path, [], { windowsHide: true, cwd: rootDir, stdio: 'inherit' });
  if (server) stopImpl(server);
  const exitCode = shell?.status ?? 1;
  if (shell?.error) {
    log.write(`[app] failed to launch ${binary.path}: ${shell.error.message}\n`);
  }
  return { ok: exitCode === 0, exitCode, startedServer: Boolean(server) };
}

if (isDirectModuleInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  const portFlag = argv.indexOf('--port');
  const port = portFlag >= 0 ? argv[portFlag + 1] : undefined;
  const result = await runApp({ port });
  process.exitCode = result.exitCode;
}
