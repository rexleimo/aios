import fs from 'node:fs';
import path from 'node:path';
import { commandExists, runCommand } from '../../platform/process.mjs';
import { BROWSER_USE_PROJECT_DIR_NAME } from './constants.mjs';
import { migrateBrowserMcpConfig, printSnippet } from './mcp-config.mjs';
import {
  findBrowserUseRepo,
  formatBrowserUseMissingMessage,
  resolveDefaultCdpUrl,
  resolveLauncherScript,
  resolvePythonCommand,
  resolveVenvPythonPath,
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

  const launcherScript = resolveLauncherScript(rootDir, platform);
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

  if (!skipPlaywrightInstall) {
    installBrowserUseRuntime({ browserUseProjectDir, platform, dryRun, io });
  }

  let migrationResult = null;
  try {
    migrationResult = await migrateBrowserMcpConfig({ rootDir, io, dryRun, clientHomes });
  } catch (error) {
    const message = formatErrorMessage(error).split(/\r?\n/u)[0];
    io.log(`[warn] browser MCP config auto-update skipped: ${message}`);
  }

  const launcherPath = dryRun
    ? `<ABSOLUTE_PATH_TO_REPO>/scripts/${path.basename(resolveLauncherScript(rootDir, platform))}`
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

function installBrowserUseRuntime({ browserUseProjectDir, platform, dryRun, io }) {
  const runInBrowserUse = (command, args) => {
    io.log(`+ (cd ${browserUseProjectDir} && ${command} ${args.join(' ')})`);
    if (!dryRun) {
      runCommand(command, args, { cwd: browserUseProjectDir });
    }
  };

  const venvPython = resolveVenvPythonPath(browserUseProjectDir, platform);
  if (fs.existsSync(venvPython)) {
    io.log(`+ browser-use runtime found: ${venvPython}`);
  } else if (commandExists('uv')) {
    runInBrowserUse('uv', ['sync']);
  } else {
    const pythonCmd = resolvePythonCommand(platform);
    requireCommand(pythonCmd);
    runInBrowserUse(pythonCmd, ['-m', 'venv', '.venv']);
    const nextVenvPython = resolveVenvPythonPath(browserUseProjectDir, platform);
    runInBrowserUse(nextVenvPython, ['-m', 'pip', 'install', '-U', 'pip']);
    runInBrowserUse(nextVenvPython, ['-m', 'pip', 'install', '-e', '.[dev]']);
  }
}
