import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { commandExists, captureCommand, runCommand } from '../platform/process.mjs';
import { getClientHomes } from '../platform/paths.mjs';

const DEFAULT_CDP_SERVICE_PORT = 9222;
const CDP_SERVICE_LABEL_PREFIX = 'com.aios.cdp';
const BROWSER_USE_REPO_DIR_NAME = 'ai-browser-book';
const BROWSER_USE_PROJECT_DIR_NAME = 'mcp-browser-use';
const LEGACY_BROWSER_ALIAS = 'playwright-browser-mcp';
const PRIMARY_BROWSER_ALIAS = 'puppeteer-stealth';
const AUTH_TOOLS_ALIAS = 'aios-auth-tools';

function requireCommand(name) {
  if (!commandExists(name)) {
    throw new Error(`Missing required command: ${name}`);
  }
}

function printSnippet(io, launcherPath, cdpUrl) {
  io.log('');
  io.log('Done. Browser MCP config was auto-updated where possible.');
  io.log('Use this MCP server block only if a client needs a manual refresh:');
  io.log('- If `puppeteer-stealth` already exists, replace its block in-place (do not delete the alias name).');
  io.log('- If legacy `playwright-browser-mcp` exists, remove it to avoid parallel old/new browser stacks.');
  io.log('');
  io.log('{');
  io.log('  "mcpServers": {');
  io.log('    "puppeteer-stealth": {');
  io.log('      "type": "stdio",');
  io.log('      "command": "bash",');
  io.log(`      "args": ["${launcherPath}"],`);
  io.log('      "env": {');
  io.log(`        "BROWSER_USE_CDP_URL": "${cdpUrl}"`);
  io.log('      }');
  io.log('    }');
  io.log('  }');
  io.log('}');
}

function buildPreferredMcpServer(rootDir, existingAlias = {}) {
  const launcherScript = path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh');
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const existingEnv = existingAlias && typeof existingAlias.env === 'object' ? existingAlias.env : {};
  const browserUseRepo = findBrowserUseRepo(rootDir, existingEnv);
  const nextEnv = {
    ...existingEnv,
    BROWSER_USE_CDP_URL: cdpUrl,
  };
  if (browserUseRepo) {
    nextEnv.AIOS_BROWSER_USE_REPO = browserUseRepo;
  } else if (isLegacyBrowserUseFallback(nextEnv.AIOS_BROWSER_USE_REPO)) {
    delete nextEnv.AIOS_BROWSER_USE_REPO;
  }

  return {
    type: 'stdio',
    command: 'bash',
    args: [launcherScript],
    env: nextEnv,
  };
}

function buildAuthToolsMcpServer(rootDir, existingEntry = {}) {
  const authScript = path.join(rootDir, 'scripts', 'auth-tools-server.py');
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const nextEnv = {
    ...(existingEntry && typeof existingEntry.env === 'object' ? existingEntry.env : {}),
    BROWSER_USE_CDP_URL: cdpUrl,
  };

  return {
    type: 'stdio',
    command: 'python3',
    args: ['-u', authScript],
    env: nextEnv,
  };
}

function migrateOneMcpJsonFile(filePath, rootDir) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        status: 'error',
        reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    parsed.mcpServers = {};
  }

  const mcpServers = parsed.mcpServers;
  const existingAlias = mcpServers[PRIMARY_BROWSER_ALIAS];
  mcpServers[PRIMARY_BROWSER_ALIAS] = buildPreferredMcpServer(rootDir, existingAlias);
  mcpServers[AUTH_TOOLS_ALIAS] = buildAuthToolsMcpServer(rootDir, mcpServers[AUTH_TOOLS_ALIAS]);
  delete mcpServers[LEGACY_BROWSER_ALIAS];

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }

  return {
    status: exists ? 'updated' : 'created',
    nextRaw,
  };
}

function collectClientMcpTargets(clientHomes = {}) {
  const targets = [];
  const seen = new Set();

  for (const home of [clientHomes.codex, clientHomes.claude, clientHomes.gemini, clientHomes.opencode]) {
    const resolvedHome = resolveUserPath(home);
    if (!resolvedHome) continue;

    const absPath = path.resolve(path.join(resolvedHome, 'mcp.json'));
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    targets.push({ path: absPath, createIfMissing: false });
  }

  return targets;
}

