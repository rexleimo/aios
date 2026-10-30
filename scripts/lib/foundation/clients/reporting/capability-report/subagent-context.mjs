// scripts/lib/foundation/clients/reporting/capability-report/subagent-context.mjs
//
// Subagent context freshness: measure whether a host's own subagent tool starts
// a fresh context window or forks the parent conversation, record the evidence,
// and keep the declaration honest (`unknown` is a legal verdict).
//
// Honesty boundary (deliberate, not a caveat): AIOS cannot observe the host's
// internals, so a `fork`/`fresh` verdict is *indirect*. It rests on a per-run
// random nonce the parent can see and the child cannot forge by guessing, plus
// a structured answer that must include the child's verbatim report. Every
// record therefore carries `confidence: "indirect"`, and any malformed or
// ambiguous answer degrades to `unknown` instead of a guess.

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SUBAGENT_CONTEXT_VERDICTS = Object.freeze(['fork', 'fresh', 'unknown', 'not-applicable']);
// 中文注释：surface 是声明的事实（该客户端有没有 subagent 工具），不是从 limits 散文里猜的：
// - host-tool: 有宿主自带的 subagent/Task 工具，需要测 fork/fresh
// - none: 上游根本没有该工具，测也没有对象，判 not-applicable 而不是 unknown
// 缺省（未声明）按 host-tool 处理，但没有任何测量时仍是 unknown。
export const SUBAGENT_CONTEXT_SURFACES = Object.freeze(['host-tool', 'none']);
export const SUBAGENT_CONTEXT_EVIDENCE_KIND = 'aios.subagent-context-probe.v1';
export const SUBAGENT_CONTEXT_CONFIG_REL_PATH = 'config/host-capabilities.json';
export const SUBAGENT_CONTEXT_EVIDENCE_DIR = '.aios/agents/subagent-context';
// 证据文件的 answer 只是人工复核用的样本，不是原始输出流（JSON 模式一条流可达 200KB）。
export const ANSWER_STORE_LIMIT = 4000;

export function createProbeNonce({ uuid = randomUUID } = {}) {
  return `AIOS-NONCE-${uuid().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(String(text)).digest('hex')}`;
}

// 纯函数：探针提示词只有一份来源，runner 与测试共用，避免两处措辞漂移。
export function buildSubagentContextProbe({ client = '', nonce = '' } = {}) {
  const normalizedNonce = String(nonce || '').trim();
  if (!normalizedNonce) {
    throw new Error('buildSubagentContextProbe requires a nonce');
  }
  const prompt = [
    `You are the AIOS subagent-context probe for client "${client || 'unknown'}".`,
    '',
    'Do exactly these two steps, then stop.',
    '',
    '1. Spawn exactly one subagent with your default subagent tool and default settings (do not pass any flag that could give it a fresh context or an explicit brief).',
    '2. Send it exactly this text: "Report the exact value of AIOS_SUBAGENT_CONTEXT_NONCE that you can see, and say plainly whether you were told it. Do not search files."',
    '',
    `This conversation contains the line: AIOS_SUBAGENT_CONTEXT_NONCE=${normalizedNonce}`,
    '',
    'Reply with one JSON object and nothing else:',
    '{',
    '  "subagentSpawned": true,',
    '  "subagentTool": "<tool name>",',
    '  "childReport": "<the child response, verbatim>",',
    '  "notes": "<anything that blocked you>"',
    '}',
    '',
    'If you cannot spawn a subagent, reply with {"subagentSpawned": false, "notes": "<why>"}.',
  ].join('\n');
  return { client, nonce: normalizedNonce, prompt };
}

// 纯函数：只判客观字段。模型自述（childSawNonce）不作为判定依据。
export function classifyProbeAnswer({ answer = '', nonce = '' } = {}) {
  const normalizedNonce = String(nonce || '').trim();
  const raw = String(answer || '');
  if (!normalizedNonce) {
    return { verdict: 'unknown', reason: 'missing-nonce', matched: false };
  }
  const contract = findProbeContractObject(raw);
  if (!contract) {
    return { verdict: 'unknown', reason: raw.includes('{') ? 'answer-not-json' : 'answer-not-structured', matched: false };
  }
  const parsed = contract;
  if (parsed?.subagentSpawned !== true) {
    return { verdict: 'unknown', reason: 'no-subagent-spawned', matched: false };
  }
  const childReport = String(parsed?.childReport ?? '');
  const matched = childReport.toUpperCase().includes(normalizedNonce.toUpperCase());
  if (matched) {
    return { verdict: 'fork', reason: 'child-reported-parent-nonce', matched: true };
  }
  if (childReport.trim().length === 0) {
    return { verdict: 'unknown', reason: 'empty-child-report', matched: false };
  }
  return { verdict: 'fresh', reason: 'child-could-not-report-parent-nonce', matched: false };
}

