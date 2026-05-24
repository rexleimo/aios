/* 中文注释：artifact 模块只负责构建和写入 dispatch-run JSON 文件。 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { withWorkItemArtifactRef } from '../work-item-telemetry.mjs';
import { ORCHESTRATION_DISPATCH_EVENT_KIND } from './constants.mjs';

export async function writeArtifact(absPath, payload) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function buildDispatchArtifactPayload({ sessionId, persistedAt, report, dispatchRunForArtifact, artifactPath }) {
  return {
    schemaVersion: 1,
    kind: ORCHESTRATION_DISPATCH_EVENT_KIND,
    sessionId,
    persistedAt: persistedAt.toISOString(),
    blueprint: report.blueprint,
    taskTitle: report.taskTitle,
    contextSummary: report.contextSummary,
    workItems: Array.isArray(report.workItems) ? report.workItems.map((item) => ({ ...item })) : [],
    learnEvalOverlay: report.learnEvalOverlay || null,
    executorCapabilityManifest: report.executorCapabilityManifest || null,
    dispatchPlan: report.dispatchPlan || null,
    dispatchRun: dispatchRunForArtifact,
    workItemTelemetry: withWorkItemArtifactRef(report.workItemTelemetry || null, artifactPath),
    dispatchInsights: report.dispatchInsights || null,
  };
}
