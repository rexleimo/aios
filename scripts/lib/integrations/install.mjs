// scripts/lib/integrations/install.mjs — 厂商集成的安装 / 卸载编排。
// 三个平面各自独立可验：
//   skill  —— 钉住拉取 + sha256 校验 + 落入 AIOS catalog + 复用现成分发器铺满全部客户端；
//   mcp    —— 每个客户端走它自己的注册路径（CLI 委托优先，配置文件兜底）；
//   probe  —— 对文档 MCP 端点做真实握手，这是"确实能用"的硬证据。
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getClientHomes } from '../platform/paths.mjs';
import { installContextDbSkills } from '../components/skills/install.mjs';
import {
  buildClientDesiredEntry,
  probeDocsMcp,
  readConfigEntryFor,
  removeConfigEntry,
  upsertConfigEntry,
} from './mcp.mjs';
import {
  INTEGRATION_CLIENT_TABLE,
  describeManualTarget,
  formatInvocation,
  getIntegrationClientEntry,
  resolveIntegrationClientOrder,
} from './clients.mjs';
import {
  fingerprintMcpEntry,
  normalizeMcpEntry,
  readIntegrationLedger,
  writeIntegrationLedger,
} from './ledger.mjs';
import {
  fetchSkillFiles,
  installSkillToCatalog,
  removeSkillFromCatalog,
  resolveVendorStageDir,
  stageSkillFiles,
  verifySkillFiles,
} from './skill.mjs';
const CLIENT_BINARY_HINTS = Object.freeze({
  claude: ['claude'],
  codex: ['codex'],
  opencode: ['opencode'],
  hermes: ['hermes'],
  grok: ['grok'],
  pi: ['pi'],
  gemini: ['gemini'],
  workbuddy: ['workbuddy'],
  zcode: ['zcode'],
});

// Windows 上 claude/codex 等是 npm 生成的 .cmd shim，没有 shell 就无法直接执行。
// 但 `shell: true` 配上 args 会触发 DEP0190（参数不转义），所以这里显式走
// cmd.exe /d /s /c 并把每个参数自行引号化，既保留 .cmd 能力，也不引入转义漏洞。
function quoteWindowsToken(token) {
  const text = String(token);
  if (text.length > 0 && !/[\s"&|<>^]/.test(text)) return text;
  return `"${text.replace(/"/gu, '\\"')}"`;
}

function defaultRunImpl(command, args, options = {}) {
  const { stdio = 'pipe', ...rest } = options;
  return new Promise((resolve) => {
    const onDone = (error, stdout, stderr) => resolve({
      status: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
    });
    if (process.platform === 'win32') {
      const line = [command, ...args].map(quoteWindowsToken).join(' ');
      execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line], { ...rest, windowsHide: true }, onDone);
      return;
    }
    execFile(command, args, { ...rest, windowsHide: true }, onDone);
  });
}

export function defaultCommandExistsImpl(command) {
  const envPath = process.env.PATH || '';
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        if (fs.existsSync(candidate)) return true;
      } catch {
        // 忽略无权限目录
      }
    }
  }
  return false;
}

export function formatInvocationOrEmpty(invocation) {
  return formatInvocation(invocation);
}

function normalizeClientList(clients) {
  const known = resolveIntegrationClientOrder();
  if (!clients || clients === 'all') return [...known];
  if (Array.isArray(clients)) return clients;
  return String(clients).split(',').map((item) => item.trim()).filter(Boolean);
}