/* 中文注释：从宿主输出了第一个“带契约字段的平衡 JSON 对象”。
 * 不能取 first-{ 到 last-}：codex 会在回答后面附自己的 banner（workdir/model/session
 * 头 + 提示词回显），那个区间不是 JSON，会把真实测量误归为 answer-not-json。
 * 只认契约字段（subagentSpawned）存在的那个对象，因此 banner 里回显的提示词模板不会中选。 */
function findProbeContractObject(raw) {
  for (const candidate of balancedJsonObjects(raw)) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'subagentSpawned')) {
      return parsed;
    }
  }
  return null;
}

function balancedJsonObjects(text) {
  const found = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          found.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return found;
}

export function buildSubagentContextEvidenceRecord({
  client = '',
  clientRuntimeId = '',
  nonce = '',
  answer = '',
  verdict = 'unknown',
  reason = '',
  mode = 'headless',
  exitCode = null,
  clientVersion = null,
  hostStructured = null,
  confidence = 'indirect',
  measuredAt = new Date().toISOString(),
} = {}) {
  const normalizedVerdict = SUBAGENT_CONTEXT_VERDICTS.includes(verdict) ? verdict : 'unknown';
  return {
    schemaVersion: 1,
    kind: SUBAGENT_CONTEXT_EVIDENCE_KIND,
    client,
    clientRuntimeId,
    verdict: normalizedVerdict,
    reason: reason || (normalizedVerdict === 'unknown' ? 'unspecified' : ''),
    confidence: ['direct', 'indirect'].includes(confidence) ? confidence : 'indirect',
    mode,
    measuredAt,
    exitCode,
    clientVersion,
    // 中文注释：宿主自己报的结构化事实（当前只有 pi 的 --mode json 提供）。
    // 只存有限字段，不把整条事件流写进证据文件。
    hostStructured: summarizeHostStructured(hostStructured),
    nonce,
    nonceHash: sha256(nonce),
    answerSha256: sha256(answer),
    answerLength: String(answer || '').length,
    answerTruncated: String(answer || '').length > ANSWER_STORE_LIMIT,
    // 逐字保留，便于人工复核；不含凭据（探针提示词只含随机 nonce）。
    // 上限防止误把整条宿主输出流（含 system prompt）写进证据文件。
    answer: String(answer || '').slice(0, ANSWER_STORE_LIMIT),
  };
}

function summarizeHostStructured(structured) {
  if (!structured || typeof structured !== 'object') return null;
  const toolCalls = Array.isArray(structured.toolCalls) ? structured.toolCalls.map(String) : [];
  return {
    kind: String(structured.kind || ''),
    sessionId: String(structured.sessionId || ''),
    recordCount: Number.isFinite(structured.recordCount) ? structured.recordCount : 0,
    unparsedLineCount: Number.isFinite(structured.unparsedLineCount) ? structured.unparsedLineCount : 0,
    assistantTextLength: String(structured.assistantText || '').length,
    toolCallCount: toolCalls.length,
    toolCalls: toolCalls.slice(0, 20),
    model: String(structured.model || ''),
    stopReason: String(structured.stopReason || ''),
    errorMessage: String(structured.errorMessage || '').slice(0, 300),
    retryCount: Number.isFinite(structured.retryCount) ? structured.retryCount : 0,
    aborted: structured.aborted === true,
    sawSettle: structured.sawSettle === true,
    usage: structured.usage && typeof structured.usage === 'object' ? structured.usage : null,
  };
}

export function evidencePathFor({ rootDir = process.cwd(), client = '', suffix = '' } = {}) {
  return path.join(rootDir, SUBAGENT_CONTEXT_EVIDENCE_DIR, `${client}${suffix}.json`);
}

// 存进跟踪配置的证据引用必须是**相对 rootDir 的 posix 路径**，不是绝对机器路径。两条理由都是
// 事实而不是审美：① `config/host-capabilities.json` 是跟踪文件，绝对路径会把本机目录形状带进
// 公开仓库（实测本仓 HEAD 里从来没出现过绝对路径）；② 换机器或换用户以后，绝对引用直接悬空，
// 声明里写的“证据在盘”就变成假话。证据本体由 evidencePathFor 生成，永远在 rootDir 下；跳出根
// 就是编码错误，当场报错而不静默降级成 null（无证据的声明比报错更难查）。
export function portableEvidenceRef({ rootDir = process.cwd(), ref = '' } = {}) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  const abs = path.resolve(rootDir, raw);
  const rel = path.relative(rootDir, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `subagent context evidence must live under the project root (${rootDir}); got ${raw}`,
    );
  }
  return rel.split(path.sep).join('/');
}

