import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { captureCommand, commandExists, runCommand } from '../../platform/process.mjs';
import {
  CDP_SERVICE_LABEL_PREFIX,
  DEFAULT_CDP_SERVICE_PORT,
} from './constants.mjs';
import {
  normalizeCdpPort,
  resolveDefaultCdpPort,
} from './runtime-paths.mjs';

export function testPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 300 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export function assertDarwinPlatform() {
  if (process.platform !== 'darwin') {
    throw new Error('Browser CDP launch service commands are only supported on macOS.');
  }
}

export function resolveCdpServiceLayout(rootDir, port = DEFAULT_CDP_SERVICE_PORT) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  if (!homeDir) {
    throw new Error('Cannot resolve HOME directory for browser CDP launch service.');
  }

  const resolvedPort = normalizeCdpPort(port);
  const label = `${CDP_SERVICE_LABEL_PREFIX}${resolvedPort}`;
  const logsDir = path.join(homeDir, 'Library', 'Logs');
  const launchAgentsDir = path.join(homeDir, 'Library', 'LaunchAgents');
  const localBinDir = path.join(homeDir, '.local', 'bin');

  return {
    rootDir,
    homeDir,
    label,
    port: resolvedPort,
    logsDir,
    launchAgentsDir,
    localBinDir,
    plistPath: path.join(launchAgentsDir, `${label}.plist`),
    launcherPath: path.join(localBinDir, `aios-cdp-${resolvedPort}-start.sh`),
    stdoutPath: path.join(logsDir, `aios-cdp-${resolvedPort}.out.log`),
    stderrPath: path.join(logsDir, `aios-cdp-${resolvedPort}.err.log`),
    userDataDir: path.join(rootDir, '.browser-profiles', resolvedPort === 9222 ? 'default-cdp' : `default-cdp-${resolvedPort}`),
  };
}

export function renderCdpLauncherScript(layout) {
  return `#!/bin/zsh
set -euo pipefail

USER_DATA_DIR=${JSON.stringify(layout.userDataDir)}
PORT=${JSON.stringify(String(layout.port))}
CHROME_OVERRIDE="\${AIOS_CDP_CHROME_BIN:-}"

mkdir -p "$USER_DATA_DIR"

CHROME_CANDIDATES=(
  "$CHROME_OVERRIDE"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
  "/Applications/Arc.app/Contents/MacOS/Arc"
)

CHROME_BIN=""
for candidate in "\${CHROME_CANDIDATES[@]}"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    CHROME_BIN="$candidate"
    break
  fi
done

if [[ -z "$CHROME_BIN" ]]; then
  for fallback in google-chrome chrome chromium chromium-browser brave; do
    if command -v "$fallback" >/dev/null 2>&1; then
      CHROME_BIN="$(command -v "$fallback")"
      break
    fi
  done
fi

if [[ -z "$CHROME_BIN" || ! -x "$CHROME_BIN" ]]; then
  echo "[aios-cdp] Chrome/Chromium executable not found." >&2
  echo "[aios-cdp] Set AIOS_CDP_CHROME_BIN to an explicit executable path." >&2
  exit 1
fi

exec "$CHROME_BIN" \\
  --remote-debugging-port="$PORT" \\
  --remote-debugging-address=127.0.0.1 \\
  --user-data-dir="$USER_DATA_DIR" \\
  --no-first-run \\
  --no-default-browser-check \\
  --disable-blink-features=AutomationControlled \\
  --disable-infobars \\
  about:blank
`;
}

