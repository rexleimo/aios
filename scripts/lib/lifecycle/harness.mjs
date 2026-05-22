import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';

import { runContextDbCli } from '../contextdb-cli.mjs';
import { spawnCommand } from '../platform/process.mjs';
import {
  buildSoloHarnessCommand,
  checkSoloHarnessProfileReadiness,
  resolveSoloHarnessProfile,
} from '../harness/solo-profiles.mjs';
import {
  clearSoloHarnessStop,
  initSoloRunJournal,
  readSoloControl,
  readSoloRunStatus,
  readSoloRunSummary,
  requestSoloHarnessStop,
  writeSoloRunSummary,
} from '../harness/solo-journal.mjs';
import { finalizeSoloWorktree, prepareSoloWorktree } from '../harness/solo-worktree.mjs';
import {
  classifySoloFailure,
  normalizeSoloIterationOutcome,
  runSoloHarnessLoop,
} from '../harness/solo-runtime.mjs';

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function createSessionId(provider = 'codex') {
  const profile = resolveSoloHarnessProfile({ provider });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${profile.clientId}-${stamp}-solo`;
}

function sessionMetaPath(rootDir, sessionId) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId, 'meta.json');
}

const SKILL_DIRS = ['.codex/skills', '.claude/skills', '.agents/skills'];

async function runHarnessDryRunChecks({ rootDir, provider, sessionId, objective, worktree = false }) {
  const results = [];

  function add(ok, label, detail = '') {
    results.push({ ok, label, detail });
  }

  // 1. provider CLI on PATH
  const profileCheck = await checkSoloHarnessProfileReadiness({ provider });
  add(profileCheck.ok,
    `Provider CLI (${provider})`,
    profileCheck.ok ? 'found on PATH' : profileCheck.reason);

  // 2. skills directories
  let skillCount = 0;
  for (const dir of SKILL_DIRS) {
    try {
      const p = path.join(rootDir, dir);
      const entries = await fs.readdir(p);
      skillCount += entries.filter(e => !e.startsWith('.')).length;
    } catch { /* dir doesn't exist */ }
  }
  add(skillCount > 0,
    'Skills indexed',
    skillCount > 0 ? `${skillCount} skills found across ${SKILL_DIRS.join(', ')}` : 'no skill directories found');

  // 3. workspace config
  const settingsPath = path.join(rootDir, 'config', 'settings.json');
  let configOk = false;
  try {
    await fs.access(settingsPath);
    configOk = true;
  } catch { /* missing */ }
  add(configOk,
    'Workspace config',
    configOk ? 'config/settings.json present' : 'config/settings.json missing (defaults will be used)');

  // 4. ContextDB sessions
  const dbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  let sessionCount = 0;
  try {
    const sessionsDir = path.join(dbRoot, 'sessions');
    const entries = await fs.readdir(sessionsDir);
    sessionCount = entries.length;
  } catch { /* no sessions yet */ }
  add(true,
    'ContextDB',
    sessionCount > 0 ? `${sessionCount} prior session(s) found` : 'no prior sessions — fresh start');

  // 5. MCP config
  let mcpConfigs = 0;
  for (const pattern of ['.mcp.json', '.claude/mcp.json', '.codex/mcp.json']) {
    try {
      await fs.access(path.join(rootDir, pattern));
      mcpConfigs++;
    } catch { /* doesn't exist */ }
  }
  add(mcpConfigs > 0,
    'MCP servers',
    mcpConfigs > 0 ? `${mcpConfigs} MCP config(s) found` : 'no MCP config found — browser tools unavailable');

  // 6. plan artifact (for team/harness)
  let planFound = false;
  try {
    const planDir = path.join(rootDir, 'docs', 'plans');
    const entries = await fs.readdir(planDir);
    planFound = entries.some(e => e.endsWith('.md'));
  } catch { /* no plans dir */ }
  add(planFound,
    'Plan artifact',
    planFound ? 'plan files found in docs/plans/' : 'no plan found — required for team mode, optional for solo');

  // 7. worktree readiness
  let gitReady = false;
  try {
    const gitHead = await fs.readFile(path.join(rootDir, '.git', 'HEAD'), 'utf8');
    gitReady = gitHead.trim().length > 0;
  } catch { /* not a git repo */ }
  add(gitReady,
    'Git repository',
    gitReady ? 'git repo detected' : 'not a git repo — worktree isolation unavailable');

  // 8. worktree ContextDB (gitignored .aios/ won't exist in isolated worktree)
  if (worktree && gitReady) {
    let gitignoreBlocksContextDb = false;
    try {
      const gitignore = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf8');
      const patterns = gitignore.split('\n').map(l => l.trim()).filter(Boolean);
      gitignoreBlocksContextDb = patterns.some(p => p.includes('.aios') || p.includes('context-db'));
    } catch { /* no gitignore */ }
    add(!gitignoreBlocksContextDb,
      'Worktree ContextDB',
      gitignoreBlocksContextDb
        ? '.aios/ is gitignored — ContextDB will be unavailable in worktree'
        : '.aios/ is tracked — ContextDB available in worktree');
  }

  const blocked = results.filter(r => !r.ok && r.label.startsWith('Provider CLI'));
  const warnings = results.filter(r => !r.ok && !r.label.startsWith('Provider CLI'));

  const verdict = blocked.length > 0 ? 'blocked'
    : warnings.length > 0 ? 'warning'
    : 'ready';

  const nextActions = [];
  if (verdict === 'blocked') {
    nextActions.push(`Install or configure the ${provider} CLI on PATH`);
  }
  if (verdict === 'warning' || nextActions.length === 0) {
    for (const w of warnings) {
      if (w.label === 'Skills indexed') nextActions.push('Run aios workspace-init to populate skill index');
      if (w.label === 'Workspace config') nextActions.push('Create config/settings.json or run aios init');
      if (w.label === 'MCP servers') nextActions.push('Add .mcp.json or .claude/mcp.json for browser+tool support');
      if (w.label === 'Plan artifact') nextActions.push('Create docs/plans/<date>-<topic>.md for team mode readiness');
      if (w.label === 'Git repository') nextActions.push('Initialize git repo for worktree isolation support');
      if (w.label === 'Worktree ContextDB') nextActions.push('Remove .aios/ from .gitignore or run without --worktree for ContextDB access');
    }
  }
  if (nextActions.length === 0) {
    nextActions.push('All checks passed — ready to run: node scripts/aios.mjs harness run --objective "..."');
  }

  return { verdict, results, nextActions, sessionId, provider, objective };
}

function ensureSoloHarnessSession({ rootDir, sessionId = '', provider = 'codex', objective = '' } = {}) {
  const profile = resolveSoloHarnessProfile({ provider });
  const resolvedSessionId = normalizeText(sessionId, createSessionId(provider));
  if (existsSync(sessionMetaPath(rootDir, resolvedSessionId))) {
    return {
      sessionId: resolvedSessionId,
      profile,
    };
  }

  runContextDbCli(['init', '--workspace', rootDir]);
  runContextDbCli([
    'session:new',
    '--workspace',
    rootDir,
    '--agent',
    profile.clientId,
    '--project',
    path.basename(rootDir),
    '--goal',
    normalizeText(objective, `Solo harness: ${resolvedSessionId}`),
    '--session-id',
    resolvedSessionId,
    '--tags',
    `lane:solo-harness|provider:${profile.provider}`,
  ]);

  return {
    sessionId: resolvedSessionId,
    profile,
  };
}

function formatHarnessStatusText(status = null) {
  if (!status) {
    return 'AIOS Harness: (no session)\n';
  }
  const lines = [
    `AIOS Harness: ${status.sessionId}`,
    `Objective: ${status.objective || '(none)'}`,
    `Status: ${status.status}`,
    `Provider: ${status.provider}`,
    `Iterations: ${status.iterationCount}`,
    `Last outcome: ${status.lastOutcome || '(none)'}`,
    `Last failure: ${status.lastFailureClass || '(none)'}`,
    `Last stage: ${status.lastStage || '(none)'}`,
    `Stop requested: ${status.stopRequested ? 'yes' : 'no'}`,
  ];
  if (Array.isArray(status.latestEvidence) && status.latestEvidence.length > 0) {
    lines.push(`Latest evidence: ${status.latestEvidence.join(' | ')}`);
  }
  if (status.worktree?.enabled) {
    lines.push(`Worktree: ${status.worktree.preserved ? 'preserved' : 'pending'} ${status.worktree.path || '(no path)'}`);
  }
  if (status.continuitySummaryPath) {
    lines.push(`Continuity: ${status.continuitySummaryPath}`);
  }
  if (status.hookEventsPath) {
    lines.push(`Hook events: ${status.hookEventsPath}`);
  }
  return `${lines.join('\n')}\n`;
}

function extractJsonFence(text = '') {
  const fenced = /```json\s*([\s\S]*?)```/iu.exec(String(text || ''));
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return '';
}

function formatOffloadCanvasPromptBlock(offloadCanvas = null) {
  if (!offloadCanvas?.mermaid) {
    return 'Offload Canvas：暂无。';
  }
  const lines = [
    'Offload Canvas：',
    `- Path: ${offloadCanvas.relativePath || offloadCanvas.path || '(unknown)'}`,
    '- Recall: 先看图定位 node_id；需要原始证据时只用 `aios refs grep/read` 读取对应节点，不要回放完整 l2-events/tool logs。',
    '```mermaid',
    String(offloadCanvas.mermaid).trimEnd(),
    '```',
  ];
  if (offloadCanvas.truncated) {
    lines.splice(3, 0, '- Truncated: yes');
  }
  return lines.join('\n');
}