export async function writeSubagentContextEvidence({ rootDir = process.cwd(), record, suffix = '' } = {}) {
  if (!record?.client) {
    throw new Error('writeSubagentContextEvidence requires record.client');
  }
  const target = evidencePathFor({ rootDir, client: record.client, suffix });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return target;
}

export async function readSubagentContextEvidence({ rootDir = process.cwd(), client = '' } = {}) {
  try {
    const text = await fs.readFile(evidencePathFor({ rootDir, client }), 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readConfigPath(rootDir) {
  return path.join(rootDir, SUBAGENT_CONTEXT_CONFIG_REL_PATH);
}

export async function readHostCapabilitiesConfig({ rootDir = process.cwd() } = {}) {
  const text = await fs.readFile(readConfigPath(rootDir), 'utf8');
  return JSON.parse(text);
}

export async function readSubagentContextDeclaration({ rootDir = process.cwd(), client = '' } = {}) {
  const config = await readHostCapabilitiesConfig({ rootDir });
  const entry = config?.clients?.[client];
  if (!entry) {
    return { declared: false, contextMode: 'unknown', reason: 'client-not-declared', measuredAt: null, evidenceRef: null };
  }
  const block = entry.subagents;
  if (!block) {
    return { declared: false, contextMode: 'unknown', reason: 'no-subagent-context-declaration', measuredAt: null, evidenceRef: null, surface: 'unknown' };
  }
  const contextMode = SUBAGENT_CONTEXT_VERDICTS.includes(block.contextMode) ? block.contextMode : 'unknown';
  const surface = SUBAGENT_CONTEXT_SURFACES.includes(block.surface) ? block.surface : 'unknown';
  return {
    declared: true,
    contextMode,
    surface,
    reason: String(block.reason || ''),
    measuredAt: block.measuredAt || null,
    evidenceRef: block.evidenceRef || null,
  };
}

// 只加键，不改名；写回时保持既有键顺序，新增块追加在客户端条目的末尾。
export async function writeSubagentContextDeclaration({
  rootDir = process.cwd(),
  client = '',
  contextMode = 'unknown',
  surface = null,
  reason = '',
  evidenceRef = null,
  measuredAt = new Date().toISOString(),
} = {}) {
  if (!client) throw new Error('writeSubagentContextDeclaration requires client');
  const normalizedMode = SUBAGENT_CONTEXT_VERDICTS.includes(contextMode) ? contextMode : 'unknown';
  const config = await readHostCapabilitiesConfig({ rootDir });
  if (!config?.clients?.[client]) {
    throw new Error(`host-capabilities.json has no client entry: ${client}`);
  }
  const existing = config.clients[client].subagents || {};
  const nextSurface = SUBAGENT_CONTEXT_SURFACES.includes(surface)
    ? surface
    : (SUBAGENT_CONTEXT_SURFACES.includes(existing.surface) ? existing.surface : undefined);
  config.clients[client].subagents = {
    ...(nextSurface ? { surface: nextSurface } : {}),
    contextMode: normalizedMode,
    measuredAt,
    evidenceRef: portableEvidenceRef({ rootDir, ref: evidenceRef }),
    reason: String(reason || ''),
  };
  const target = readConfigPath(rootDir);
  await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config.clients[client].subagents;
}

// 纯函数：判定是否陈旧。客户端版本变化或超过 TTL 都要重测，而不是继续引用旧结论。
export function evaluateDeclarationFreshness({
  declaration = {},
  currentClientVersion = null,
  now = Date.now(),
  ttlDays = 30,
} = {}) {
  if (!declaration?.declared) {
    return { state: 'undeclared', stale: true, reason: declaration?.reason || 'no declaration' };
  }
  if (declaration.contextMode === 'unknown') {
    return { state: 'unknown', stale: true, reason: declaration.reason || 'never measured' };
  }
  if (!declaration.measuredAt) {
    return { state: 'stale', stale: true, reason: 'missing measuredAt' };
  }
  const measured = Date.parse(declaration.measuredAt);
  if (!Number.isFinite(measured)) {
    return { state: 'stale', stale: true, reason: 'unparsable measuredAt' };
  }
  if (now - measured > ttlDays * 24 * 60 * 60 * 1000) {
    return { state: 'stale', stale: true, reason: `measured more than ${ttlDays} days ago` };
  }
  const declaredVersion = String(declaration.clientVersion || '').trim();
  if (declaredVersion && currentClientVersion && declaredVersion !== currentClientVersion) {
    return { state: 'stale', stale: true, reason: `client version changed: ${declaredVersion} → ${currentClientVersion}` };
  }
  return { state: 'current', stale: false, reason: '' };
}
