import { promises as fs } from 'node:fs';

import { buildAgentCatalogue, renderAgentCatalogueText } from '../../../foundation/agents/catalogue.mjs';
import { runAgentsSmoke } from '../../../foundation/agents/smoke.mjs';
import { getClientCommandName, getClientRuntimeId } from '../../../foundation/clients/registry.mjs';
import { captureCommand } from '../../../foundation/platform/process.mjs';
import { runOneShotAgent } from '../../../foundation/ctx-agent-core/entry/one-shot.mjs';
import {
  buildSubagentContextEvidenceRecord,
  buildSubagentContextProbe,
  classifyProbeAnswer,
  createProbeNonce,
  evidencePathFor,
  readSubagentContextDeclaration,
  writeSubagentContextDeclaration,
  writeSubagentContextEvidence,
} from '../../../foundation/clients/reporting/capability-report/subagent-context.mjs';

export async function runAgentsCommand(
  options = {},
  {
    rootDir = process.cwd(),
    stdout = process.stdout,
  } = {}
) {
  const subcommand = String(options.subcommand || 'doctor').trim().toLowerCase();
  if (!['doctor', 'list', 'smoke', 'probe'].includes(subcommand)) {
    throw new Error('agents requires subcommand: doctor, list, smoke, or probe');
  }
  if (subcommand === 'probe') {
    const report = await runSubagentContextProbeCommand(options, { rootDir });
    const json = options.json || options.format === 'json';
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderSubagentContextProbeText(report));
    return { exitCode: report.ok ? 0 : 2, report };
  }
  if (subcommand === 'smoke') {
    const explicitTimeout = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : undefined;
    const report = await runAgentsSmoke({
      rootDir,
      dryRun: options.dryRun === true,
      live: options.live === true,
      clientId: options.clientId || '',
      timeoutMs: explicitTimeout,
    });
    const json = options.json || options.format === 'json';
    stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderAgentsSmokeText(report));
    return { exitCode: report.dryRun || report.status === 'pass' ? 0 : 1, report };
  }
  const report = await buildAgentCatalogue({ rootDir });
  const json = options.json || options.format === 'json';
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderAgentCatalogueText(report));
  const blocked = subcommand === 'doctor' && report.strict.blocked;
  return { exitCode: blocked ? 1 : 0, report };
}

function readClientVersion(commandName) {
  if (!commandName) return null;
  try {
    // 中文注释：走平台 spawn spec，Windows 上 npm 火的 shim（如 pi）才不会因为
    // 不可执行而被误读成“没有版本”。
    const result = captureCommand(commandName, ['--version'], { spawnOptions: { timeout: 5000 } });
    const line = String(result.stdout || result.stderr || '').split('\n')[0].trim();
    return line || null;
  } catch {
    return null;
  }
}

async function resolveRecordAnswer(recordAnswer = '') {
  const raw = String(recordAnswer || '');
  if (!raw) return '';
  try {
    return await fs.readFile(raw, 'utf8');
  } catch {
    // 不是文件路径就当成逐字粘贴的回答本身。
    return raw;
  }
}

/**
 * Probe one client for subagent context freshness (fork vs fresh).
 *
 * Deps are injectable so tests never spawn a live client. The judgment itself
 * is a pure function in the capability-report module; this runner only supplies
 * the observation and writes evidence.
 */