export function buildIterationPrompt({
  objective = '',
  iteration = 1,
  continuity = null,
  summary = null,
  offloadCanvas = null,
} = {}) {
  const continuityText = continuity?.summary
    ? `上一轮连续性总结：${continuity.summary}`
    : '上一轮连续性总结：暂无。';
  const lastOutcome = normalizeText(summary?.lastOutcome) || 'none';
  const lastFailure = normalizeText(summary?.lastFailureClass) || 'none';

  return [
    `你正在执行 AIOS solo harness 的第 ${iteration} 轮。`,
    `当前目标：${normalizeText(objective) || '(empty)'}`,
    continuityText,
    formatOffloadCanvasPromptBlock(offloadCanvas),
    `上一轮 outcome：${lastOutcome}`,
    `上一轮 failureClass：${lastFailure}`,
    '',
    '请完成一轮工作后只返回一个 JSON 对象，不要输出解释文字，不要输出 Markdown。',
    'JSON 必须包含这些字段：',
    '- outcome: success|noop|blocked|infra-retry|human-gate|stopped|failed',
    '- stage: research|requirements|planning|development|validation|handoff',
    '- summary: 简短中文总结',
    '- evidence: string[]，列出本轮真实证据（文件、命令、截图、checkpoint 或阻塞原因）',
    '- keyChanges: string[]',
    '- keyLearnings: string[]',
    '- nextAction: string',
    '- shouldStop: boolean',
    '- failureClass: none|no-progress|tool-error|runtime-error|workspace-mutation|ownership-gate|safety-gate|stop-requested',
    '',
    '规则：',
    '- 如果已完成目标或本轮不应继续，shouldStop=true。',
    '- 如果需要人工介入，outcome=human-gate。',
    '- 如果只是 CLI/网络/超时等基础设施问题，outcome=infra-retry。',
    '- 如果没有安全的下一步推进但可以之后继续，outcome=blocked, failureClass=no-progress。',
  ].join('\n');
}

