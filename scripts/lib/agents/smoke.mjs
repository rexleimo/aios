import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { compressPostReceiveTurn, compressPreSendTurn, requireTurnCompression } from '../interception/index.mjs';
import { DEFAULT_THRESHOLDS } from '../interception/core/types.mjs';
import { loadCanonicalAgents } from './source-tree.mjs';
import { runOneShot } from '../harness/subagent-runtime/one-shot-runner.mjs';
import { MANAGED_RUNNER } from '../evidence/live-execution.mjs';

export const CORE_RISK_ROLES = Object.freeze([
  'planner',
  'architect',
  'implementer',
  'reviewer',
  'code-reviewer',
  'security-reviewer',
  'evidence-auditor',
  'tdd-guide',
  'build-error-resolver',
  'e2e-runner',
  'smoke-runner',
  'token-steward',
  'interception-reviewer',
  'client-surface-reviewer',
  'install-governance-reviewer',
]);

export async function buildAgentsSmokePlan({
  rootDir = process.cwd(),
  roles = CORE_RISK_ROLES,
  dryRun = true,
  generatedAt = new Date().toISOString(),
} = {}) {
  const source = await loadCanonicalAgents({ rootDir });
  const agents = roles.map((role) => {
    const agentId = source.roleMap[role];
    const agent = agentId ? source.agentsById[agentId] : null;
    return {
      role,
      agentId: agentId || '',
      status: agent ? 'planned' : 'missing',
      checks: ['canonical-source', 'projection', 'pre_send-metrics', 'post_receive-metrics', 'provenance'],
      evidencePaths: agentId ? {
        smoke: `.aios/agents/smoke/${agentId}.json`,
        provenance: `.aios/agents/provenance/${agentId}.json`,
        metrics: '.aios/interception/metrics/*.jsonl',
      } : {},
    };
  });

  return {
    schemaVersion: 1,
    kind: 'aios.agents.smoke-plan.v1',
    generatedAt,
    dryRun: Boolean(dryRun),
    policy: 'core-risk agents require smoke/provenance/bidirectional metrics before live workflow enablement',
    agents,
    missingRoles: agents.filter((agent) => agent.status === 'missing').map((agent) => agent.role),
  };
}

const SMOKE_ACKNOWLEDGEMENT = 'AIOS_AGENT_SMOKE_OK';
const SMOKE_TIMEOUT_MS_ENV = 'AIOS_AGENT_SMOKE_TIMEOUT_MS';
/* 中文注释：默认 60s：覆盖客户端进程冷启动 + 模型首 token 延迟。真实任务执行不受此限制（SUBAGENT_TIMEOUT_MS 默认 10 分钟）。 */
const SMOKE_TIMEOUT_MS = 60_000;
/* 中文注释：超时自动升级序列（倍数）：首次用基准超时，超时后翻倍重试，仍失败才 blocked，避免一次瞬时慢响应造成永久卡死。 */
const SMOKE_RETRY_ESCALATIONS = Object.freeze([1, 2, 4]);

function isSmokeTimeout(resultOrError) {
  const message = String(resultOrError?.error || resultOrError?.message || resultOrError || '');
  return /timed out after \d+ ms/i.test(message) || resultOrError?.exitCode === 124;
}

function buildTimeoutBlocker(attemptTimeoutMs, attempts, clientId) {
  return `smoke probe timed out after ${attemptTimeoutMs} ms (attempt ${attempts}/${SMOKE_RETRY_ESCALATIONS.length})`
    + `; if the client is slow to cold-start, re-run with a larger budget:`
    + ` aios agents smoke --live --client ${clientId} --timeout-ms <ms> (or set ${SMOKE_TIMEOUT_MS_ENV})`;
}

function hash(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function parseSmokeTimeoutMs(raw) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : SMOKE_TIMEOUT_MS;
}

function smokeSessionId(agentId, now) {
  return `agents-smoke-${agentId}-${now.getTime()}`;
}

function buildSmokePrompt(agent) {
  return [
    `Reply with exactly ${SMOKE_ACKNOWLEDGEMENT} for managed agent ${agent.id}.`,
    'This is a managed smoke probe. Do NOT return a JSON handoff object or follow your normal output contract; reply with the ACK marker only.',
    'Include this audit payload verbatim so the managed post-receive compression boundary has meaningful output:',
    `agent=${agent.id};role=${agent.role};`.repeat(96),
  ].join('\n');
}