export async function migrateBrowserMcpConfig({ rootDir, io = console, dryRun = false, clientHomes = null } = {}) {
  const launcherScript = path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh');
  const bootstrapScript = path.join(rootDir, 'scripts', 'browser-use-bootstrap.py');
  if (!fs.existsSync(launcherScript)) {
    throw new Error(`browser-use launcher script not found: ${launcherScript}`);
  }
  if (!fs.existsSync(bootstrapScript)) {
    throw new Error(`browser-use bootstrap script not found: ${bootstrapScript}`);
  }

  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());
  const candidates = [
    { path: path.join(rootDir, '.mcp.json'), createIfMissing: true },
    { path: path.join(rootDir, 'mcp-server', '.mcp.json'), createIfMissing: true },
    ...collectClientMcpTargets(homes),
  ];

  const seen = new Set();
  const targets = candidates.filter((candidate) => {
    if (!candidate.path) return false;
    const abs = path.resolve(candidate.path);
    if (seen.has(abs)) return false;
    seen.add(abs);
    return candidate.createIfMissing || fs.existsSync(abs);
  });

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  const changedPaths = [];

  for (const target of targets) {
    const absPath = path.resolve(target.path);
    const result = migrateOneMcpJsonFile(absPath, rootDir);
    if (result.status === 'error') {
      io.log(`ERR  mcp-migrate skipped (invalid json): ${absPath}; ${result.reason}`);
      errors += 1;
      continue;
    }

    if (result.status === 'unchanged') {
      io.log(`OK   mcp-migrate unchanged: ${absPath}`);
      unchanged += 1;
      continue;
    }

    if (dryRun) {
      io.log(`PLAN mcp-migrate ${result.status}: ${absPath}`);
    } else {
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, result.nextRaw, 'utf8');
      io.log(`OK   mcp-migrate ${result.status}: ${absPath}`);
    }

    changedPaths.push(absPath);
    if (result.status === 'created') created += 1;
    if (result.status === 'updated') updated += 1;
  }

  io.log(
    `mcp-migrate summary: created=${created} updated=${updated} unchanged=${unchanged} ` +
    `errors=${errors} dryRun=${dryRun ? 'true' : 'false'}`
  );

  return {
    created,
    updated,
    unchanged,
    errors,
    dryRun,
    changedPaths,
  };
}

export async function installBrowserMcp({
  rootDir,
  skipPlaywrightInstall = false,
  dryRun = false,
  io = console,
  clientHomes = null,
} = {}) {
  requireCommand('node');

  const launcherScript = path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh');
  const bootstrapScript = path.join(rootDir, 'scripts', 'browser-use-bootstrap.py');
  if (!fs.existsSync(launcherScript)) {
    throw new Error(`browser-use launcher script not found: ${launcherScript}`);
  }
  if (!fs.existsSync(bootstrapScript)) {
    throw new Error(`browser-use bootstrap script not found: ${bootstrapScript}`);
  }

  const browserUseRepo = findBrowserUseRepo(rootDir);
  if (!browserUseRepo) {
    throw new Error(formatBrowserUseMissingMessage(rootDir));
  }
  const browserUseProjectDir = path.join(browserUseRepo, BROWSER_USE_PROJECT_DIR_NAME);
  const browserUsePyproject = path.join(browserUseProjectDir, 'pyproject.toml');
  if (!fs.existsSync(browserUsePyproject)) {
    throw new Error(formatBrowserUseMissingMessage(rootDir));
  }

  const runInBrowserUse = (command, args) => {
    io.log(`+ (cd ${browserUseProjectDir} && ${command} ${args.join(' ')})`);
    if (!dryRun) {
      runCommand(command, args, { cwd: browserUseProjectDir });
    }
  };

  if (!skipPlaywrightInstall) {
    const venvPython = path.join(browserUseProjectDir, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPython)) {
      io.log(`+ browser-use runtime found: ${venvPython}`);
    } else if (commandExists('uv')) {
      runInBrowserUse('uv', ['sync']);
    } else {
      requireCommand('python3');
      runInBrowserUse('python3', ['-m', 'venv', '.venv']);
      const venvPython = path.join(browserUseProjectDir, '.venv', 'bin', 'python');
      runInBrowserUse(venvPython, ['-m', 'pip', 'install', '-U', 'pip']);
      runInBrowserUse(venvPython, ['-m', 'pip', 'install', '-e', '.[dev]']);
    }
  }

  let migrationResult = null;
  try {
    migrationResult = await migrateBrowserMcpConfig({ rootDir, io, dryRun, clientHomes });
  } catch (error) {
    const message = formatErrorMessage(error).split(/\r?\n/u)[0];
    io.log(`[warn] browser MCP config auto-update skipped: ${message}`);
  }

  const launcherPath = dryRun
    ? '<ABSOLUTE_PATH_TO_REPO>/scripts/run-browser-use-mcp.sh'
    : fs.realpathSync(launcherScript);
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  printSnippet(io, launcherPath, cdpUrl);

  return {
    launcherPath,
    cdpUrl,
    browserUseProjectDir,
    migrationResult,
  };
}

