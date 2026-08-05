import fs from 'node:fs';
import path from 'node:path';
import { captureCommand, commandExists } from '../../platform/process.mjs';
import {
  startBrowserCdpService,
  testPortOpen,
} from './cdp-service.mjs';
import {
  resolveLocalBrowserMcpScript,
} from './runtime-paths.mjs';
import { formatErrorMessage } from './shared.mjs';

// 纯函数：合并默认运行时和测试注入，让 doctor 逻辑不直接绑定真实系统命令。
export function resolveBrowserDoctorRuntime(runtime = {}) {
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
  const doctorRuntime = resolveBrowserDoctorRuntime(runtime);
  const localBrowserMcpScript = resolveLocalBrowserMcpScript(rootDir);
  const localBrowserMcpAvailable = fs.existsSync(localBrowserMcpScript);
  const localMcpPackage = path.join(rootDir, 'mcp-server', 'package.json');
  const localMcpDependency = path.join(rootDir, 'mcp-server', 'node_modules', 'playwright', 'package.json');
  const profileConfig = path.join(rootDir, 'config', 'browser-profiles.json');

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
  for (const command of ['node', 'npm']) {
    if (doctorRuntime.commandExists(command)) ok(`command exists: ${command}`); else err(`missing command: ${command}`);
  }

  const version = doctorRuntime.captureCommand('node', ['-p', 'process.versions.node']);
  const major = Number((version.stdout.trim().split('.')[0] || '0'));
  if (major > 0 && major < 20) {
    warn(`node version is ${version.stdout.trim()} (recommended: >= 20)`);
  }

  io.log('');
  io.log('[2/6] local browser MCP paths');
  if (!localBrowserMcpAvailable) {
    err(`missing local browser MCP launcher: ${localBrowserMcpScript}`);
  } else {
    ok(`local browser MCP launcher found: ${localBrowserMcpScript}`);
  }
  if (fs.existsSync(localMcpPackage)) {
    ok(`local browser MCP package found: ${localMcpPackage}`);
  } else {
    err(`local browser MCP package missing: ${localMcpPackage}`);
  }

  io.log('');
  io.log('[3/6] local browser runtime');
  if (fs.existsSync(localMcpDependency)) {
    ok(`local browser MCP dependencies found: ${localMcpDependency}`);
  } else {
    warn(`local browser MCP dependencies missing: ${localMcpDependency}; run internal browser install`);
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
      err(`profile config JSON parse failed: ${formatErrorMessage(error)}`);
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
    warn('default profile has no cdpUrl/cdpPort; local Playwright launch remains available, while explicit CDP connections need an endpoint');
  }

  io.log('');
  io.log('[6/6] quick next steps');
  io.log('- Recommended: keep the selected browser profile healthy');
  io.log('  node scripts/aios.mjs internal browser doctor');
  if (localBrowserMcpAvailable) {
    io.log('- Local browser MCP install/update:');
    io.log('  node scripts/aios.mjs internal browser install');
    io.log('  npm --prefix mcp-server run build');
  } else {
    io.log('- Restore the repository-local browser MCP launcher and rerun install:');
    io.log(`  ${localBrowserMcpScript}`);
  }
  io.log('- Browser doctor auto-heal (macOS CDP service only):');
  io.log('  node scripts/aios.mjs internal browser doctor --fix');
  if (fix) {
    io.log(`  [fix] planned=${autoFixPlanned} attempted=${autoFixApplied} healed=${autoFixHealed}`);
  }
  io.log('- Then smoke test in client chat: browser_health -> browser_launch -> browser_navigate -> browser_screenshot -> browser_close');

  io.log('');
  if (errors > 0) io.log(`Result: FAILED (${errors} errors, ${warnings} warnings)`);
  else io.log(`Result: OK (${warnings} warnings)`);

  return { warnings, effectiveWarnings, errors, autoFixPlanned, autoFixApplied, autoFixHealed };
}
