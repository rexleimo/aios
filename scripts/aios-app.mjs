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

// macOS Dock 的名字和图标来自 app bundle 的 Info.plist，不是裸可执行文件。
// `target/debug/aios-shell` 这种裸 Mach-O 在 Dock 里只会显示文件名 `aios-shell`
// 和系统默认图标——实测用户反馈“Dock 上的 logo 和名字不对”就是这个原因。
// Tauri 没有运行时改 Dock 图标的 API，所以开发态启动时现造一个标准 .app bundle：
// 真实二进制副本（文件名必须是产品名 AIOS，symlink 会被 macOS 解析回原名）+ Info.plist +
// icon.icns。CFBundleName/CFBundleIconFile 决定 Dock 的显示。
export const MAC_APP_NAME = 'AIOS';

/** Info.plist for the dev-time .app bundle. productName/identifier mirror tauri.conf.json. */
export function macAppInfoPlist(version = '0.0.0') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${MAC_APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${MAC_APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>top.rexai.aios.shell</string>
  <key>CFBundleExecutable</key><string>${MAC_APP_NAME}</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}

/**
 * Build a real .app bundle beside the shell binary so the Dock shows AIOS's
 * name and icon. Returns the bundle path. Idempotent: rebuilds only when the
 * source binary is newer than the bundled copy (so a fresh cargo build is picked up).
 */
export function ensureMacAppBundle({
  rootDir,
  binaryPath,
  version = '0.0.0',
  existsImpl = fs.existsSync,
  statImpl = fs.statSync,
  mkdirImpl = fs.mkdirSync,
  copyImpl = fs.copyFileSync,
  writeImpl = fs.writeFileSync,
} = {}) {
  const targetDir = path.dirname(binaryPath); // target/debug or target/release
  const bundle = path.join(targetDir, `${MAC_APP_NAME}.app`);
  const contents = path.join(bundle, 'Contents');
  const macos = path.join(contents, 'MacOS');
  const resources = path.join(contents, 'Resources');
  const bundledBin = path.join(macos, MAC_APP_NAME);
  const iconSrc = path.join(rootDir, 'apps', 'shell', 'src-tauri', 'icons', 'icon.icns');
  const iconDst = path.join(resources, 'icon.icns');

  const needsRebuild =
    !existsImpl(bundledBin) ||
    !existsImpl(path.join(contents, 'Info.plist')) ||
    !existsImpl(iconDst) ||
    statImpl(binaryPath).mtimeMs > statImpl(bundledBin).mtimeMs;

  if (needsRebuild) {
    mkdirImpl(macos, { recursive: true });
    mkdirImpl(resources, { recursive: true });
    copyImpl(binaryPath, bundledBin); // real copy, not symlink — see comment above
    fs.chmodSync(bundledBin, 0o755);
    copyImpl(iconSrc, iconDst);
    writeImpl(path.join(contents, 'Info.plist'), macAppInfoPlist(version));
  }
  return bundle;
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
  ensureBundleImpl = ensureMacAppBundle,
  platform = process.platform,
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

  // On macOS, launch through a real .app bundle so the Dock shows AIOS's name
  // and icon (a bare Mach-O only shows its filename + the default icon).
  // Other platforms keep the direct spawn. `open` returns immediately, so we
  // cannot derive the window's lifetime from its exit code; the server is still
  // stopped when the shell process the window runs in exits via the app's own
  // lifecycle. Pass AIOS_SHELL_ROOT so the shell does not depend on the cwd an
  // app launch is given (which macOS does not guarantee to be the repo root).
  let shell;
  if (platform === 'darwin') {
    // Read the version from tauri.conf.json so the bundle metadata matches the shell.
    const tauriConf = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'apps', 'shell', 'src-tauri', 'tauri.conf.json'), 'utf8'),
    );
    const bundle = ensureBundleImpl({ rootDir, binaryPath: binary.path, version: tauriConf.version });
    log.write(`[app] launching ${path.basename(bundle)} so the Dock shows the AIOS icon\n`);
    shell = spawnSyncImpl('/usr/bin/open', ['-W', bundle], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, AIOS_SHELL_ROOT: rootDir },
    });
  } else {
    shell = spawnSyncImpl(binary.path, [], { windowsHide: true, cwd: rootDir, stdio: 'inherit' });
  }
  if (server) stopImpl(server);
  const exitCode = shell?.status ?? 1;
  if (shell?.error) {
    log.write(`[app] failed to launch the desktop shell: ${shell.error.message}\n`);
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