// 单个客户端的 MCP 注册。返回结构化状态，不做任何"看起来成功了"的措辞。
async function registerClientMcp({
  client,
  integration,
  scope,
  dryRun,
  clientHome,
  projectRoot,
  ledger,
  runImpl,
  commandExistsImpl,
  isTTY = false,
  now,
} = {}) {
  const entry = getIntegrationClientEntry(client);
  if (!entry) {
    return { client, status: 'unsupported', reason: 'no-client-table-entry' };
  }
  if (entry.transport === 'manual') {
    // 已知文件位置、未知 transport 键名：不静默跳过，也不编造键名，
    // 而是把目标文件和带占位符的 JSON 形状交给人工。
    const target = describeManualTarget(client, { clientHome, projectRoot, integration, scope });
    return {
      client,
      status: 'manual-step-required',
      reason: entry.unverifiedReason,
      evidence: entry.evidence,
      configPath: target?.path || '',
      snippet: target?.snippet || null,
      namespace: entry.namespace,
    };
  }

  if (entry.transport === 'config') {
    const current = readConfigEntryFor({ client, serverName: integration.mcp.serverName, clientHome, projectRoot });
    if (current.parseError) {
      return { client, status: 'failed', reason: `config-parse-failed: ${current.parseError}`, configPath: current.targetPath };
    }
    const desired = buildClientDesiredEntry(client, integration);
    const currentFingerprint = fingerprintMcpEntry(normalizeMcpEntry(current.entry));
    const desiredFingerprint = fingerprintMcpEntry(normalizeMcpEntry(desired));
    const ledgerEntry = ledger.entries?.[client];
    if (current.entry && currentFingerprint === desiredFingerprint && ledgerEntry?.fingerprint === currentFingerprint) {
      return { client, status: 'already-registered', configPath: current.targetPath, fingerprint: currentFingerprint };
    }
    if (current.entry && ledgerEntry && ledgerEntry.fingerprint !== currentFingerprint) {
      return { client, status: 'conflict', reason: 'entry-changed-after-aios-registration', configPath: current.targetPath };
    }
    if (current.entry && !ledgerEntry) {
      return { client, status: 'external', reason: 'entry-present-but-not-written-by-aios', configPath: current.targetPath };
    }
    const result = upsertConfigEntry({ client, integration, clientHome, projectRoot, dryRun, now });
    if (result.status === 'error') return { client, status: 'failed', reason: result.reason };
    if (result.status === 'planned') {
      return { client, status: 'planned', configPath: result.configPath, invocation: `write ${result.configPath}` };
    }
    const readBack = readConfigEntryFor({ client, serverName: integration.mcp.serverName, clientHome, projectRoot });
    const readBackFingerprint = fingerprintMcpEntry(normalizeMcpEntry(readBack.entry));
    if (readBackFingerprint !== desiredFingerprint) {
      return { client, status: 'failed', reason: 'post-write-readback-mismatch', configPath: result.configPath };
    }
    return {
      client,
      status: 'registered',
      configPath: result.configPath,
      fingerprint: readBackFingerprint,
      createdAt: result.createdAt,
    };
  }

  // CLI 委托路径：客户端自己写自己的配置。
  const binary = (CLIENT_BINARY_HINTS[client] || [client])[0];
  if (!commandExistsImpl(binary)) {
    const preview = entry.buildAdd ? formatInvocation(entry.buildAdd({ mcp: integration.mcp, scope })) : '';
    return {
      client,
      status: 'client-missing',
      reason: `client binary "${binary}" not found on PATH`,
      invocation: preview,
      verified: entry.verified,
    };
  }
  if (!entry.verified) {
    const preview = entry.buildAdd ? formatInvocation(entry.buildAdd({ mcp: integration.mcp, scope })) : '';
    return {
      client,
      status: 'manual-step-required',
      reason: entry.unverifiedReason,
      invocation: preview,
      evidence: entry.evidence,
    };
  }
  const invocation = entry.buildAdd({ mcp: integration.mcp, scope });
  if (dryRun) {
    return { client, status: 'planned', invocation: formatInvocation(invocation) };
  }
  if (entry.interactive && !isTTY) {
    return {
      client,
      status: 'pending-interactive',
      reason: entry.manualHint || 'client requires an interactive terminal',
      invocation: formatInvocation(invocation),
    };
  }
  const result = await runImpl(invocation.command, invocation.args, { stdio: 'pipe' });
  if (result.status !== 0) {
    return {
      client,
      status: 'failed',
      reason: `cli-exit-${result.status}`,
      invocation: formatInvocation(invocation),
      stderr: String(result.stderr || '').trim().slice(0, 400),
    };
  }
  const desired = buildClientDesiredEntry(client, integration);
  return {
    client,
    status: 'registered',
    invocation: formatInvocation(invocation),
    fingerprint: fingerprintMcpEntry(normalizeMcpEntry(desired)),
    verification: 'cli-exit-0',
    createdAt: now(),
  };
}