function parseHarnessJsonOutput(rawOutput = '') {
  const jsonText = extractJsonFence(rawOutput);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function buildProductionExecuteTurn({ rootDir, aiosRootDir = '', sessionId, objective, provider } = {}) {
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));
  return async ({ iteration, continuity, offloadCanvas, summary, worktree }) => {
    const prompt = buildIterationPrompt({
      objective,
      iteration,
      continuity,
      offloadCanvas,
      summary,
    });
    const workspaceRoot = worktree?.enabled && worktree?.path ? worktree.path : rootDir;
    const built = buildSoloHarnessCommand({
      rootDir: summary?.workspaceRoot || rootDir,
      aiosRootDir: summary?.aiosRootDir || runtimeAiosRootDir,
      sessionId,
      objective,
      provider,
      workspaceRoot,
      prompt,
    });
    const result = await spawnCommand(built.command, built.args, {
      cwd: built.cwd,
      env: process.env,
      timeoutMs: 30 * 60 * 1000,
    });
    const rawOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const parsed = parseHarnessJsonOutput(rawOutput);

    if (result.timedOut) {
      return {
        prompt,
        rawOutput,
        outcome: 'infra-retry',
        summary: 'Provider timed out before returning a valid iteration payload.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'Retry after backoff.',
        shouldStop: false,
        failureClass: 'runtime-error',
      };
    }

    if (result.error) {
      return {
        prompt,
        rawOutput,
        outcome: 'infra-retry',
        summary: result.error.message || 'Provider execution failed.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'Retry after backoff.',
        shouldStop: false,
        failureClass: classifySoloFailure(result.error),
      };
    }

    if (parsed && typeof parsed === 'object') {
      return {
        prompt,
        rawOutput,
        ...parsed,
      };
    }

    if ((result.status ?? 1) !== 0) {
      const failureClass = classifySoloFailure(rawOutput);
      const humanGate = failureClass === 'ownership-gate' || failureClass === 'safety-gate';
      return {
        prompt,
        rawOutput,
        outcome: humanGate ? 'human-gate' : 'infra-retry',
        summary: normalizeText(rawOutput, 'Provider returned a non-zero exit code.'),
        keyChanges: [],
        keyLearnings: [],
        nextAction: humanGate ? 'Review the provider failure and resume manually.' : 'Retry after backoff.',
        shouldStop: humanGate,
        failureClass,
      };
    }

    return {
      prompt,
      rawOutput,
      outcome: 'infra-retry',
      summary: 'Provider output did not include a valid JSON payload for the iteration contract.',
      keyChanges: [],
      keyLearnings: [],
      nextAction: 'Retry with stricter output formatting.',
      shouldStop: false,
      failureClass: 'runtime-error',
    };
  };
}

