import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';

import { resolveContextDbRoot } from '../aios/state-root.mjs';
import { atomicWriteText, sha256Hex } from '../memo/storage/fs-io.mjs';
import { normalizeTask } from '../planning/schema.mjs';

export const EXECUTION_CONTEXT_SCHEMA_VERSION = 1;
export const EXECUTION_CONTEXT_MODES = Object.freeze(['off', 'observe']);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function digest(value) {
  return sha256Hex(stableJson(value));
}

function normalizeRef(value) {
  const raw = typeof value === 'string' ? value : value?.ref || value?.path || '';
  return String(raw || '').trim().replace(/\\/gu, '/').replace(/^\.\//u, '');
}

function comparisonRef(value) {
  const normalized = normalizeRef(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveLocalRef(rootDir, rawRef) {
  const inputRef = normalizeRef(rawRef);
  if (!inputRef) return { ref: '', valid: false, absolutePath: '' };
  const root = path.resolve(rootDir);
  const absolutePath = path.isAbsolute(inputRef)
    ? path.resolve(inputRef)
    : path.resolve(root, inputRef);
  const relative = path.relative(root, absolutePath);
  const valid = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  return {
    ref: valid ? normalizeRef(relative) : inputRef,
    valid,
    absolutePath: valid ? absolutePath : '',
  };
}

function isContainedPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolvePhysicalLocalRef(rootDir, rawRef) {
  const lexical = resolveLocalRef(rootDir, rawRef);
  if (!lexical.valid) return lexical;
  try {
    // Resolve existing targets before reading so workspace-local links cannot escape the root.
    const [realRoot, realTarget] = await Promise.all([
      realpath(path.resolve(rootDir)),
      realpath(lexical.absolutePath),
    ]);
    if (!isContainedPath(realRoot, realTarget)) {
      return { ref: lexical.ref, valid: false, absolutePath: '' };
    }
    return { ...lexical, absolutePath: realTarget };
  } catch (error) {
    if (error?.code === 'ENOENT') return lexical;
    return { ref: lexical.ref, valid: false, absolutePath: '' };
  }
}

function normalizeWorkspaceRef(rootDir, rawRef) {
  const resolved = resolveLocalRef(rootDir, rawRef);
  return resolved.valid ? resolved.ref : normalizeRef(rawRef);
}

async function inspectSource(rootDir, rawRef) {
  const resolved = await resolvePhysicalLocalRef(rootDir, rawRef);
  if (!resolved.valid) {
    return { ref: resolved.ref, exists: false, sourceHash: '', sizeBytes: 0, sourceReason: 'invalid_ref' };
  }
  try {
    const content = await readFile(resolved.absolutePath);
    return {
      ref: resolved.ref,
      exists: true,
      sourceHash: sha256Hex(content),
      sizeBytes: content.byteLength,
      sourceReason: '',
    };
  } catch (error) {
    return {
      ref: resolved.ref,
      exists: false,
      sourceHash: '',
      sizeBytes: 0,
      sourceReason: error?.code === 'ENOENT' ? 'missing_source' : 'unreadable_source',
    };
  }
}

function safeSegment(value, fallback) {
  const safe = String(value || '').trim().replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return safe || fallback;
}

function planKey(plan = {}) {
  const identity = {
    relativePath: String(plan.relativePath || ''),
    sessionId: String(plan.sessionId || ''),
    title: String(plan.title || ''),
  };
  return `${safeSegment(plan.sessionId || 'plan', 'plan')}-${digest(identity).slice(0, 12)}`;
}

export function resolveExecutionContextPaths({ rootDir, plan = {}, taskId = '', env = process.env } = {}) {
  if (!rootDir) throw new Error('resolveExecutionContextPaths requires rootDir');
  const relativeDir = path.join('execution-context', planKey(plan), safeSegment(taskId, 'task'));
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env });
  return {
    contextDbRoot,
    relativeDir: relativeDir.split(path.sep).join('/'),
    packetPath: path.join(contextDbRoot, relativeDir, 'packet.json'),
    receiptPath: path.join(contextDbRoot, relativeDir, 'receipt.json'),
    packetRef: `contextdb:${path.join(relativeDir, 'packet.json').split(path.sep).join('/')}`,
    receiptRef: `contextdb:${path.join(relativeDir, 'receipt.json').split(path.sep).join('/')}`,
  };
}

function normalizeMode(mode) {
  const normalized = String(mode || 'observe').trim().toLowerCase();
  if (!EXECUTION_CONTEXT_MODES.includes(normalized)) {
    throw new Error(`execution context mode must be one of: ${EXECUTION_CONTEXT_MODES.join(', ')}`);
  }
  return normalized;
}

function timestamp(now) {
  const value = now instanceof Date ? now : new Date(now || Date.now());
  if (Number.isNaN(value.getTime())) throw new Error('execution context now must be a valid date');
  return value.toISOString();
}

export async function buildExecutionContextPacket({
  rootDir,
  plan,
  taskId,
  readRefs = [],
  readEvidenceSource = 'caller_assertion',
  mode = 'observe',
  persist = true,
  now = new Date(),
  env = process.env,
} = {}) {
  if (!rootDir) throw new Error('buildExecutionContextPacket requires rootDir');
  if (!plan || typeof plan !== 'object') throw new Error('buildExecutionContextPacket requires plan');
  const resolvedMode = normalizeMode(mode);
  if (resolvedMode === 'off') {
    return { mode: 'off', packet: null, receipt: null, persisted: false, paths: null };
  }

  const rawTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const taskIndex = rawTasks.findIndex((task) => String(task?.id || '') === String(taskId || ''));
  if (taskIndex < 0) throw new Error(`execution context task not found: ${taskId}`);
  const task = normalizeTask(rawTasks[taskIndex], taskIndex);
  // Compatibility inputs are intentionally ignored: only the assembler observes delivery.
  void readRefs;
  void readEvidenceSource;
  const inspected = await Promise.all(task.contextRequirements.map(async (requirement) => ({
    ...requirement,
    ...await inspectSource(rootDir, requirement.ref),
  })));
  const generatedAt = timestamp(now);
  const sourceManifest = inspected.map((item) => ({
    ref: item.ref,
    sourceHash: item.sourceHash,
    exists: item.exists,
  }));
  const contextRevision = task.contextRevision
    || String(plan.contextRevision || '').trim()
    || digest({
      plan: plan.relativePath || plan.title || '',
      taskId: task.id,
      targets: task.targets,
      allowedWrites: task.allowedWrites,
      requirements: inspected.map((item) => ({
        ref: item.ref,
        reason: item.reason,
        required: item.required,
        sourceHash: item.sourceHash,
      })),
      verification: task.verification,
    });
  const paths = resolveExecutionContextPaths({ rootDir, plan, taskId: task.id, env });
  const packet = {
    schemaVersion: EXECUTION_CONTEXT_SCHEMA_VERSION,
    kind: 'contextdb.execution-context-packet',
    mode: resolvedMode,
    generatedAt,
    contextRevision,
    plan: {
      schemaVersion: Number(plan.schemaVersion || 0),
      relativePath: String(plan.relativePath || ''),
      sessionId: String(plan.sessionId || ''),
    },
    task: {
      id: task.id,
      title: task.title,
      targets: task.targets,
      allowedWrites: task.allowedWrites,
      interfaces: task.interfaces,
      verification: task.verification,
    },
    items: inspected.map((item) => ({
      ref: item.ref,
      reason: item.reason,
      required: item.required,
      verification: item.verification,
      exists: item.exists,
      sourceHash: item.sourceHash,
      sizeBytes: item.sizeBytes,
      ...(item.expectedHash ? { expectedHash: item.expectedHash } : {}),
    })),
    storage: { relativeDir: paths.relativeDir },
    sourceManifestHash: digest(sourceManifest),
  };

  const decisions = inspected.map((item) => {
    if (!item.exists) {
      return {
        ref: item.ref,
        required: item.required,
        read: false,
        category: 'excluded',
        representation: 'none',
        reason: item.sourceReason,
      };
    }
    return {
      ref: item.ref,
      required: item.required,
      read: false,
      category: 'excluded',
      representation: 'none',
      reason: item.required ? 'required_context_unread' : 'optional_context_unread',
      sourceHash: item.sourceHash,
    };
  });
  const summary = {
    required: inspected.filter((item) => item.required).length,
    read: decisions.filter((item) => item.required && item.read).length,
    unread: decisions.filter((item) => item.required && item.reason === 'required_context_unread').length,
    missing: decisions.filter((item) => item.required && ['missing_source', 'invalid_ref', 'unreadable_source'].includes(item.reason)).length,
  };
  const decisionDigest = digest({
    mode: resolvedMode,
    contextRevision,
    sourceManifestHash: packet.sourceManifestHash,
    decisions,
    summary,
  });
  const receipt = {
    schemaVersion: EXECUTION_CONTEXT_SCHEMA_VERSION,
    kind: 'contextdb.context-receipt',
    receiptId: `context-receipt:${decisionDigest.slice(0, 24)}`,
    mode: resolvedMode,
    generatedAt,
    packetRef: paths.packetRef,
    contextRevision,
    decisionDigest,
    admissionChanged: false,
    summary,
    decisions,
    included: decisions.filter((item) => item.category === 'included'),
    degraded: decisions.filter((item) => item.category === 'degraded'),
    excluded: decisions.filter((item) => item.category === 'excluded'),
    evidenceBoundary: {
      readEvidenceSource: 'none',
      brokerVerified: false,
      callerAssertionsAccepted: false,
    },
  };
  if (persist) {
    await atomicWriteText(paths.packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await atomicWriteText(paths.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  return {
    mode: resolvedMode,
    packet,
    receipt,
    persisted: Boolean(persist),
    paths,
  };
}

function deterministicExcerpt(content, maxChars = 160) {
  const normalized = String(content || '').replace(/\r\n/gu, '\n');
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}\n[excerpt truncated]`;
}

async function readAssemblySource(rootDir, item, expectedHash) {
  const resolved = await resolvePhysicalLocalRef(rootDir, item.ref);
  if (!resolved.valid) {
    return { ref: normalizeRef(item.ref), exists: false, sourceHash: '', sourceReason: 'invalid_ref', content: '', excerpt: '' };
  }
  try {
    const content = await readFile(resolved.absolutePath);
    const sourceHash = sha256Hex(content);
    if (expectedHash && sourceHash !== expectedHash) {
      return {
        ref: resolved.ref,
        exists: false,
        sourceHash,
        sourceReason: 'source_changed_before_delivery',
        content: '',
        excerpt: '',
      };
    }
    const text = content.toString('utf8');
    if (text.includes('\u0000')) {
      return { ref: resolved.ref, exists: false, sourceHash, sourceReason: 'binary_source', content: '', excerpt: '' };
    }
    return {
      ref: resolved.ref,
      exists: true,
      sourceHash,
      sourceReason: '',
      content: text,
      excerpt: deterministicExcerpt(text),
    };
  } catch (error) {
    return {
      ref: resolved.ref,
      exists: false,
      sourceHash: '',
      sourceReason: error?.code === 'ENOENT' ? 'missing_source' : 'unreadable_source',
      content: '',
      excerpt: '',
    };
  }
}

function summarizeAssemblyDecisions(decisions) {
  return {
    required: decisions.filter((item) => item.required).length,
    read: decisions.filter((item) => item.required && item.read).length,
    unread: decisions.filter((item) => item.required && !item.read && item.reason === 'required_context_unread').length,
    missing: decisions.filter((item) => item.required && [
      'missing_source',
      'invalid_ref',
      'unreadable_source',
      'binary_source',
      'source_changed_before_delivery',
    ].includes(item.reason)).length,
  };
}

function renderContextBlock({ ref, sourceHash, content, excerpt }, representation) {
  const header = `[context ref=${ref} representation=${representation} sha256=${sourceHash}]`;
  if (representation === 'full') return `${header}\n${content}`;
  if (representation === 'summary+ref') {
    return `${header}\n[deterministic excerpt]\n${excerpt}\n[full source remains at ${ref}]`;
  }
  if (representation === 'ref-only') return `${header}\n[reference only: ${ref}]`;
  return '';
}

function renderDeliveredContext(decisions, sources) {
  const sourceByRef = new Map(sources.map((source) => [source.ref, source]));
  const blocks = [];
  for (const decision of decisions) {
    if (!decision.read) continue;
    const source = sourceByRef.get(decision.ref);
    if (!source) continue;
    const block = renderContextBlock({
      ref: decision.ref,
      sourceHash: decision.sourceHash || source.sourceHash,
      content: source.content,
      excerpt: source.excerpt,
    }, decision.representation);
    if (block) blocks.push(block);
  }
  return blocks.join('\n\n');
}

/**
 * Build Packet/Receipt from content actually read by the parent orchestrator and
 * return the matching representation for dispatch injection. This is process-local
 * delivery evidence, not an external broker or hostile-agent security boundary.
 */
export async function assembleExecutionContext({
  rootDir,
  plan,
  taskId,
  budgetUnits = 12_000,
  mode = 'observe',
  persist = true,
  now = new Date(),
  env = process.env,
} = {}) {
  const base = await buildExecutionContextPacket({
    rootDir,
    plan,
    taskId,
    readRefs: [],
    mode,
    persist: false,
    now,
    env,
  });
  if (base.mode === 'off') return { ...base, assembly: null };

  const sources = await Promise.all(base.packet.items.map((item) => readAssemblySource(
    rootDir,
    item,
    String(item.sourceHash || '').trim().toLowerCase(),
  )));
  const sourceByRef = new Map(sources.map((source) => [source.ref, source]));
  const projection = await projectContextItems({
    rootDir,
    budgetUnits,
    items: base.packet.items.map((item) => {
      const source = sourceByRef.get(normalizeRef(item.ref));
      return {
        id: item.ref,
        ref: item.ref,
        required: item.required,
        hardConstraint: item.required,
        content: source?.content || '',
        summary: source?.excerpt || '',
        fullText: source ? renderContextBlock({
          ref: item.ref,
          sourceHash: source.sourceHash,
          content: source.content,
          excerpt: source.excerpt,
        }, 'full') : '',
        summaryText: source ? renderContextBlock({
          ref: item.ref,
          sourceHash: source.sourceHash,
          content: source.content,
          excerpt: source.excerpt,
        }, 'summary+ref') : '',
        refText: source ? renderContextBlock({
          ref: item.ref,
          sourceHash: source.sourceHash,
          content: source.content,
          excerpt: source.excerpt,
        }, 'ref-only') : '',
        sourceSnapshot: source || { exists: false, sourceReason: 'missing_source', sourceHash: '' },
      };
    }),
  });
  const projectionByRef = new Map(projection.decisions.map((decision) => [normalizeRef(decision.ref), decision]));
  const decisions = base.packet.items.map((item) => {
    const ref = normalizeRef(item.ref);
    const source = sourceByRef.get(ref);
    const projected = projectionByRef.get(ref);
    if (!source?.exists || !projected) {
      return {
        ref,
        required: item.required === true,
        read: false,
        category: 'excluded',
        representation: 'none',
        reason: source?.sourceReason || 'missing_source',
        ...(source?.sourceHash ? { sourceHash: source.sourceHash } : {}),
        evidenceSource: 'none',
      };
    }
    return {
      ...projected,
      ref,
      required: item.required === true,
      read: true,
      evidenceSource: 'orchestrator_assembler',
    };
  });
  const summary = summarizeAssemblyDecisions(decisions);
  const generatedAt = timestamp(now);
  const contextText = renderDeliveredContext(decisions, sources);
  const assembly = {
    evidenceSource: 'orchestrator_assembler',
    evidenceTrust: 'process_local_delivery_observation',
    brokerVerified: false,
    deliveredAt: generatedAt,
    budget: projection.budget,
    projectionDecisionDigest: projection.decisionDigest,
    deliveryUnits: contextText.length,
    deliveryDigest: sha256Hex(contextText),
  };
  const packet = {
    ...base.packet,
    generatedAt,
    assembly,
  };
  const decisionDigest = digest({
    mode: packet.mode,
    contextRevision: packet.contextRevision,
    sourceManifestHash: packet.sourceManifestHash,
    decisions,
    summary,
    assembly,
  });
  const receipt = {
    ...base.receipt,
    generatedAt,
    receiptId: `context-receipt:${decisionDigest.slice(0, 24)}`,
    decisionDigest,
    summary,
    decisions,
    included: decisions.filter((item) => item.category === 'included'),
    degraded: decisions.filter((item) => item.category === 'degraded'),
    excluded: decisions.filter((item) => item.category === 'excluded'),
    evidenceBoundary: {
      readEvidenceSource: 'orchestrator_assembler',
      brokerVerified: false,
      callerAssertionsAccepted: false,
    },
    assembly,
  };
  if (persist) {
    await atomicWriteText(base.paths.packetPath, `${JSON.stringify(packet, null, 2)}\n`);
    await atomicWriteText(base.paths.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  return {
    mode: base.mode,
    packet,
    receipt,
    persisted: Boolean(persist),
    paths: base.paths,
    assembly: {
      ...assembly,
      projection,
      sources: sources.map(({ content, excerpt, ...source }) => source),
      redactionTexts: sources
        .filter((source) => source.exists)
        .flatMap((source) => [source.content, source.excerpt])
        .filter((value) => String(value || '').length > 0),
      contextText,
    },
  };
}

function globMatches(ref, pattern) {
  const normalizedRef = comparisonRef(ref);
  const normalizedPattern = comparisonRef(pattern);
  if (!normalizedRef || !normalizedPattern) return false;
  let source = '^';
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    if (char === '*' && normalizedPattern[index + 1] === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    }
  }
  return new RegExp(`${source}$`, 'u').test(normalizedRef);
}

export function isExecutionContextMutationDeclared(packet, rawRef, { rootDir = '' } = {}) {
  const ref = comparisonRef(rootDir ? normalizeWorkspaceRef(rootDir, rawRef) : rawRef);
  if (!ref) return false;
  const targets = Array.isArray(packet?.task?.targets) ? packet.task.targets : [];
  const allowedWrites = Array.isArray(packet?.task?.allowedWrites) ? packet.task.allowedWrites : [];
  return targets.some((target) => comparisonRef(target) === ref)
    || allowedWrites.some((pattern) => globMatches(ref, pattern));
}

export async function evaluateExecutionContextPreflight({
  rootDir,
  packet,
  receipt,
  mutationRefs = [],
} = {}) {
  if (!rootDir) throw new Error('evaluateExecutionContextPreflight requires rootDir');
  if (!packet || packet.kind !== 'contextdb.execution-context-packet') {
    throw new Error('evaluateExecutionContextPreflight requires an ExecutionContextPacket');
  }
  if (!receipt || receipt.kind !== 'contextdb.context-receipt') {
    throw new Error('evaluateExecutionContextPreflight requires a ContextReceipt');
  }

  const decisionsByRef = new Map((Array.isArray(receipt.decisions) ? receipt.decisions : [])
    .map((decision) => [normalizeRef(decision.ref), decision]));
  const required = [];
  for (const item of Array.isArray(packet.items) ? packet.items : []) {
    if (item?.required !== true) continue;
    const current = await inspectSource(rootDir, item.ref);
    const readDecision = decisionsByRef.get(normalizeRef(item.ref));
    const expectedHash = String(item.expectedHash || item.sourceHash || '').trim().toLowerCase();
    const reasons = [];
    if (!current.exists) reasons.push('required_context_missing');
    if (readDecision?.read !== true) reasons.push('required_context_unread');
    if (current.exists && expectedHash && current.sourceHash !== expectedHash) {
      reasons.push('required_context_stale');
    }
    required.push({
      ref: normalizeRef(item.ref),
      expectedHash,
      currentHash: current.sourceHash,
      read: readDecision?.read === true,
      reasons,
    });
  }

  const mutations = (Array.isArray(mutationRefs) ? mutationRefs : [])
    .map((ref) => normalizeWorkspaceRef(rootDir, ref))
    .filter(Boolean)
    .map((ref) => ({ ref, declared: isExecutionContextMutationDeclared(packet, ref, { rootDir }) }));
  const wouldBlockReasons = [...new Set([
    ...required.flatMap((item) => item.reasons),
    ...(mutations.some((item) => !item.declared) ? ['undeclared_target'] : []),
  ])];
  const decisionDigest = digest({
    contextRevision: packet.contextRevision,
    receiptDigest: receipt.decisionDigest,
    required,
    mutations,
    wouldBlockReasons,
  });
  return {
    schemaVersion: EXECUTION_CONTEXT_SCHEMA_VERSION,
    kind: 'contextdb.execution-context-preflight',
    mode: 'shadow',
    verdict: wouldBlockReasons.length > 0 ? 'warning' : 'ready',
    wouldBlock: wouldBlockReasons.length > 0,
    wouldBlockReasons,
    admissionChanged: false,
    contextRevision: packet.contextRevision,
    decisionDigest,
    required,
    mutations,
  };
}

function isSafeStorageSegment(value) {
  const normalized = String(value || '').trim();
  return normalized !== '.' && normalized !== '..' && /^[A-Za-z0-9._-]+$/u.test(normalized);
}

function resolveControlledPacketUpdatePath(rootDir, packet, env = process.env) {
  const relativeDir = String(packet?.storage?.relativeDir || '').trim().replace(/\\/gu, '/');
  const segments = relativeDir.split('/');
  if (segments.length !== 3 || segments[0] !== 'execution-context' || !segments.every(isSafeStorageSegment)) {
    throw new Error('persisted expected-hash update requires controlled packet storage metadata');
  }
  const contextDbRoot = path.resolve(resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env }));
  const packetPath = path.resolve(contextDbRoot, ...segments, 'packet.json');
  if (!isContainedPath(contextDbRoot, packetPath)) {
    throw new Error('controlled packet path escapes the ContextDB root');
  }
  return packetPath;
}

export async function updateExecutionContextExpectedHash({
  rootDir,
  packet,
  ref,
  expectedHash = '',
  persist = false,
  now = new Date(),
  env = process.env,
} = {}) {
  if (!rootDir) throw new Error('updateExecutionContextExpectedHash requires rootDir');
  if (!packet || packet.kind !== 'contextdb.execution-context-packet') {
    throw new Error('updateExecutionContextExpectedHash requires an ExecutionContextPacket');
  }
  const normalizedRef = normalizeRef(ref);
  const itemIndex = (Array.isArray(packet.items) ? packet.items : [])
    .findIndex((item) => normalizeRef(item.ref) === normalizedRef);
  if (itemIndex < 0) throw new Error(`context ref not found in packet: ${normalizedRef}`);
  const current = await inspectSource(rootDir, normalizedRef);
  if (!current.exists) throw new Error(`cannot update expected hash for unreadable ref: ${normalizedRef}`);
  const normalizedExpected = String(expectedHash || current.sourceHash).trim().toLowerCase().replace(/^sha256:/u, '');
  if (!/^[a-f0-9]{64}$/u.test(normalizedExpected)) throw new Error('expectedHash must be a SHA-256 hex digest');
  if (normalizedExpected !== current.sourceHash) {
    throw new Error('expectedHash must match the current source hash');
  }

  const updatedAt = timestamp(now);
  const items = packet.items.map((item, index) => index === itemIndex
    ? { ...item, expectedHash: normalizedExpected }
    : { ...item });
  const expectedHashUpdates = [
    ...(Array.isArray(packet.expectedHashUpdates) ? packet.expectedHashUpdates : []),
    { ref: normalizedRef, expectedHash: normalizedExpected, updatedAt },
  ];
  const next = {
    ...packet,
    generatedAt: updatedAt,
    contextRevision: digest({
      previous: packet.contextRevision,
      expectedHashUpdates,
    }),
    items,
    expectedHashUpdates,
  };
  if (persist) {
    await atomicWriteText(resolveControlledPacketUpdatePath(rootDir, packet, env), `${JSON.stringify(next, null, 2)}\n`);
  }
  return next;
}

function itemCost(value) {
  return String(value || '').length;
}

function representationCost(item, renderedKey, fallback) {
  return Object.hasOwn(item, renderedKey) ? itemCost(item[renderedKey]) : itemCost(fallback);
}

export async function projectContextItems({ rootDir, items = [], budgetUnits = 0 } = {}) {
  if (!rootDir) throw new Error('projectContextItems requires rootDir');
  const limit = Math.max(0, Number.isFinite(Number(budgetUnits)) ? Math.floor(Number(budgetUnits)) : 0);
  let used = 0;
  let deliveredCount = 0;
  const decisions = [];
  const pendingCharge = (payloadUnits) => payloadUnits + (deliveredCount > 0 ? 2 : 0);
  const charge = (payloadUnits) => {
    const chargedUnits = pendingCharge(payloadUnits);
    used += chargedUnits;
    deliveredCount += 1;
    return chargedUnits;
  };

  for (let index = 0; index < (Array.isArray(items) ? items : []).length; index += 1) {
    const item = items[index] || {};
    const id = String(item.id || `item-${index + 1}`).trim();
    const ref = normalizeRef(item.ref);
    const source = item.sourceSnapshot || (ref ? await inspectSource(rootDir, ref) : null);
    const recoverable = Boolean(source?.exists && source.sourceHash);
    const fullCost = representationCost(item, 'fullText', item.content);
    const summaryRefCost = representationCost(item, 'summaryText', `${String(item.summary || '')}${ref}`);
    const refCost = representationCost(item, 'refText', ref);
    const hardConstraint = item.hardConstraint === true || item.required === true;
    let decision;

    if (!recoverable) {
      decision = {
        id,
        category: 'excluded',
        representation: 'none',
        reason: ref ? source?.sourceReason || 'dangling_ref' : 'no_recoverable_ref',
        required: item.required === true,
        hardConstraint,
        budgetOverflow: false,
        chargedUnits: 0,
        ...(ref ? { ref } : {}),
      };
    } else if (hardConstraint) {
      const budgetOverflow = used + pendingCharge(fullCost) > limit;
      const chargedUnits = charge(fullCost);
      decision = {
        id,
        category: 'included',
        representation: 'full',
        reason: 'hard_constraint_preserved',
        required: item.required === true,
        hardConstraint: true,
        budgetOverflow,
        chargedUnits,
        ref,
        sourceHash: source.sourceHash,
      };
    } else if (used + pendingCharge(fullCost) <= limit) {
      const chargedUnits = charge(fullCost);
      decision = {
        id,
        category: 'included',
        representation: 'full',
        reason: 'within_budget',
        required: false,
        hardConstraint: false,
        budgetOverflow: false,
        chargedUnits,
        ref,
        sourceHash: source.sourceHash,
      };
    } else if (item.summary && used + pendingCharge(summaryRefCost) <= limit) {
      const chargedUnits = charge(summaryRefCost);
      decision = {
        id,
        category: 'degraded',
        representation: 'summary+ref',
        reason: 'budget_degraded',
        required: false,
        hardConstraint: false,
        budgetOverflow: false,
        chargedUnits,
        ref,
        sourceHash: source.sourceHash,
      };
    } else {
      const budgetOverflow = used + pendingCharge(refCost) > limit;
      const chargedUnits = charge(refCost);
      decision = {
        id,
        category: 'degraded',
        representation: 'ref-only',
        reason: 'budget_degraded',
        required: false,
        hardConstraint: false,
        budgetOverflow,
        chargedUnits,
        ref,
        sourceHash: source.sourceHash,
      };
    }
    decisions.push(decision);
  }

  const decisionDigest = digest({ budgetUnits: limit, decisions });
  return {
    schemaVersion: EXECUTION_CONTEXT_SCHEMA_VERSION,
    kind: 'contextdb.context-receipt-projection',
    budget: {
      limitUnits: limit,
      usedUnits: used,
      overflow: used > limit,
    },
    decisionDigest,
    decisions,
    included: decisions.filter((item) => item.category === 'included'),
    degraded: decisions.filter((item) => item.category === 'degraded'),
    excluded: decisions.filter((item) => item.category === 'excluded'),
  };
}
