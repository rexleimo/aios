import { promises as fs } from 'node:fs';

import { normalizeHandoffPayload } from '../handoff.mjs';
import { hasCostTelemetry } from './telemetry.mjs';
import { normalizeText } from './text.mjs';

export async function readSubagentOutputText({ structuredOutput = null, rawCommandOutput = '' } = {}) {
  let outputText = rawCommandOutput;
  if (structuredOutput?.lastMessagePath) {
    try {
      const lastMessage = await fs.readFile(structuredOutput.lastMessagePath, 'utf8');
      if (String(lastMessage || '').trim()) {
        outputText = String(lastMessage || '').trim();
      }
    } catch {
      // last-message 不存在时继续回退到 stdout/stderr。
    }
  }
  return outputText;
}

export function normalizePhaseHandoffPayload({ rawJson, plan, job, phase }) {
  const normalizedPayload = normalizeHandoffPayload(rawJson);
  normalizedPayload.fromRole = normalizeText(job.role) || normalizedPayload.fromRole;
  normalizedPayload.toRole = normalizeText(job.launchSpec?.handoffTarget) || normalizedPayload.toRole;
  normalizedPayload.taskTitle = normalizeText(plan.taskTitle) || normalizedPayload.taskTitle;
  if (!normalizedPayload.contextSummary) {
    normalizedPayload.contextSummary = normalizeText(plan.contextSummary) || normalizeText(phase?.responsibility) || 'context missing';
  }
  return normalizedPayload;
}

export function resolvePhaseJobStatus(payloadStatus = '') {
  return payloadStatus === 'blocked' || payloadStatus === 'needs-input'
    ? 'blocked'
    : 'completed';
}

export function buildCompletedPhaseJobRun({
  job,
  dependencyRuns,
  executorLabel,
  elapsedMs,
  costTelemetry,
  modelRouting,
  executionClientId,
  clientId,
  result,
  payload,
  outputText,
}) {
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    role: job.role,
    executor: normalizeText(job?.launchSpec?.executor) || 'unknown',
    executorLabel,
    dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
    status: resolvePhaseJobStatus(payload.status),
    elapsedMs,
    ...(hasCostTelemetry(costTelemetry) ? { cost: costTelemetry } : {}),
    ...(modelRouting ? { modelRouting } : {}),
    ...(executionClientId && executionClientId !== clientId ? { routedClientId: executionClientId } : {}),
    ...(Number.isFinite(result.attempts) && result.attempts > 0 ? { attempts: Math.floor(result.attempts) } : {}),
    inputSummary: {
      dependencyCount: dependencyRuns.length,
      inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
    },
    output: {
      outputType: job.launchSpec?.outputType || 'handoff',
      payload,
      rawOutput: outputText.slice(0, 8000),
    },
  };
}