async function renderStatus(io, status, json = false) {
  if (json) {
    io.log(JSON.stringify(status, null, 2));
  } else {
    io.log(formatHarnessStatusText(status));
  }
}

async function resolveResumeWorktree({ rootDir, summary } = {}) {
  const existing = summary?.worktree && typeof summary.worktree === 'object'
    ? summary.worktree
    : null;
  if (!existing?.enabled) {
    return existing || { enabled: false, baseRef: 'HEAD', path: '', preserved: false, cleanupReason: '' };
  }

  if (existing.path && existsSync(existing.path)) {
    return existing;
  }

  try {
    const prepared = await prepareSoloWorktree({
      rootDir,
      sessionId: summary.sessionId,
      objective: summary.objective,
      enabled: true,
      baseRef: existing.baseRef || 'HEAD',
    });
    return {
      enabled: true,
      baseRef: prepared.baseRef,
      path: prepared.path,
      workspacePath: prepared.workspacePath,
      preserved: false,
      cleanupReason: '',
      initialHead: prepared.initialHead,
    };
  } catch {
    return existing;
  }
}

function createLifecycleHooks({ enabled = true } = {}) {
  if (enabled !== true) {
    return {};
  }
  return {
    onTurnStart: ({ iteration }) => `iteration ${iteration} started`,
    onTurnComplete: ({ outcome }) => {
      const result = normalizeSoloIterationOutcome({
        sessionId: normalizeText(outcome?.sessionId, 'hook-session'),
        iteration: Number.isFinite(outcome?.iteration) ? outcome.iteration : 1,
        ...(outcome && typeof outcome === 'object' ? outcome : {}),
      });
      return `outcome=${result.outcome} failureClass=${result.failureClass}`;
    },
    onBeforeContinuityCommit: ({ outcome }) => {
      const status = normalizeText(outcome?.checkpointStatus, 'running');
      return `checkpointStatus=${status}`;
    },
    onSessionEnd: ({ summary, reason = '' }) => {
      const finalStatus = normalizeText(summary?.status, 'running');
      const normalizedReason = normalizeText(reason, 'completed');
      return `finalStatus=${finalStatus} reason=${normalizedReason}`;
    },
  };
}

