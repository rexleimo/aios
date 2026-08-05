import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../../platform/process.mjs';
import { migrateBrowserMcpConfig, printSnippet } from './mcp-config.mjs';
import {
  resolveDefaultCdpUrl,
  resolveLocalBrowserMcpScript,
} from './runtime-paths.mjs';
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

  return {
    launcherPath,
    cdpUrl,
    browserUseProjectDir: null,
    migrationResult,
  };
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