function testPortOpen(port) {
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

function assertDarwinPlatform() {
  if (process.platform !== 'darwin') {
    throw new Error('Browser CDP launch service commands are only supported on macOS.');
  }
}

function normalizeCdpPort(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CDP_SERVICE_PORT;
}

function resolveDefaultCdpPort(rootDir) {
  const profileConfig = path.join(rootDir, 'config', 'browser-profiles.json');
  if (!fs.existsSync(profileConfig)) return DEFAULT_CDP_SERVICE_PORT;

  try {
    const parsed = JSON.parse(fs.readFileSync(profileConfig, 'utf8'));
    return normalizeCdpPort(parsed?.profiles?.default?.cdpPort);
  } catch {
    return DEFAULT_CDP_SERVICE_PORT;
  }
}

function resolveDefaultCdpUrl(rootDir) {
  const profileConfig = path.join(rootDir, 'config', 'browser-profiles.json');
  if (!fs.existsSync(profileConfig)) {
    return `http://127.0.0.1:${DEFAULT_CDP_SERVICE_PORT}`;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(profileConfig, 'utf8'));
    const defaultProfile = parsed?.profiles?.default ?? {};
    const cdpUrl = String(defaultProfile.cdpUrl || '').trim();
    if (cdpUrl) return cdpUrl;
    const cdpPort = normalizeCdpPort(defaultProfile.cdpPort);
    return `http://127.0.0.1:${cdpPort}`;
  } catch {
    return `http://127.0.0.1:${DEFAULT_CDP_SERVICE_PORT}`;
  }
}

function resolveUserPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

function uniquePaths(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const resolved = resolveUserPath(value);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

function resolveBrowserUseRepoRoot(candidate) {
  const resolved = resolveUserPath(candidate);
  if (!resolved) return '';

  const absCandidate = path.resolve(resolved);
  if (fs.existsSync(path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME, 'pyproject.toml'))) {
    return absCandidate;
  }

  if (
    path.basename(absCandidate) === BROWSER_USE_PROJECT_DIR_NAME &&
    fs.existsSync(path.join(absCandidate, 'pyproject.toml'))
  ) {
    const parent = path.dirname(absCandidate);
    if (fs.existsSync(path.join(parent, BROWSER_USE_PROJECT_DIR_NAME, 'pyproject.toml'))) {
      return parent;
    }
  }

  return '';
}

function getBrowserUseRepoCandidates(rootDir, env = process.env) {
  return uniquePaths([
    env?.AIOS_BROWSER_USE_REPO,
    path.resolve(rootDir, '..', BROWSER_USE_REPO_DIR_NAME),
    path.resolve(rootDir, BROWSER_USE_REPO_DIR_NAME),
  ]);
}

function findBrowserUseRepo(rootDir, env = process.env) {
  const candidates = getBrowserUseRepoCandidates(rootDir, env);

  for (const candidate of candidates) {
    const browserUseRepo = resolveBrowserUseRepoRoot(candidate);
    if (browserUseRepo) {
      return browserUseRepo;
    }
  }

  return '';
}

function describeBrowserUseProjectPath(candidate) {
  const resolved = resolveUserPath(candidate);
  if (!resolved) return '';

  const absCandidate = path.resolve(resolved);
  if (fs.existsSync(path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME, 'pyproject.toml'))) {
    return path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME);
  }

  if (
    path.basename(absCandidate) === BROWSER_USE_PROJECT_DIR_NAME &&
    fs.existsSync(path.join(absCandidate, 'pyproject.toml'))
  ) {
    return absCandidate;
  }

  return path.join(absCandidate, BROWSER_USE_PROJECT_DIR_NAME);
}