export async function runHarnessCommand(options = {}, {
  rootDir,
  aiosRootDir = '',
  io = console,
  executeTurn = null,
  sleepImpl,
} = {}) {
  const subcommand = normalizeText(options.subcommand, 'run');
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));

  if (subcommand === 'status') {
    const status = await readSoloRunStatus({ rootDir, sessionId: options.sessionId });
    if (!status) {
      return { exitCode: 1 };
    }
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'stop') {
    const existing = await readSoloRunSummary({ rootDir, sessionId: options.sessionId });
    if (!existing) {
      return { exitCode: 1 };
    }
    await requestSoloHarnessStop({
      rootDir,
      sessionId: options.sessionId,
      reason: normalizeText(options.reason, 'operator-request'),
    });
    const summary = await writeSoloRunSummary({
      rootDir,
      ...existing,
      stopRequested: true,
      updatedAt: new Date().toISOString(),
    });
    const status = await readSoloRunStatus({ rootDir, sessionId: summary.sessionId });
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'run') {
    const provider = normalizeText(options.provider, 'codex');
    const objective = normalizeText(options.objective);
    if (!objective) {
      throw new Error('harness run requires --objective');
    }
    const hooksEnabled = options.lifecycleHooks !== false;
    const session = ensureSoloHarnessSession({
      rootDir,
      sessionId: options.sessionId,
      provider,
      objective,
    });

    const journal = await initSoloRunJournal({
      rootDir,
      sessionId: session.sessionId,
      objective,
      provider: session.profile.provider,
      clientId: session.profile.clientId,
      profile: normalizeText(options.profile, 'standard'),
      worktree: {
        enabled: options.worktree === true,
        baseRef: normalizeText(options.baseRef, 'HEAD'),
        path: '',
        preserved: false,
        cleanupReason: '',
      },
      aiosRootDir: runtimeAiosRootDir,
      workspaceRoot: path.resolve(rootDir),
    });

    if (options.dryRun === true) {
      const checks = await runHarnessDryRunChecks({ rootDir, provider, sessionId: session.sessionId, objective, worktree: options.worktree === true });
      const status = await readSoloRunStatus({ rootDir, sessionId: session.sessionId });
      const result = {
        verdict: checks.verdict,
        checks: checks.results,
        nextActions: checks.nextActions,
        session: status,
      };
      if (options.json === true) {
        io.log(JSON.stringify(result, null, 2));
      } else {
        const verdictIcon = checks.verdict === 'ready' ? 'OK' : checks.verdict === 'warning' ? 'WARN' : 'BLOCKED';
        io.log(`\nHarness Dry-Run: ${verdictIcon} (${checks.verdict})`);
        io.log(`Objective: ${objective}`);
        io.log(`Session:   ${session.sessionId}`);
        io.log(`Provider:  ${provider}\n`);
        for (const check of checks.results) {
          const icon = check.ok ? '✓' : '✗';
          io.log(`  ${icon} ${check.label}`);
          if (check.detail) io.log(`    ${check.detail}`);
        }
        io.log('');
        for (const action of checks.nextActions) {
          io.log(`  → ${action}`);
        }
        io.log('');
      }
      return { exitCode: checks.verdict === 'blocked' ? 1 : 0, result };
    }

    const readiness = await checkSoloHarnessProfileReadiness({
      provider,
    });
    if (!readiness.ok) {
      if (options.json === true) {
        io.log(JSON.stringify(readiness, null, 2));
      } else {
        io.log(`AIOS Harness: readiness blocked\nReason: ${readiness.reason}\n- ${readiness.nextActions.join('\n- ')}\n`);
      }
      return { exitCode: 1 };
    }

    let prepared = null;
    let preservedWorktree = journal.summary.worktree;
    if (options.worktree === true) {
      prepared = await prepareSoloWorktree({
        rootDir,
        sessionId: session.sessionId,
        objective,
        enabled: true,
        baseRef: normalizeText(options.baseRef, 'HEAD'),
      });
      preservedWorktree = {
        enabled: true,
        baseRef: prepared.baseRef,
        path: prepared.path,
        preserved: false,
        cleanupReason: '',
        workspacePath: prepared.workspacePath,
        initialHead: prepared.initialHead,
      };
      await writeSoloRunSummary({
        rootDir,
        ...journal.summary,
        worktree: preservedWorktree,
        updatedAt: new Date().toISOString(),
      });
    }

    if (preservedWorktree?.enabled && preservedWorktree.path) {
      const codemapStatePath = path.join(rootDir, '.aios', 'codemap.json');
      if (existsSync(codemapStatePath)) {
        try {
          const { buildCodemap } = await import('../components/codemap.mjs');
          await buildCodemap({ projectRoot: preservedWorktree.workspacePath || preservedWorktree.path, io: { log: (msg) => {} } });
        } catch (buildErr) {
          io.log(`[warn] codemap build in worktree failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`);
        }
      }
    }

    try {
      const result = await runSoloHarnessLoop({
        rootDir,
        sessionId: session.sessionId,
        objective,
        provider: session.profile.provider,
        clientId: session.profile.clientId,
        profile: normalizeText(options.profile, 'standard'),
        worktree: preservedWorktree,
        executeTurn: executeTurn || buildProductionExecuteTurn({
          rootDir,
          sessionId: session.sessionId,
          objective,
          provider,
          aiosRootDir: runtimeAiosRootDir,
        }),
        maxIterations: options.maxIterations,
        lifecycleHooks: createLifecycleHooks({ enabled: hooksEnabled }),
        sleepImpl,
      });
      let summary = result.summary;
      if (prepared) {
        const finalized = await finalizeSoloWorktree({
          rootDir,
          worktree: {
            ...prepared,
            path: prepared.path,
            workspacePath: prepared.workspacePath,
            initialHead: prepared.initialHead,
          },
          finalStatus: summary.status,
        });
        summary = await writeSoloRunSummary({
          rootDir,
          ...summary,
          worktree: {
            enabled: finalized.enabled,
            baseRef: finalized.baseRef,
            path: finalized.path,
            preserved: finalized.preserved,
            cleanupReason: finalized.cleanupReason,
          },
          updatedAt: new Date().toISOString(),
        });
      }
      const status = await readSoloRunStatus({ rootDir, sessionId: summary.sessionId });
      await renderStatus(io, status, options.json === true);
      return { exitCode: 0, status };
    } catch (error) {
      if (prepared) {
        await finalizeSoloWorktree({
          rootDir,
          worktree: prepared,
          finalStatus: 'failed',
        });
      }
      throw error;
    }
  }

  if (subcommand === 'resume') {
    const hooksEnabled = options.lifecycleHooks !== false;
    const existing = await readSoloRunSummary({ rootDir, sessionId: options.sessionId });
    if (!existing) {
      return { exitCode: 1 };
    }
    await clearSoloHarnessStop({ rootDir, sessionId: existing.sessionId });
    const restoredWorktree = await resolveResumeWorktree({ rootDir, summary: existing });
    const summary = await writeSoloRunSummary({
      rootDir,
      ...existing,
      stopRequested: false,
      worktree: restoredWorktree,
      updatedAt: new Date().toISOString(),
    });
    let result = await runSoloHarnessLoop({
      rootDir,
      sessionId: summary.sessionId,
      objective: summary.objective,
      provider: summary.provider,
      clientId: summary.clientId,
      profile: summary.profile,
      worktree: restoredWorktree,
      executeTurn: executeTurn || buildProductionExecuteTurn({
        rootDir,
        aiosRootDir: existing.aiosRootDir || runtimeAiosRootDir,
        sessionId: summary.sessionId,
        objective: summary.objective,
        provider: summary.provider,
      }),
      maxIterations: options.maxIterations,
      lifecycleHooks: createLifecycleHooks({ enabled: hooksEnabled }),
      sleepImpl,
    });
    if (restoredWorktree?.enabled && restoredWorktree?.path) {
      const finalized = await finalizeSoloWorktree({
        rootDir,
        worktree: restoredWorktree,
        finalStatus: result.summary.status,
      });
      const finalSummary = await writeSoloRunSummary({
        rootDir,
        ...result.summary,
        worktree: {
          enabled: finalized.enabled,
          baseRef: finalized.baseRef,
          path: finalized.path,
          workspacePath: finalized.workspacePath,
          initialHead: finalized.initialHead,
          preserved: finalized.preserved,
          cleanupReason: finalized.cleanupReason,
        },
        updatedAt: new Date().toISOString(),
      });
      result = {
        ...result,
        summary: finalSummary,
      };
    }
    const status = await readSoloRunStatus({ rootDir, sessionId: result.summary.sessionId });
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  return { exitCode: 1 };
}