function containsSmokeAcknowledgement(output) {
  const text = String(output || '');
  if (text.includes(SMOKE_ACKNOWLEDGEMENT)) return true;
  try {
    // Some clients wrap replies in their output contract JSON even for probes.
    return JSON.stringify(JSON.parse(text)).includes(SMOKE_ACKNOWLEDGEMENT);
  } catch {
    return false;
  }
}

function buildBlockedReport(plan, reason) {
  return {
    ...plan,
    dryRun: false,
    live: false,
    status: 'blocked',
    blockedReason: reason,
    recorded: 0,
    agents: plan.agents.map((agent) => ({
      ...agent,
      status: agent.agentId ? 'blocked' : 'missing',
      blocker: agent.agentId ? reason : 'missing-canonical-agent',
    })),
  };
}

function hasCompressionReference(packet) {
  const refId = packet?.refs?.[0]?.ref_id;
  return typeof refId === 'string' && refId.length > 0;
}

async function writeLiveEvidence({ rootDir, agent, clientId, sessionId, now, result, preSendPacket, postReceivePacket }) {
  const invocation = result?.managedInvocation;
  if (result?.exitCode !== 0) return { ok: false, reason: 'live-command-failed' };
  if (invocation?.runner !== MANAGED_RUNNER) return { ok: false, reason: 'managed-runner-proof-missing' };
  if (typeof invocation.command !== 'string' || invocation.command.length === 0) {
    return { ok: false, reason: 'managed-command-proof-missing' };
  }
  if (!Array.isArray(invocation.args)) return { ok: false, reason: 'managed-args-proof-missing' };
  if (!containsSmokeAcknowledgement(result?.stdout)) {
    return { ok: false, reason: 'smoke-acknowledgement-missing' };
  }
  if (!hasCompressionReference(preSendPacket)) return { ok: false, reason: 'pre-send-compression-proof-missing' };
  // post-receive: 引擎对 < minRawBytes 的短输出按设计 inline（不落 raw ref）。
  // 短 JSON handoff 输出是合法边界行为，不能当作 smoke 失败——否则契约冲突会
  // 让 Agent 永远无法通过 live smoke（死循环）。
  const postReceiveRawBytes = Buffer.byteLength(String(result?.stdout || ''), 'utf8');
  if (!hasCompressionReference(postReceivePacket) && postReceiveRawBytes >= DEFAULT_THRESHOLDS.minRawBytes) {
    return { ok: false, reason: 'post-receive-compression-proof-missing' };
  }

  const receiptId = randomUUID();
  const execution = {
    runner: MANAGED_RUNNER,
    receiptId,
    clientId,
    agentId: agent.id,
    sessionId,
    invocation: {
      command: invocation.command,
      argsSha256: hash(JSON.stringify(invocation.args)),
      cwd: rootDir,
    },
    exitCode: result.exitCode,
    stdoutSha256: hash(result.stdout || ''),
    stderrSha256: hash(result.stderr || ''),
    observedAt: now.toISOString(),
  };
  const smoke = {
    schemaVersion: 2,
    kind: 'aios.agent-live-smoke.v2',
    status: 'pass',
    clientId,
    agentId: agent.id,
    role: agent.role,
    sessionId,
    execution,
    metrics: {
      sessionId,
      preSendRefId: preSendPacket.refs?.[0]?.ref_id || '',
      postReceiveRefId: postReceivePacket.refs?.[0]?.ref_id || '',
    },
  };
  const provenance = {
    schemaVersion: 2,
    kind: 'aios.live-execution-provenance.v2',
    status: 'verified',
    clientId,
    agentId: agent.id,
    sessionId,
    receiptId,
  };
  const smokePath = path.join(rootDir, '.aios', 'agents', 'smoke', `${agent.id}.json`);
  const provenancePath = path.join(rootDir, '.aios', 'agents', 'provenance', `${agent.id}.json`);
  await fs.mkdir(path.dirname(smokePath), { recursive: true });
  await fs.mkdir(path.dirname(provenancePath), { recursive: true });
  await fs.writeFile(smokePath, `${JSON.stringify(smoke, null, 2)}\n`, 'utf8');
  await fs.writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  return { ok: true, smokePath, provenancePath, receiptId };
}