export async function runSubagentContextProbeCommand(
  options = {},
  {
    rootDir = process.cwd(),
    runAgent = runOneShotAgent,
    readVersion = readClientVersion,
    now = () => new Date().toISOString(),
  } = {}
) {
  const client = String(options.clientId || options.client || '').trim();
  if (!client) {
    return { ok: false, error: 'agents probe requires --client <client>' };
  }

  let clientRuntimeId = '';
  try {
    clientRuntimeId = getClientRuntimeId(client);
  } catch {
    clientRuntimeId = '';
  }
  if (!clientRuntimeId) {
    return { ok: false, error: `no verified one-shot runtime for client: ${client}` };
  }

  const nonce = String(options.nonce || '').trim() || createProbeNonce();
  const probe = buildSubagentContextProbe({ client, nonce });
  const declarationBefore = await readSubagentContextDeclaration({ rootDir, client });
  const spawnDespiteDeclaration = options.spawn === true;
  // 中文注释：--spawn 是“上游是不是新增了 subagent 工具”的复测。它的证据写独立文件，
  // 不覆盖声明脱基于的那份证据，两个事实不互相稀释。
  const evidencePath = evidencePathFor({ rootDir, client, suffix: spawnDespiteDeclaration ? '.spawn' : '' });
  const recordAnswer = await resolveRecordAnswer(options.recordAnswer);
  const mode = recordAnswer ? 'operator' : 'headless';

  // 中文注释：surface 是声明层的事实。上游没有 subagent 工具时，测也没有对象，
  // 判 not-applicable 而不是永远 unknown（后者会把“不存在”永久计成“未完成”）；
  // 这里不解析 limits 散文，只读显式字段。
  if (declarationBefore.surface === 'none' && !spawnDespiteDeclaration) {
    const measuredAt = now();
    const record = buildSubagentContextEvidenceRecord({
      client,
      clientRuntimeId,
      nonce,
      answer: '',
      verdict: 'not-applicable',
      reason: 'declared-no-subagent-surface',
      mode: 'declaration',
      exitCode: null,
      clientVersion: readVersion(getClientCommandName(client)),
      measuredAt,
    });
    await writeSubagentContextEvidence({ rootDir, record });
    const declaration = await writeSubagentContextDeclaration({
      rootDir,
      client,
      contextMode: 'not-applicable',
      surface: 'none',
      reason: 'declared-no-subagent-surface',
      evidenceRef: evidencePath,
      measuredAt,
    });
    return {
      ok: true,
      client,
      clientRuntimeId,
      verdict: record.verdict,
      reason: record.reason,
      confidence: record.confidence,
      mode: record.mode,
      measuredAt,
      evidencePath,
      declaration,
      spawned: false,
    };
  }

  if (options.dryRun === true) {
    return {
      ok: true,
      dryRun: true,
      client,
      clientRuntimeId,
      mode,
      nonce,
      evidencePath,
      prompt: probe.prompt,
    };
  }

  let answer = recordAnswer;
  let exitCode = null;
  let hostStructured = null;
  if (!recordAnswer) {
    const result = runAgent(clientRuntimeId, probe.prompt, []);
    exitCode = Number.isFinite(result?.exitCode) ? result.exitCode : null;
    hostStructured = result?.structured || null;
    // 中文注释：宿主跑在 JSON 模式时，只有 assistant 文本才是“回答”。
    // 直接分类原始事件流会把回显的 prompt 当成回答（nonce 就在里面），
    // 从而把 fresh 误判成 fork。
    answer = hostStructured && typeof hostStructured.assistantText === 'string'
      ? hostStructured.assistantText
      : String(result?.output || '');
  }

  const judgment = classifyProbeAnswer({ answer, nonce });
  // 中文注释：宿主按约定 schema 自己说“没有 subagent 工具”，而配置里本来就声明
  // surface=none 时，这是对既有声明的正向印证（不再是“缺证据”），判 not-applicable。
  // 未声明的客户端不吃这条：AIOS 不从模型自述里新建能力声明，只印证已有声明。
  const corroboratedAbsence = declarationBefore.surface === 'none'
    && judgment.verdict === 'unknown'
    && judgment.reason === 'no-subagent-spawned';
  const verdict = corroboratedAbsence ? 'not-applicable' : judgment.verdict;
  // 中文注释：归因要可行动（配置/网络/模型/参数），而不是笼统的 answer-not-structured；
  // verdict 仍然是 unknown，不拿“跑失败”冒充测量结论。
  const failedInvocation = exitCode !== null && exitCode !== 0;
  const hostError = hostStructured && (hostStructured.errorMessage || hostStructured.stopReason === 'error')
    ? String(hostStructured.errorMessage || hostStructured.stopReason)
    : '';
  let reason = judgment.reason;
  if (verdict === 'not-applicable' && corroboratedAbsence) reason = 'host-reports-no-subagent-tool';
  else if (verdict === 'unknown') {
    if (failedInvocation) reason = `host-invocation-failed (exit ${exitCode})`;
    else if (hostError) reason = `host-model-error (${hostError})`;
  }
  const record = buildSubagentContextEvidenceRecord({
    client,
    clientRuntimeId,
    nonce,
    answer,
    verdict,
    reason,
    confidence: corroboratedAbsence ? 'direct' : 'indirect',
    mode,
    exitCode,
    clientVersion: readVersion(getClientCommandName(client)),
    hostStructured,
    measuredAt: now(),
  });
  await writeSubagentContextEvidence({
    rootDir,
    record,
    suffix: spawnDespiteDeclaration ? '.spawn' : '',
  });

  // 中文注释：--spawn 是诊断式复测（验证“上游是不是新增了 subagent 工具”）。
  // 正面证据（fork/fresh）和“宿主确认没有该工具”（corroboratedAbsence）都能更新声明；
  // 其余情况（模型/网络故障 → unknown）保留原声明，不让一次跑失败抹掉已有结论。
  const positiveEvidence = record.verdict === 'fork' || record.verdict === 'fresh';
  const declarationWorthy = positiveEvidence || corroboratedAbsence;
  const declaration = declarationWorthy || !spawnDespiteDeclaration
    ? await writeSubagentContextDeclaration({
      rootDir,
      client,
      contextMode: record.verdict,
      ...(positiveEvidence ? { surface: 'host-tool' } : {}),
      ...(corroboratedAbsence ? { surface: 'none' } : {}),
      reason: record.reason,
      evidenceRef: evidencePath,
      measuredAt: record.measuredAt,
    })
    : declarationBefore;

  return {
    ok: true,
    client,
    clientRuntimeId,
    verdict: record.verdict,
    reason: record.reason,
    confidence: record.confidence,
    mode,
    spawned: mode === 'headless',
    host: record.hostStructured
      ? {
        model: record.hostStructured.model || '',
        stopReason: record.hostStructured.stopReason || '',
        errorMessage: record.hostStructured.errorMessage || '',
        retryCount: record.hostStructured.retryCount || 0,
      }
      : null,
    measuredAt: record.measuredAt,
    evidencePath,
    declaration,
  };
}