function isLegacyBrowserUseFallback(value) {
  const normalized = String(value || '').replace(/\\/gu, '/');
  const parts = normalized.split('/').filter(Boolean);
  return (
    parts.length >= 4 &&
    parts.at(-4) === 'Users' &&
    parts.at(-3) === 'molei' &&
    parts.at(-2) === 'codes' &&
    parts.at(-1) === BROWSER_USE_REPO_DIR_NAME
  ) || (
    parts.length >= 5 &&
    parts.at(-5) === 'Users' &&
    parts.at(-4) === 'molei' &&
    parts.at(-3) === 'codes' &&
    parts.at(-2) === BROWSER_USE_REPO_DIR_NAME &&
    parts.at(-1) === BROWSER_USE_PROJECT_DIR_NAME
  );
}

function formatBrowserUseMissingMessage(rootDir, env = process.env) {
  const candidates = getBrowserUseRepoCandidates(rootDir, env);
  const checked = candidates.length > 0
    ? candidates.map((candidate) => `  - ${describeBrowserUseProjectPath(candidate)}`).join('\n')
    : '  - <none>';
  return (
    'browser-use MCP project not found.\n' +
    'Set AIOS_BROWSER_USE_REPO to your ai-browser-book repository path, or place ai-browser-book next to/in this repo.\n' +
    `Checked:\n${checked}`
  );
}

