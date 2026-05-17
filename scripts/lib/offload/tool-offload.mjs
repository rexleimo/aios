import { nextNodeId } from './node-id.mjs';
import { writeRef, refFilePath, OFFLOAD_STORAGES } from './refs-store.mjs';
import { addNode, appendNodeJsonl, loadCanvas } from './mermaid-canvas.mjs';

const DEFAULT_MIN_BYTES = 2048;
const DEFAULT_MAX_REFS = 1000;
const DEFAULT_TOOLS = ['Bash', 'Read', 'Edit', 'Write'];

// ── resolve storage ──

export function resolveStorage(options, env, config) {
  if (options?.storage && OFFLOAD_STORAGES.includes(options.storage)) return options.storage;
  if (env?.AIOS_OFFLOAD_STORAGE && OFFLOAD_STORAGES.includes(env.AIOS_OFFLOAD_STORAGE)) return env.AIOS_OFFLOAD_STORAGE;
  if (config?.offload?.storage && OFFLOAD_STORAGES.includes(config.offload.storage)) return config.offload.storage;
  return 'file';
}

// ── resolve config ──

export function resolveConfig(config) {
  const offload = config?.offload ?? {};
  return {
    enabled: offload.enabled !== false,
    minBytes: offload.minBytes ?? DEFAULT_MIN_BYTES,
    maxRefs: offload.maxRefsPerSession ?? DEFAULT_MAX_REFS,
    keepDays: offload.keepDays ?? 30,
    tools: offload.tools ?? DEFAULT_TOOLS,
  };
}

// ── threshold check ──

export function shouldOffload(toolName, outputSize, config) {
  if (!config.enabled) return false;
  if (!config.tools.some(t => toolName === t || toolName.startsWith(t))) return false;
  if (outputSize < config.minBytes) return false;
  return true;
}

// ── capture (main entry, called by PostToolUse hook) ──

export async function capture({ client, session, tool, input, output, exitCode, durationMs }, { workspaceRoot, storage, config }) {
  const resolvedConfig = resolveConfig(config);
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? null);
  const outputSize = Buffer.byteLength(outputStr, 'utf8');

  if (!shouldOffload(tool, outputSize, resolvedConfig)) {
    return null;
  }

  const sessionId = session || 'default';
  const canvas = await loadCanvas(workspaceRoot, sessionId, storage);
  const seq = canvas.nodes.length + 1;
  const nodeId = nextNodeId({ seq, toolName: tool, toolInput: input });

  const inputSummary = truncateSummary(formatSummaryInput(input), 120);

  const refData = {
    node_id: nodeId,
    session: sessionId,
    ts: new Date().toISOString(),
    tool,
    input_summary: inputSummary,
    exit: exitCode ?? 0,
    duration_ms: durationMs ?? null,
    size_bytes: outputSize,
    output: outputStr,
    class: exitCode === 0 ? 'ok' : (exitCode == null ? 'ok' : 'fail'),
  };

  await writeRef(workspaceRoot, sessionId, nodeId, refData, storage);

  const canvasNode = {
    id: nodeId,
    tool,
    label: inputSummary,
    status: refData.class,
    ts: refData.ts,
    ref: refFilePath(workspaceRoot, sessionId, nodeId, storage),
  };

  await addNode(workspaceRoot, sessionId, canvasNode, storage);

  if (storage === 'split') {
    await appendNodeJsonl(workspaceRoot, sessionId, canvasNode);
  }

  return { node_id: nodeId, size_bytes: outputSize, class: refData.class };
}

// ── payload normalization ──

export function normalizeCapturePayload(record, { client = '', sessionId = '' } = {}) {
  if (!record || typeof record !== 'object') return null;

  const tool = firstString(
    record.toolName,
    record.tool_name,
    record.tool?.name,
    record.tool_call?.name,
    record.item?.name,
    record.payload?.tool_name,
    record.name,
    record.tool,
  );
  const output = extractOutput(record);
  if (!tool || output == null) return null;

  const input = firstPresent(
    record.input,
    record.tool_input,
    record.args,
    record.arguments,
    record.command,
    record.cmd,
    record.request,
    record.tool_call?.arguments,
    record.item?.input,
    '',
  );
  const normalizedClient = firstString(client, record.client, record.agent, record.provider, '');
  const normalizedSession = firstString(
    sessionId,
    record.session,
    record.sessionId,
    record.session_id,
    record.conversation_id,
    record.thread_id,
    'default',
  );

  return {
    client: normalizedClient,
    session: normalizedSession,
    tool,
    input,
    output,
    exitCode: normalizeExitCode(firstPresent(record.exitCode, record.exit_code, record.exit, record.status, record.error_code)),
    durationMs: normalizeDuration(firstPresent(record.durationMs, record.duration_ms, record.elapsedMs, record.elapsed_ms, record.duration)),
  };
}

// ── helpers ──

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function extractOutput(record) {
  const direct = firstPresent(
    record.output,
    record.tool_response,
    record.response,
    record.result,
    record.text,
    record.message,
    record.item?.output,
    record.payload?.output,
  );
  if (direct !== undefined && direct !== null) return direct;

  if (record.stdout !== undefined || record.stderr !== undefined) {
    return [record.stdout, record.stderr]
      .filter(value => value !== undefined && value !== null && String(value).length > 0)
      .join('\n');
  }

  return undefined;
}

function normalizeExitCode(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim().toLowerCase();
  if (!text) return 0;
  if (['ok', 'success', 'succeeded', 'pass', 'passed', 'completed', 'complete'].includes(text)) return 0;
  if (['fail', 'failed', 'failure', 'error', 'errored', 'timeout', 'timedout'].includes(text)) return 1;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDuration(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatSummaryInput(input) {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input ?? '');
  } catch {
    return String(input ?? '');
  }
}

function truncateSummary(text, maxLen) {
  const oneLine = text.replace(/\n/g, ' ').trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen - 1) + '…' : oneLine;
}

// ── CLI stdin handler ──

export async function captureFromStdin(workspaceRoot, storage, config) {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.stderr.write('[offload] invalid JSON on stdin\n');
    return;
  }

  const payload = normalizeCapturePayload(data, {
    client: process.env.AIOS_OFFLOAD_CLIENT || '',
    sessionId: process.env.AIOS_OFFLOAD_SESSION || '',
  });
  if (!payload) return;

  const result = await capture(payload, { workspaceRoot, storage, config });
  if (result) {
    process.stdout.write(`[offloaded -> ${result.node_id}]\n`);
  }
}