async function unregisterClientMcp({ client, integration, scope, dryRun, clientHome, projectRoot, ledger, runImpl, isTTY = false, now } = {}) {
  const entry = getIntegrationClientEntry(client);
  if (!entry) return { client, status: 'unsupported' };
  if (entry.transport === 'manual') {
    return {
      client,
      status: 'manual-step-required',
      reason: entry.unverifiedReason,
      invocation: formatInvocation(entry.buildRemove({ mcp: integration.mcp, scope })),
    };
  }

  if (entry.transport === 'config') {
    const current = readConfigEntryFor({ client, serverName: integration.mcp.serverName, clientHome, projectRoot });
    if (!current.entry) return { client, status: 'not-found' };
    const ledgerEntry = ledger.entries?.[client];
    const currentFingerprint = fingerprintMcpEntry(normalizeMcpEntry(current.entry));
    if (!ledgerEntry || ledgerEntry.fingerprint !== currentFingerprint) {
      return { client, status: 'conflict', reason: 'entry-changed-after-aios-registration' };
    }
    const result = removeConfigEntry({ client, integration, clientHome, projectRoot, dryRun });
    return { client, status: result.status === 'planned' ? 'planned' : result.status, configPath: result.configPath };
  }

  if (!entry.verified || !entry.buildRemove) {
    return { client, status: 'skipped', reason: entry.unverifiedReason || 'no-remove-invocation' };
  }
  const invocation = entry.buildRemove({ mcp: integration.mcp, scope });
  if (dryRun) return { client, status: 'planned', invocation: formatInvocation(invocation) };
  if (entry.interactive && !isTTY) {
    return {
      client,
      status: 'pending-interactive',
      reason: entry.manualHint || 'client requires an interactive terminal',
      invocation: formatInvocation(invocation),
    };
  }
  const result = await runImpl(invocation.command, invocation.args, { stdio: 'pipe' });
  if (result.status !== 0) {
    return { client, status: 'failed', reason: `cli-exit-${result.status}`, invocation: formatInvocation(invocation) };
  }
  return { client, status: 'removed', invocation: formatInvocation(invocation) };
}