function resolveCdpServiceLayout(rootDir, port = DEFAULT_CDP_SERVICE_PORT) {
  const homeDir = process.env.HOME || os.homedir();
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

function renderCdpLauncherScript(layout) {
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

function renderCdpLaunchAgentPlist(layout) {
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

function writeCdpLaunchAgentFiles(layout) {
  fs.mkdirSync(layout.localBinDir, { recursive: true });
  fs.mkdirSync(layout.launchAgentsDir, { recursive: true });
  fs.mkdirSync(layout.logsDir, { recursive: true });
  fs.mkdirSync(layout.userDataDir, { recursive: true });

  fs.writeFileSync(layout.launcherPath, renderCdpLauncherScript(layout), 'utf8');
  fs.chmodSync(layout.launcherPath, 0o755);
  fs.writeFileSync(layout.plistPath, renderCdpLaunchAgentPlist(layout), 'utf8');
}

function resolveLaunchctlDomain() {
  if (typeof process.getuid !== 'function') {
    throw new Error('Cannot resolve launchctl user domain: process.getuid() is unavailable.');
  }
  return `gui/${process.getuid()}`;
}

function parseLaunchctlState(raw = '') {
  const text = String(raw ?? '');
  const stateMatch = /(?:^|\n)\s*state = ([^\n]+)/u.exec(text);
  const pidMatch = /(?:^|\n)\s*pid = (\d+)/u.exec(text);
  return {
    state: stateMatch ? stateMatch[1].trim() : '',
    pid: pidMatch ? Number.parseInt(pidMatch[1], 10) : null,
  };
}

async function waitForPortState(port, expectedOpen, attempts = 20, delayMs = 200) {
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

  const port = resolveDefaultCdpPort(rootDir);
  const layout = resolveCdpServiceLayout(rootDir, port);
  const domain = resolveLaunchctlDomain();
  const service = `${domain}/${layout.label}`;

  writeCdpLaunchAgentFiles(layout);
  captureCommand('launchctl', ['bootout', domain, layout.plistPath]);
  runCommand('launchctl', ['bootstrap', domain, layout.plistPath]);
  runCommand('launchctl', ['enable', service]);
  runCommand('launchctl', ['kickstart', '-k', service]);

  const ready = await waitForPortState(layout.port, true);
  if (!ready) {
    throw new Error(`Browser CDP service started but port ${layout.port} is not reachable yet.`);
  }

  const servicePrint = captureCommand('launchctl', ['print', service]);
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

  const port = resolveDefaultCdpPort(rootDir);
  const layout = resolveCdpServiceLayout(rootDir, port);
  const domain = resolveLaunchctlDomain();
  const bootout = captureCommand('launchctl', ['bootout', domain, layout.plistPath]);
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

  const port = resolveDefaultCdpPort(rootDir);
  const layout = resolveCdpServiceLayout(rootDir, port);
  const domain = resolveLaunchctlDomain();
  const service = `${domain}/${layout.label}`;
  const servicePrint = captureCommand('launchctl', ['print', service]);
  const state = parseLaunchctlState(servicePrint.stdout);
  const loaded = servicePrint.status === 0;
  const listening = await testPortOpen(layout.port);

  io.log('Browser CDP Service');
  io.log(`label: ${layout.label}`);
  io.log(`service: ${service}`);
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

function formatErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function resolveBrowserDoctorRuntime(runtime = {}) {
  return {
    platform: String(runtime.platform || process.platform),
    commandExists: typeof runtime.commandExists === 'function' ? runtime.commandExists : commandExists,
    captureCommand: typeof runtime.captureCommand === 'function' ? runtime.captureCommand : captureCommand,
    testPortOpen: typeof runtime.testPortOpen === 'function' ? runtime.testPortOpen : testPortOpen,
    startCdpService: typeof runtime.startCdpService === 'function' ? runtime.startCdpService : startBrowserCdpService,
  };
}

async function autoHealDefaultCdpPort({
  rootDir,
  io = console,
  port,
  dryRun = false,
  runtime,
} = {}) {
  if (runtime.platform !== 'darwin') {
    return {
      attempted: false,
      healed: false,
      dryRun: false,
      reason: `auto-heal requires macOS (current: ${runtime.platform})`,
    };
  }

  if (dryRun) {
    io.log(`[plan] browser doctor fix would run: node scripts/aios.mjs internal browser cdp-start (port=${port})`);
    return {
      attempted: false,
      healed: false,
      dryRun: true,
      reason: 'dry-run mode (service not started)',
    };
  }

  io.log(`[fix] browser doctor: starting CDP service via internal browser cdp-start (port=${port})`);
  try {
    await runtime.startCdpService({ rootDir, io });
  } catch (error) {
    return {
      attempted: true,
      healed: false,
      dryRun: false,
      reason: `cdp-start failed: ${formatErrorMessage(error)}`,
    };
  }

  const reachable = await runtime.testPortOpen(port);
  if (!reachable) {
    return {
      attempted: true,
      healed: false,
      dryRun: false,
      reason: `CDP port ${port} still unreachable after cdp-start`,
    };
  }

  io.log(`[fix] browser doctor: CDP port reachable after cdp-start (${port})`);
  return {
    attempted: true,
    healed: true,
    dryRun: false,
    reason: '',
  };
}

export async function doctorBrowserMcp({ rootDir, io = console, fix = false, dryRun = false, runtime = {} } = {}) {
  const launcherScript = path.join(rootDir, 'scripts', 'run-browser-use-mcp.sh');
  const bootstrapScript = path.join(rootDir, 'scripts', 'browser-use-bootstrap.py');
  const browserUseRepo = findBrowserUseRepo(rootDir);
  const browserUseProjectDir = browserUseRepo
    ? path.join(browserUseRepo, BROWSER_USE_PROJECT_DIR_NAME)
    : path.join(getBrowserUseRepoCandidates(rootDir)[0] || path.resolve(rootDir, '..', BROWSER_USE_REPO_DIR_NAME), BROWSER_USE_PROJECT_DIR_NAME);
  const browserUsePyproject = path.join(browserUseProjectDir, 'pyproject.toml');
  const browserUsePython = path.join(browserUseProjectDir, '.venv', 'bin', 'python');
  const profileConfig = path.join(rootDir, 'config', 'browser-profiles.json');
  const doctorRuntime = resolveBrowserDoctorRuntime(runtime);

  let warnings = 0;
  let effectiveWarnings = 0;
  let errors = 0;
  let autoFixPlanned = 0;
  let autoFixApplied = 0;
  let autoFixHealed = 0;
  const ok = (message) => io.log(`OK   ${message}`);
  const warn = (message, { effective = true } = {}) => {
    warnings += 1;
    if (effective) effectiveWarnings += 1;
    io.log(`WARN ${message}`);
  };
  const err = (message) => {
    errors += 1;
    io.log(`ERR  ${message}`);
  };

  io.log('Browser MCP Doctor');
  io.log(`Repo: ${rootDir}`);
  io.log('');
  io.log('[1/6] Command checks');
  for (const command of ['node', 'bash']) {
    if (doctorRuntime.commandExists(command)) ok(`command exists: ${command}`); else err(`missing command: ${command}`);
  }
  if (doctorRuntime.commandExists('uv')) {
    ok('command exists: uv');
  } else if (doctorRuntime.commandExists('python3')) {
    ok('command exists: python3');
  } else {
    err('missing command: uv or python3');
  }

  const version = doctorRuntime.captureCommand('node', ['-p', 'process.versions.node']);
  const major = Number((version.stdout.trim().split('.')[0] || '0'));
  if (major > 0 && major < 20) {
    warn(`node version is ${version.stdout.trim()} (recommended: >= 20)`);
  }

  io.log('');
  io.log('[2/6] launcher and repo paths');
  if (fs.existsSync(launcherScript)) ok(`launcher script found: ${launcherScript}`); else err(`missing launcher script: ${launcherScript}`);
  if (fs.existsSync(bootstrapScript)) ok(`bootstrap script found: ${bootstrapScript}`); else err(`missing bootstrap script: ${bootstrapScript}`);
  if (fs.existsSync(browserUsePyproject)) {
    ok(`browser-use project found: ${browserUseProjectDir}`);
  } else {
    err(`browser-use project missing: ${browserUseProjectDir} (set AIOS_BROWSER_USE_REPO)`);
  }

  io.log('');
  io.log('[3/6] browser-use runtime');
  if (fs.existsSync(browserUsePython)) {
    ok(`browser-use venv python found: ${browserUsePython}`);
  } else if (fs.existsSync(browserUsePyproject)) {
    warn(`browser-use venv python missing: ${browserUsePython}; run internal browser install`);
  } else {
    warn('browser-use runtime check skipped because project path is missing');
  }

  io.log('');
  io.log('[4/6] profile config');
  if (!fs.existsSync(profileConfig)) {
    err('profile config missing: config/browser-profiles.json');
  } else {
    ok('profile config found: config/browser-profiles.json');
  }

  let defaultProfile = null;
  if (fs.existsSync(profileConfig)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(profileConfig, 'utf8'));
      defaultProfile = parsed?.profiles?.default ?? null;
      if (!defaultProfile) {
        warn('profile config has no profiles.default entry');
      }
    } catch (error) {
      err(`profile config JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  io.log('');
  io.log('[5/6] default profile mode');
  if (!defaultProfile) {
    warn('default profile not configured; skipping CDP mode checks');
  } else if (defaultProfile.cdpUrl) {
    ok(`default profile uses cdpUrl: ${defaultProfile.cdpUrl}`);
  } else if (defaultProfile.cdpPort) {
    const port = Number(defaultProfile.cdpPort);
    if (!Number.isInteger(port) || port <= 0) {
      warn(`default cdpPort is not a valid integer: ${defaultProfile.cdpPort}`);
    } else if (await doctorRuntime.testPortOpen(port)) {
      ok(`default CDP port is reachable: ${port}`);
    } else if (fix) {
      const healed = await autoHealDefaultCdpPort({
        rootDir,
        io,
        port,
        dryRun,
        runtime: doctorRuntime,
      });
      if (healed.dryRun) autoFixPlanned += 1;
      if (healed.attempted) autoFixApplied += 1;
      if (healed.healed) {
        autoFixHealed += 1;
        ok(`default CDP port auto-healed: ${port}`);
      } else {
        const detail = healed.reason ? `; ${healed.reason}` : '';
        warn(`default CDP port is not reachable: ${port} (browser.connect_cdp will fail until CDP is available)${detail}`);
      }
    } else {
      warn(`default CDP port is not reachable: ${port} (browser.connect_cdp will fail until CDP is available)`);
    }
  } else {
    warn('default profile has no cdpUrl/cdpPort; browser-use requires a CDP endpoint');
  }

  io.log('');
  io.log('[6/6] quick next steps');
  io.log('- Recommended: keep default profile CDP service healthy');
  io.log('  node scripts/aios.mjs internal browser cdp-start');
  io.log('  node scripts/aios.mjs internal browser cdp-status');
  io.log('- Browser doctor auto-heal:');
  io.log('  node scripts/aios.mjs internal browser doctor --fix');
  if (fix) {
    io.log(`  [fix] planned=${autoFixPlanned} attempted=${autoFixApplied} healed=${autoFixHealed}`);
  }
  io.log('- If ERR exists: run install script first');
  io.log('  node scripts/aios.mjs setup --components browser');
  io.log('- Then smoke test in client chat: chrome.launch_cdp -> browser.connect_cdp -> page.goto -> page.screenshot -> browser.close');

  io.log('');
  if (errors > 0) io.log(`Result: FAILED (${errors} errors, ${warnings} warnings)`);
  else io.log(`Result: OK (${warnings} warnings)`);

  return { warnings, effectiveWarnings, errors, autoFixPlanned, autoFixApplied, autoFixHealed };
}