export function renderCdpLaunchAgentPlist(layout) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${layout.label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${layout.launcherPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${layout.rootDir}</string>
  <key>StandardOutPath</key>
  <string>${layout.stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${layout.stderrPath}</string>
</dict>
</plist>
`;
}

export function writeCdpLaunchAgentFiles(layout) {
  fs.mkdirSync(layout.localBinDir, { recursive: true });
  fs.mkdirSync(layout.launchAgentsDir, { recursive: true });
  fs.mkdirSync(layout.logsDir, { recursive: true });
  fs.mkdirSync(layout.userDataDir, { recursive: true });

  fs.writeFileSync(layout.launcherPath, renderCdpLauncherScript(layout), 'utf8');
  fs.chmodSync(layout.launcherPath, 0o755);
  fs.writeFileSync(layout.plistPath, renderCdpLaunchAgentPlist(layout), 'utf8');
}

export function resolveLaunchctlDomain() {
  if (typeof process.getuid !== 'function') {
    throw new Error('Cannot resolve launchctl user domain: process.getuid() is unavailable.');
  }
  return `gui/${process.getuid()}`;
}

export function parseLaunchctlState(raw = '') {
  const text = String(raw ?? '');
  const stateMatch = /(?:^|\n)\s*state = ([^\n]+)/u.exec(text);
  const pidMatch = /(?:^|\n)\s*pid = (\d+)/u.exec(text);
  return {
    state: stateMatch ? stateMatch[1].trim() : '',
    pid: pidMatch ? Number.parseInt(pidMatch[1], 10) : null,
  };
}

export async function waitForPortState(port, expectedOpen, attempts = 20, delayMs = 200) {
  for (let index = 0; index < attempts; index += 1) {
    const open = await testPortOpen(port);
    if (open === expectedOpen) return true;
    if (index + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export async function startBrowserCdpService({ rootDir, io = console } = {}) {
  assertDarwinPlatform();
  if (!commandExists('launchctl')) {
    throw new Error('Missing required command: launchctl');
  }

  const layout = buildLaunchctlLayout(rootDir);
  writeCdpLaunchAgentFiles(layout);
  captureCommand('launchctl', ['bootout', layout.domain, layout.plistPath]);
  runCommand('launchctl', ['bootstrap', layout.domain, layout.plistPath]);
  runCommand('launchctl', ['enable', layout.service]);
  runCommand('launchctl', ['kickstart', '-k', layout.service]);

  const ready = await waitForPortState(layout.port, true);
  if (!ready) {
    throw new Error(`Browser CDP service started but port ${layout.port} is not reachable yet.`);
  }

  const servicePrint = captureCommand('launchctl', ['print', layout.service]);
  const state = parseLaunchctlState(servicePrint.stdout);

  io.log(`CDP launch agent up: ${layout.label}`);
  io.log(`plist: ${layout.plistPath}`);
  io.log(`launcher: ${layout.launcherPath}`);
  io.log(`port: 127.0.0.1:${layout.port}`);
  if (Number.isFinite(state.pid) && state.pid > 0) {
    io.log(`pid: ${state.pid}`);
  }

  return {
    label: layout.label,
    port: layout.port,
    plistPath: layout.plistPath,
    launcherPath: layout.launcherPath,
    pid: Number.isFinite(state.pid) ? state.pid : null,
    running: true,
  };
}

export async function stopBrowserCdpService({ rootDir, io = console } = {}) {
  assertDarwinPlatform();
  if (!commandExists('launchctl')) {
    throw new Error('Missing required command: launchctl');
  }

  const layout = buildLaunchctlLayout(rootDir);
  const bootout = captureCommand('launchctl', ['bootout', layout.domain, layout.plistPath]);
  const stopped = bootout.status === 0;
  const portClosed = await waitForPortState(layout.port, false);

  if (stopped) {
    io.log(`CDP launch agent stopped: ${layout.label}`);
  } else {
    io.log(`CDP launch agent already stopped: ${layout.label}`);
  }
  io.log(`port ${layout.port}: ${portClosed ? 'closed' : 'still-open'}`);

  return {
    label: layout.label,
    port: layout.port,
    stopped,
    portClosed,
  };
}

export async function restartBrowserCdpService({ rootDir, io = console } = {}) {
  await stopBrowserCdpService({ rootDir, io });
  return await startBrowserCdpService({ rootDir, io });
}

export async function statusBrowserCdpService({ rootDir, io = console } = {}) {
  assertDarwinPlatform();
  if (!commandExists('launchctl')) {
    throw new Error('Missing required command: launchctl');
  }

  const layout = buildLaunchctlLayout(rootDir);
  const servicePrint = captureCommand('launchctl', ['print', layout.service]);
  const state = parseLaunchctlState(servicePrint.stdout);
  const loaded = servicePrint.status === 0;
  const listening = await testPortOpen(layout.port);

  io.log('Browser CDP Service');
  io.log(`label: ${layout.label}`);
  io.log(`service: ${layout.service}`);
  io.log(`state: ${loaded ? (state.state || 'loaded') : 'not-loaded'}`);
  io.log(`pid: ${Number.isFinite(state.pid) ? state.pid : '-'}`);
  io.log(`port: 127.0.0.1:${layout.port} (${listening ? 'listening' : 'closed'})`);
  io.log(`plist: ${layout.plistPath}`);
  io.log(`launcher: ${layout.launcherPath}`);

  return {
    label: layout.label,
    port: layout.port,
    loaded,
    state: state.state || (loaded ? 'loaded' : 'not-loaded'),
    pid: Number.isFinite(state.pid) ? state.pid : null,
    listening,
    plistPath: layout.plistPath,
    launcherPath: layout.launcherPath,
  };
}

function buildLaunchctlLayout(rootDir) {
  const port = resolveDefaultCdpPort(rootDir);
  const layout = resolveCdpServiceLayout(rootDir, port);
  const domain = resolveLaunchctlDomain();
  return {
    ...layout,
    domain,
    service: `${domain}/${layout.label}`,
  };
}
