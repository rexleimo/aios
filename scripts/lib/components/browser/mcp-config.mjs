import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getClientHomes } from '../../platform/paths.mjs';
import {
  AUTH_TOOLS_ALIAS,
  LEGACY_BROWSER_ALIAS,
  PRIMARY_BROWSER_ALIAS,
} from './constants.mjs';
import {
  findBrowserUseRepo,
  isLegacyBrowserUseFallback,
  resolveDefaultCdpUrl,
  resolveLauncherScript,
  resolvePythonCommand,
  resolveShellCommand,
  resolveUserPath,
} from './runtime-paths.mjs';

export function printSnippet(io, launcherPath, cdpUrl) {
  const shellCmd = resolveShellCommand();
  const isWin = process.platform === 'win32';
  const argsStr = isWin
    ? `"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "${launcherPath}"`
    : `"${launcherPath}"`;
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
  io.log(`      "command": "${shellCmd}",`);
  io.log(`      "args": [${argsStr}],`);
  io.log('      "env": {');
  io.log(`        "BROWSER_USE_CDP_URL": "${cdpUrl}"`);
  io.log('      }');
  io.log('    }');
  io.log('  }');
  io.log('}');
}

export function buildPreferredMcpServer(rootDir, existingAlias = {}) {
  const launcherScript = resolveLauncherScript(rootDir);
  const shellCommand = resolveShellCommand();
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

  const args = shellCommand === 'pwsh'
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherScript]
    : [launcherScript];

  return {
    type: 'stdio',
    command: shellCommand,
    args,
    env: nextEnv,
  };
}

export function buildAuthToolsMcpServer(rootDir, existingEntry = {}) {
  const authScript = path.join(rootDir, 'scripts', 'auth-tools-server.py');
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const nextEnv = {
    ...(existingEntry && typeof existingEntry.env === 'object' ? existingEntry.env : {}),
    BROWSER_USE_CDP_URL: cdpUrl,
  };

  return {
    type: 'stdio',
    command: resolvePythonCommand(),
    args: ['-u', authScript],
    env: nextEnv,
  };
}

export function migrateOneMcpJsonFile(filePath, rootDir) {
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

export function collectClientMcpTargets(clientHomes = {}) {
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
  const launcherScript = resolveLauncherScript(rootDir);
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

  return applyMcpConfigMigration({ targets, rootDir, io, dryRun });
}

function applyMcpConfigMigration({ targets, rootDir, io, dryRun }) {
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
    `errors=${errors} dryRun=${dryRun ? 'true' : 'false'}`,
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