export async function addIntegration({
  rootDir,
  projectRoot = rootDir,
  integration,
  clients = 'all',
  scope = 'global',
  dryRun = false,
  skipSkills = false,
  skipMcp = false,
  io = console,
  env = process.env,
  homeDir = os.homedir(),
  fetchImpl = globalThis.fetch,
  runImpl = defaultRunImpl,
  commandExistsImpl = defaultCommandExistsImpl,
  isTTY = Boolean(process.stdin.isTTY),
  installSkillsImpl = installContextDbSkills,
  probeImpl = probeDocsMcp,
  now = () => new Date().toISOString(),
  timeoutMs,
  ledgerOptions = {},
} = {}) {
  const homes = getClientHomes(env, homeDir);
  const ledger = readIntegrationLedger(integration.id, { ...ledgerOptions, env, homeDir });
  const report = {
    vendor: integration.id,
    displayName: integration.displayName,
    serverName: integration.mcp.serverName,
    dryRun,
    scope,
    skills: null,
    mcp: [],
    probe: null,
    ledgerPath: '',
  };

  if (!skipSkills) {
    const stageDir = resolveVendorStageDir(integration.id, { env, homeDir });
    const fetched = await fetchSkillFiles({ integration, fetchImpl, ...(timeoutMs ? { timeoutMs } : {}) });
    const verified = verifySkillFiles({ files: fetched.files, skill: integration.skill });
    if (dryRun) {
      report.skills = {
        status: 'planned',
        commit: fetched.commit,
        sha256: verified.sha256,
        fileCount: verified.fileCount,
        installName: integration.skill.installName,
        stageDir,
      };
    } else {
      await stageSkillFiles({ vendor: integration.id, files: fetched.files, stageDir });
      const catalog = await installSkillToCatalog({
        rootDir,
        integration,
        stageDir,
        ledger,
        clients: resolveIntegrationClientOrder(),
      });
      if (catalog.status === 'refused') {
        report.skills = { ...catalog, status: 'refused' };
      } else {
        const fanout = await installSkillsImpl({
          rootDir,
          projectRoot,
          client: 'all',
          scope,
          installMode: 'copy',
          selectedSkills: [integration.skill.installName],
          force: true,
          io,
        });
        report.skills = {
          status: catalog.status === 'reused' ? 'reused' : 'installed',
          commit: fetched.commit,
          sha256: verified.sha256,
          fileCount: verified.fileCount,
          catalogPath: catalog.catalogPath,
          stageDir,
          fanout,
        };
        ledger.skill = {
          installName: integration.skill.installName,
          repo: integration.skill.repo,
          commit: fetched.commit,
          sha256: verified.sha256,
          catalogSha256: catalog.catalogSha256,
          catalogPath: catalog.catalogPath,
          stageDir,
          createdAt: ledger.skill?.createdAt || now(),
          lastVerifiedAt: now(),
        };
      }
    }
  }

  if (!skipMcp) {
    const requested = normalizeClientList(clients);
    const known = new Set(resolveIntegrationClientOrder());
    const unknown = requested.filter((client) => !known.has(client));
    if (unknown.length > 0) {
      throw new Error(`unknown client(s): ${unknown.join(', ')}. Known: ${[...known].join(', ')}`);
    }
    for (const client of requested) {
      const result = await registerClientMcp({
        client,
        integration,
        scope,
        dryRun,
        clientHome: homes[client],
        projectRoot,
        ledger,
        runImpl,
        commandExistsImpl,
        isTTY,
        now,
      });
      report.mcp.push(result);
      if (!dryRun && result.status === 'registered') {
        ledger.entries[client] = {
          client,
          serverName: integration.mcp.serverName,
          url: integration.mcp.url,
          transport: getIntegrationClientEntry(client).transport,
          scope,
          configPath: result.configPath || '',
          fingerprint: result.fingerprint,
          createdAt: result.createdAt || now(),
          lastVerifiedAt: now(),
        };
      }
      if (!dryRun && result.status === 'removed') {
        delete ledger.entries[client];
      }
    }
  }

  if (!dryRun) {
    report.ledgerPath = await writeIntegrationLedger(integration.id, ledger, { env, homeDir });
  }

  const probe = await probeImpl(integration, fetchImpl ? { fetchImpl } : {});
  report.probe = probe;
  return report;
}

export async function removeIntegration({
  rootDir,
  integration,
  clients = 'all',
  scope = 'global',
  dryRun = false,
  runImpl = defaultRunImpl,
  isTTY = Boolean(process.stdin.isTTY),
  io = console,
  env = process.env,
  homeDir = os.homedir(),
  now = () => new Date().toISOString(),
  ledgerOptions = {},
} = {}) {
  const homes = getClientHomes(env, homeDir);
  const ledger = readIntegrationLedger(integration.id, { ...ledgerOptions, env, homeDir });
  const report = { vendor: integration.id, dryRun, mcp: [], skill: null, ledgerPath: '' };
  const rootDirForSkillRemoval = rootDir;

  for (const client of normalizeClientList(clients)) {
    const result = await unregisterClientMcp({
      client,
      integration,
      scope,
      dryRun,
      clientHome: homes[client],
      projectRoot: '',
      ledger,
      runImpl,
      isTTY,
      now,
    });
    report.mcp.push(result);
    if (!dryRun && ['removed', 'not-found'].includes(result.status)) {
      delete ledger.entries[client];
    }
  }

  if (!dryRun) {
    const skillRemoval = removeSkillFromCatalog({ rootDir: rootDirForSkillRemoval, integration, ledger });
    report.skill = skillRemoval;
    if (skillRemoval.status === 'removed' || skillRemoval.status === 'not-found') {
      ledger.skill = null;
    }
    report.ledgerPath = await writeIntegrationLedger(integration.id, ledger, { env, homeDir });
  }
  return report;
}

export { INTEGRATION_CLIENT_TABLE };
