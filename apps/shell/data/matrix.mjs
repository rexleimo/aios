// apps/shell/data/matrix.mjs — 接入矩阵的视图模型装配。
//
// 唯一职责：把两个权威来源合成「客户端 × 能力轴 × 等级 × 证据状态」的矩阵视图模型。
//   - 能力声明：`config/host-capabilities.json`（谁声明了什么、目标等级、行级限制、证据引用）
//   - 证据状态：`aios status --json` 的 `clientCapabilities`（谁有 smoke / metrics / provenance）
//
// 本模块不写死任何客户端名、轴名或数量：轴词表的所有者是
// `scripts/client-capability-scorecard.mjs`，配置的所有者是 `config/host-capabilities.json`。
//
// 实测事实（2026-11-04）：两个来源的客户端集合并不相同——配置声明 13 个，
// status 的 `clientCapabilities` 只覆盖 10 个（`totalClients: 10`）。矩阵必须把这个差异
// 显示出来，因此不覆盖的客户端用 `not-covered` 显式表达，而不是默认成「好」。
//
// 另一个实测事实：**逐轴的原因并不存在**。配置只为客户端提供行级 `limits[]` 与可选的
// `subagents.evidenceRef`，没有「第 3 个轴为什么没声明」这样的字段。所以单元格只表达
// 声明与否，点击后的证据来自行级 `limits` + `evidenceRef` + 证据状态三项，界面不得编造
// 逐轴理由。

import { CAPABILITY_AXES, LEVEL_POINTS } from '../../../scripts/client-capability-scorecard.mjs';

export const MATRIX_SCHEMA_VERSION = 1;

/** 证据标志的展示优先级：越靠前越具体。 */
export const EVIDENCE_FLAG_PRIORITY = Object.freeze([
  'pending-smoke',
  'compatibility-only',
  'evidence-blocked',
]);

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * 一个客户端在 `aios status` 里的证据位置。
 * 不在任何名单里 ⇒ `not-covered`（≠ 好），因为没有采集面就没有证据。
 */
export function evidenceFor(clientId, status = {}) {
  const summary = status?.clientCapabilities ?? {};
  const flags = [];
  if (listOf(summary.pendingSmokeClientIds).includes(clientId)) flags.push('pending-smoke');
  if (listOf(summary.compatibilityClientIds).includes(clientId)) flags.push('compatibility-only');
  if (listOf(summary.evidenceBlockedClientIds).includes(clientId)) flags.push('evidence-blocked');
  if (flags.length === 0) {
    return { clientId, covered: false, flags: [], label: 'not-covered' };
  }
  const label = EVIDENCE_FLAG_PRIORITY.find((flag) => flags.includes(flag)) ?? flags[0];
  return { clientId, covered: true, flags, label };
}

/** 单行：声明了哪些轴、目标等级、行级限制原文、证据位置。 */
export function buildRow(clientId, entry = {}, status = {}) {
  const declared = new Set(listOf(entry.capabilities));
  const axes = CAPABILITY_AXES.map((axis) => ({ axis, declared: declared.has(axis) }));
  return {
    clientId,
    level: typeof entry.targetLevel === 'string' ? entry.targetLevel : null,
    axes,
    declaredCount: axes.filter((cell) => cell.declared).length,
    axisTotal: axes.length,
    // 逐字保留配置里的措辞：界面改述限制等于制造第二份事实。
    limits: listOf(entry.limits),
    evidenceRef: entry?.subagents?.evidenceRef ?? null,
    entrypoint: entry.requiredEntrypoint ?? null,
    directHostBypassAllowed: entry.directHostBypassAllowed ?? null,
    evidence: evidenceFor(clientId, status),
  };
}

/**
 * 矩阵本体。所有计数都是集合运算的结果，没有一个是手写字面量。
 * `sources` 由调用方注入（每条 = 这个数字/文本从哪来），界面负责原样显示。
 */
export function buildMatrix({ capabilities = {}, status = {}, sources = [] } = {}) {
  const clients = capabilities?.clients ?? {};
  const rows = Object.entries(clients).map(([clientId, entry]) => buildRow(clientId, entry, status));
  const declaredIds = rows.map((row) => row.clientId);
  const coveredIds = rows.filter((row) => row.evidence.covered).map((row) => row.clientId);
  const coveredSet = new Set(coveredIds);

  return {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    generatedAt: status?.generatedAt ?? null,
    overallStatus: status?.overallStatus ?? null,
    axes: [...CAPABILITY_AXES],
    levelPoints: { ...LEVEL_POINTS },
    rows,
    // blocker 是 status 的原文，不改写、不合并、不排序。
    blockers: listOf(status?.blockers),
    coverage: {
      declared: declaredIds.length,
      evidenceCovered: coveredSet.size,
      declaredOnly: declaredIds.filter((clientId) => !coveredSet.has(clientId)),
    },
    sources: listOf(sources),
  };
}