export async function runAgentsSmoke({
  rootDir = process.cwd(),
  roles = CORE_RISK_ROLES,
  dryRun = false,
  live = false,
  clientId = '',
  now = new Date(),
  runOneShotImpl = runOneShot,
  timeoutMs = parseSmokeTimeoutMs(process.env[SMOKE_TIMEOUT_MS_ENV]),
} = {}) {
  const plan = await buildAgentsSmokePlan({ rootDir, roles, dryRun, generatedAt: now.toISOString() });
  if (dryRun) return plan;
  if (!live) return buildBlockedReport(plan, 'explicit-live-required');
  if (!clientId) return buildBlockedReport(plan, 'explicit-client-required');

  const source = await loadCanonicalAgents({ rootDir });
  const agents = [];
  let recorded = 0;
  for (const item of plan.agents) {
    if (!item.agentId) {
      agents.push(item);
      continue;
    }
    const agent = source.agentsById[item.agentId];
    const sessionId = smokeSessionId(agent.id, now);
    const prompt = buildSmokePrompt(agent);
    /* 中文注释：pre_send 压缩只跑一次（prompt 固定，packet 结果不变）；重试循环只重跑客户端调用与 post_receive。 */
    let preSendPacket = null;
    try {
      preSendPacket = await requireTurnCompression({
        workspaceRoot: rootDir,
        cwd: rootDir,
        sessionId,
        clientId,
        agentId: agent.id,
        hostLevel: 'L2',
        mode: 'tight',
        eventKind: 'pre_send',
        text: prompt,
        run: () => compressPreSendTurn({
          workspaceRoot: rootDir,
          cwd: rootDir,
          sessionId,
          clientId,
          agentId: agent.id,
          hostLevel: 'L2',
          mode: 'tight',
          metrics: { enabled: true },
          prompt,
        }),
      });
    } catch (error) {
      agents.push({ ...item, status: 'blocked', blocker: error instanceof Error ? error.message : String(error), attempts: 0 });
      continue;
    }
    let result = null;
    let postReceivePacket = null;
    let attempts = 0;
    let blocker = '';
    for (const multiplier of SMOKE_RETRY_ESCALATIONS) {
      attempts += 1;
      const attemptTimeoutMs = Math.round(timeoutMs * multiplier);
      try {
        result = await runOneShotImpl(clientId, {
          systemPrompt: agent.systemPrompt,
          userPrompt: prompt,
          timeoutMs: attemptTimeoutMs,
          env: process.env,
          cwd: rootDir,
        });
        if (isSmokeTimeout(result)) {
          /* 中文注释：瞬时慢响应不判死：升级超时后重试，全部耗尽才 blocked。 */
          blocker = buildTimeoutBlocker(attemptTimeoutMs, attempts, clientId);
          continue;
        }
        const output = `${result?.stdout || ''}\n${result?.stderr || ''}`;
        postReceivePacket = await requireTurnCompression({
          workspaceRoot: rootDir,
          cwd: rootDir,
          sessionId,
          clientId,
          agentId: agent.id,
          hostLevel: 'L2',
          mode: 'tight',
          eventKind: 'post_receive',
          text: output,
          run: () => compressPostReceiveTurn({
            workspaceRoot: rootDir,
            cwd: rootDir,
            sessionId,
            clientId,
            agentId: agent.id,
            hostLevel: 'L2',
            mode: 'tight',
            metrics: { enabled: true },
            output,
          }),
        });
        blocker = '';
        break;
      } catch (error) {
        if (isSmokeTimeout(error)) {
          blocker = buildTimeoutBlocker(attemptTimeoutMs, attempts, clientId);
          continue;
        }
        blocker = error instanceof Error ? error.message : String(error);
        break;
      }
    }
    if (blocker) {
      agents.push({ ...item, status: 'blocked', blocker, attempts });
      continue;
    }
    let evidence;
    try {
      evidence = await writeLiveEvidence({
        rootDir,
        agent,
        clientId,
        sessionId,
        now,
        result,
        preSendPacket,
        postReceivePacket,
      });
    } catch (error) {
      agents.push({ ...item, status: 'blocked', blocker: error instanceof Error ? error.message : String(error), attempts });
      continue;
    }
    if (!evidence.ok) {
      agents.push({ ...item, status: 'blocked', blocker: evidence.reason, attempts });
      continue;
    }
    recorded += 1;
    agents.push({ ...item, status: 'pass', sessionId, receiptId: evidence.receiptId, attempts });
  }

  const liveAttempted = agents.filter((agent) => agent.agentId).length;
  return {
    ...plan,
    dryRun: false,
    live: true,
    clientId,
    status: recorded === liveAttempted && plan.missingRoles.length === 0 ? 'pass' : 'blocked',
    recorded,
    agents,
  };
}