export function renderSubagentContextProbeText(report) {
  if (!report?.ok) {
    return `aios agents probe: ${report?.error || 'failed'}\n`;
  }
  if (report.dryRun) {
    return [
      `AIOS subagent-context probe (dry-run) client=${report.client} runtime=${report.clientRuntimeId}`,
      `nonce=${report.nonce}`,
      `evidence=${report.evidencePath}`,
      '',
      report.prompt,
    ].join('\n');
  }
  const lines = [
    `AIOS subagent-context probe client=${report.client} runtime=${report.clientRuntimeId}`,
    `verdict=${report.verdict} confidence=${report.confidence} reason=${report.reason || '(none)'}`,
    `evidence=${report.evidencePath}`,
    `declared=${report.declaration?.contextMode} at ${report.declaration?.measuredAt}`,
  ];
  // 中文注释：宿主自己报的事实比分类器的推断更具体（谁失败、为什么失败）。
  // 只在有结构化事实时输出，避免给人“已经测过模型”的错觉。
  if (report.host) {
    const host = report.host;
    lines.push(`host-model=${host.model || '(unknown)'} stop=${host.stopReason || '(unknown)'}`);
    if (host.errorMessage) lines.push(`host-error=${host.errorMessage}`);
    if (host.retryCount) lines.push(`host-retries=${host.retryCount}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderAgentsSmokeText(report) {
  const lines = [
    `AIOS agents smoke ${report.dryRun ? 'dry-run' : 'record'} (${report.policy})`,
    `agents=${report.agents.length} missing=${report.missingRoles.length} status=${report.status || 'planned'}`,
  ];
  for (const agent of report.agents) {
    lines.push(`- ${agent.agentId || agent.role}: ${agent.status}`);
  }
  return `${lines.join('\n')}\n`;
}
