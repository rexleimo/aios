/**
 * Dry-run readiness — harness 启动前预检
 *
 * 在 runSoloHarnessLoop 进入主循环前调用，检测环境问题以避免 agent 跑到一半才失败。
 * 参考来源: OpenHarness cli.py:333-393 (_evaluate_dry_run_readiness)
 *
 * 检查维度:
 *   1. ContextDB 索引 — .aios/context-db/index.json 是否存在/可读
 *   2. Git 状态 — 是否在 git 仓库内（worktree 模式下必须）
 *   3. Provider 可达性 — provider 字段非空
 *   4. Session 目录 — .aios/ 下是否已有该 session 的目录（resume 场景）
 *
 * 返回 { level, checks, reasons, nextActions }
 *   level: "ready" | "warning" | "blocked"
 *   checks: [{ label, status, detail }]
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 执行 dry-run readiness 预检
 * @param {string} rootDir - workspace 根目录
 * @param {object} opts - { sessionId, provider, worktree, resume }
 * @returns {{ level: string, checks: Array, reasons: Array, nextActions: Array }}
 */
export function evaluateDryRunReadiness(rootDir, opts = {}) {
  const { sessionId = '', provider = '', worktree = null, resume = false } = opts;
  const worktreeEnabled = worktree === true || (worktree && typeof worktree === 'object' && worktree.enabled === true);
  const checks = [];
  const reasons = [];
  const nextActions = [];

  let level = 'ready';

  // ── Check 1: ContextDB 索引 ──
  const contextDbPath = path.join(rootDir, '.aios', 'context-db', 'index.json');
  let contextDbStatus = 'ok';
  let contextDbDetail = 'ContextDB index found.';
  if (!fs.existsSync(contextDbPath)) {
    contextDbStatus = 'warn';
    contextDbDetail = 'ContextDB index.json not found; session events/checkpoints will not persist.';
    if (level === 'ready') level = 'warning';
    reasons.push('ContextDB index missing — harness will run but cannot persist lifecycle events.');
    nextActions.push('Run `aios context init` to initialize ContextDB before relying on checkpoints.');
  } else {
    try {
      JSON.parse(fs.readFileSync(contextDbPath, 'utf8'));
    } catch {
      contextDbStatus = 'warn';
      contextDbDetail = 'ContextDB index.json exists but is not valid JSON.';
      if (level === 'ready') level = 'warning';
      reasons.push('ContextDB index.json is corrupt — checkpoints may fail silently.');
      nextActions.push('Re-run `aios context init` to repair the ContextDB index.');
    }
  }
  checks.push({ label: 'context-db', status: contextDbStatus, detail: contextDbDetail });

  // ── Check 2: Git 状态（worktree 模式下必须） ──
  let gitStatus = 'ok';
  let gitDetail = 'Git repository detected.';
  const gitDir = path.join(rootDir, '.git');
  if (!fs.existsSync(gitDir)) {
    if (worktreeEnabled) {
      gitStatus = 'fail';
      gitDetail = 'Worktree mode requested but rootDir is not a git repository.';
      level = 'blocked';
      reasons.push('Worktree mode requires a git repository at rootDir.');
      nextActions.push('Initialize git (`git init`) or disable worktree mode.');
    } else {
      gitStatus = 'warn';
      gitDetail = 'Not a git repository; changed-files tracking will be limited.';
      if (level === 'ready') level = 'warning';
    }
  }
  checks.push({ label: 'git', status: gitStatus, detail: gitDetail });

  // ── Check 3: Provider ──
  let providerStatus = 'ok';
  let providerDetail = `Provider: ${provider || '(default)'}`;
  if (!provider && !process.env.AIOS_MODEL_ROUTER) {
    providerStatus = 'warn';
    providerDetail = 'No provider specified and AIOS_MODEL_ROUTER not set; model execution may fail.';
    if (level === 'ready') level = 'warning';
    reasons.push('Provider is not configured — model calls will fail if no default is available.');
    nextActions.push('Specify --provider or set AIOS_MODEL_ROUTER=1 for automatic routing.');
  }
  checks.push({ label: 'provider', status: providerStatus, detail: providerDetail });

  // ── Check 4: Session resume ──
  if (resume && sessionId) {
    let sessionStatus = 'ok';
    let sessionDetail = `Session ${sessionId} found.`;
    const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
    if (!fs.existsSync(sessionDir)) {
      sessionStatus = 'warn';
      sessionDetail = `Session ${sessionId} not found in ContextDB; starting fresh.`;
      if (level === 'ready') level = 'warning';
      reasons.push('Resume requested but session directory does not exist — will start fresh.');
      nextActions.push('Check the session ID or omit --resume to start a new session.');
    }
    checks.push({ label: 'session-resume', status: sessionStatus, detail: sessionDetail });
  }

  // ── Deduplicate nextActions ──
  const seen = new Set();
  const dedupedActions = [];
  for (const action of nextActions) {
    const normalized = action.trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      dedupedActions.push(normalized);
    }
  }

  // ── Ready message ──
  if (level === 'ready') {
    reasons.push('All preflight checks passed; harness is ready to start.');
    if (dedupedActions.length === 0) {
      dedupedActions.push('Start the harness loop normally.');
    }
  }

  return { level, checks, reasons, nextActions: dedupedActions };
}

/**
 * 格式化 dry-run readiness 报告为人类可读文本
 * @param {{ level: string, checks: Array, reasons: Array, nextActions: Array }} report
 * @returns {string}
 */
export function formatDryRunReadiness(report) {
  const lines = [`[dry-run] readiness: ${report.level}`];
  for (const check of report.checks) {
    const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
    lines.push(`  ${icon} ${check.label}: ${check.detail}`);
  }
  if (report.reasons.length > 0) {
    lines.push('reasons:');
    for (const reason of report.reasons) {
      lines.push(`  - ${reason}`);
    }
  }
  if (report.nextActions.length > 0) {
    lines.push('next actions:');
    for (const action of report.nextActions) {
      lines.push(`  → ${action}`);
    }
  }
  return lines.join('\n');
}
