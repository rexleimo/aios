import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../../platform/process.mjs';
import { migrateBrowserMcpConfig, printSnippet } from './mcp-config.mjs';
import {
  resolveDefaultCdpUrl,
  resolveLocalBrowserMcpScript,
} from './runtime-paths.mjs';
import { PRIMARY_BROWSER_ALIAS } from './constants.mjs';
import { formatErrorMessage, requireCommand } from './shared.mjs';

export async function installBrowserMcp({
  rootDir,
  skipPlaywrightInstall = false,
  dryRun = false,
  io = console,
  clientHomes = null,
  platform = process.platform,
} = {}) {
  requireCommand('node');

  const localMcpScript = resolveLocalBrowserMcpScript(rootDir);
  const localMcpAvailable = fs.existsSync(localMcpScript)
    && fs.existsSync(path.join(rootDir, 'mcp-server', 'package.json'));
  if (!localMcpAvailable) {
    throw new Error(`repository-local browser MCP is unavailable: ${localMcpScript}`);
  }

  io.log('[info] using repository-local Node/Playwright MCP.');
  installLocalBrowserMcpRuntime({ rootDir, skipPlaywrightInstall, dryRun, io });

  let migrationResult = null;
  try {
    migrationResult = await migrateBrowserMcpConfig({ rootDir, io, dryRun, clientHomes });
  } catch (error) {
    const message = formatErrorMessage(error).split(/\r?\n/u)[0];
    io.log(`[warn] browser MCP config auto-update skipped: ${message}`);
  }

  const launcherPath = dryRun
    ? `<ABSOLUTE_PATH_TO_REPO>/scripts/${path.basename(localMcpScript)}`
    : path.resolve(localMcpScript);
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  printSnippet(io, launcherPath, cdpUrl);

  // The runtime exists now, so a Pi-global browser server can actually start.
  // The write itself stays with the Pi component (single owner of Pi config
  // shape); this call only reports the readiness fact install just created.
  const piBridge = await ensurePiBrowserMcpServer({ rootDir, dryRun, io, clientHomes });

  return {
    launcherPath,
    cdpUrl,
    browserUseProjectDir: null,
    migrationResult,
    piBridge,
  };
}

// Advertise the browser server in the Pi-global mcp.json. Best-effort: a
// missing Pi home or an unwritable file must never fail the browser install.
export async function ensurePiBrowserMcpServer({
  rootDir = '',
  dryRun = false,
  io = console,
  piHome = null,
  clientHomes = null,
} = {}) {
  try {
    const { getClientHomes } = await import('../../platform/paths.mjs');
    const { buildAiosPiBrowserServer, ensurePiMcpServers, resolvePiMcpJsonPath } = await import('../pi/mcp-adapter.mjs');
    // Home resolution mirrors migrateBrowserMcpConfig: an injected clientHomes
    // map wins, so isolated callers (tests, dry runs) never reach the real
    // ~/.pi/agent/mcp.json. piHome === '' explicitly means "no Pi home".
    const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env);
    const home = piHome === null ? String(homes.pi || '') : piHome;
    if (!home) return { status: 'skipped', reason: 'no Pi client home resolved' };
    const server = buildAiosPiBrowserServer({ aiosRoot: rootDir });
    if (!server) return { status: 'skipped', reason: 'no AIOS root resolved' };
    const result = ensurePiMcpServers({
      mcpJsonPath: resolvePiMcpJsonPath(home),
      servers: { [PRIMARY_BROWSER_ALIAS]: server },
      dryRun,
      io,
    });
    return { status: result.action, ...result };
  } catch (error) {
    const reason = formatErrorMessage(error);
    io?.log?.(`[warn] Pi browser MCP wiring skipped: ${reason}`);
    return { status: 'error', reason };
  }
}

function installLocalBrowserMcpRuntime({ rootDir, skipPlaywrightInstall, dryRun, io }) {
  const mcpServerDir = path.join(rootDir, 'mcp-server');
  const packageLock = path.join(mcpServerDir, 'package-lock.json');
  const dependencyMarker = path.join(mcpServerDir, 'node_modules', 'playwright', 'package.json');
  if (!fs.existsSync(dependencyMarker)) {
    requireCommand('npm');
    const installArgs = fs.existsSync(packageLock) ? ['ci'] : ['install'];
    io.log(`+ (cd ${mcpServerDir} && npm ${installArgs.join(' ')})`);
    if (!dryRun) {
      runCommand('npm', installArgs, { cwd: mcpServerDir });
    }
  } else {
    io.log(`[ok] local browser MCP dependencies found: ${dependencyMarker}`);
  }

  if (!skipPlaywrightInstall) {
    const playwrightCli = path.join(mcpServerDir, 'node_modules', 'playwright', 'cli.js');
    io.log(`+ (cd ${mcpServerDir} && node ${playwrightCli} install chromium)`);
    if (!dryRun) {
      if (!fs.existsSync(playwrightCli)) {
        throw new Error(`Playwright CLI missing after local MCP dependency install: ${playwrightCli}`);
      }
      runCommand('node', [playwrightCli, 'install', 'chromium'], { cwd: mcpServerDir });
    }
  }

  requireCommand('npm');
  io.log(`+ (cd ${mcpServerDir} && npm run build)`);
  if (!dryRun) {
    runCommand('npm', ['run', 'build'], { cwd: mcpServerDir });
  }
}
