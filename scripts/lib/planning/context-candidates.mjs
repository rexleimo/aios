import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { readActivePlan, updatePlanTask } from './contract.mjs';
import { normalizeContextRequirement, normalizeTask } from './schema.mjs';

const CANDIDATE_SCHEMA_VERSION = 1;
const CANDIDATE_KIND = 'aios.planning.context-candidate';
const CANDIDATE_DIR = path.join('.aios', 'planning', 'context-candidates');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function safeTaskFileName(taskId) {
  const safe = String(taskId || 'task').trim().replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'task';
  return `${safe}-${sha256(String(taskId || '')).slice(0, 12)}.json`;
}

function normalizeWorkspaceRef(rootDir, rawRef) {
  const value = String(rawRef || '').trim().replace(/\\/gu, '/').replace(/^\.\//u, '');
  if (!value || path.isAbsolute(value) || path.win32.isAbsolute(value)) return '';
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return '';
  return relative.split(path.sep).join('/');
}

function uniqueWorkspaceRefs(rootDir, values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeWorkspaceRef(rootDir, value))
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function workspaceRefFromGraphPath(rootDir, graphPath) {
  const root = path.resolve(rootDir);
  const raw = String(graphPath || '').trim();
  if (!raw) return '';
  const absolute = path.isAbsolute(raw) || path.win32.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(root, raw);
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return '';
  return relative.split(path.sep).join('/');
}

function taskFingerprint(plan, task, proposedTargets) {
  return sha256(stableJson({
    plan: {
      relativePath: String(plan.relativePath || ''),
      sessionId: String(plan.sessionId || ''),
      schemaVersion: Number(plan.schemaVersion || 0),
    },
    task: {
      id: task.id,
      title: task.title,
      targets: task.targets,
      allowedWrites: task.allowedWrites,
      contextRequirements: task.contextRequirements.map((item) => ({
        ref: item.ref,
        reason: item.reason,
        required: item.required,
      })),
      contextCandidateConfirmationId: task.contextCandidateConfirmationId || '',
      updatedAt: task.updatedAt || '',
    },
    proposedTargets,
  }));
}

function addCandidate(candidates, { ref, reason, source, relation = '', score = 0 }) {
  if (!ref) return;
  const current = candidates.get(ref);
  if (current && current.score >= score) return;
  candidates.set(ref, {
    ref,
    reason,
    required: true,
    verification: [],
    source,
    relation,
    score,
  });
}

function candidateOutput(candidates) {
  return [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.ref.localeCompare(right.ref))
    .map(({ score, ...candidate }) => candidate);
}

function candidateOutputWithCodemapReserve(candidates, limit) {
  const ordered = [...candidates.values()]
    .sort((left, right) => right.score - left.score || left.ref.localeCompare(right.ref));
  const selected = new Set();
  for (const relation of ['tests_for', 'callers_of', 'callees_of', 'imports_from']) {
    const candidate = ordered.find((item) => item.source === 'codemap' && item.relation === relation);
    if (candidate && selected.size < limit) selected.add(candidate.ref);
  }
  for (const candidate of ordered) {
    if (selected.size >= limit) break;
    selected.add(candidate.ref);
  }
  return ordered
    .filter((candidate) => selected.has(candidate.ref))
    .map(({ score, ...candidate }) => candidate);
}

function readCodemapCandidates(rootDir, targetRefs, limit) {
  const dbPath = path.join(rootDir, '.code-review-graph', 'graph.db');
  if (!targetRefs.length) return { candidates: [], codemap: { status: 'not_requested', databasePath: '' } };
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const nodes = db.prepare('SELECT qualified_name, file_path, kind, is_test FROM nodes').all()
        .map((node) => ({ ...node, ref: workspaceRefFromGraphPath(rootDir, node.file_path) }));
      const nodeByQualified = new Map(nodes.map((node) => [String(node.qualified_name), node]));
      const targetSet = new Set(targetRefs);
      const targetNames = nodes
        .filter((node) => targetSet.has(node.ref))
        .map((node) => String(node.qualified_name));
      let metadata = {};
      try {
        metadata = Object.fromEntries(db.prepare('SELECT key, value FROM metadata').all()
          .map((row) => [String(row.key), String(row.value)]));
      } catch {
        metadata = {};
      }
      if (!targetNames.length) {
        return {
          candidates: [],
          codemap: {
            status: 'available_no_target_nodes',
            databasePath: '.code-review-graph/graph.db',
            updatedAt: metadata.last_updated || '',
          },
        };
      }
      const placeholders = targetNames.map(() => '?').join(', ');
      const edges = db.prepare(
        `SELECT kind, source_qualified, target_qualified FROM edges
         WHERE source_qualified IN (${placeholders}) OR target_qualified IN (${placeholders})`,
      ).all(...targetNames, ...targetNames);
      const candidates = new Map();
      const targetNamesSet = new Set(targetNames);
      for (const edge of edges) {
        const sourceName = String(edge.source_qualified || '');
        const targetName = String(edge.target_qualified || '');
        const source = nodeByQualified.get(sourceName);
        const target = nodeByQualified.get(targetName);
        const sourceIsTarget = targetNamesSet.has(sourceName);
        const targetIsTarget = targetNamesSet.has(targetName);
        const relation = String(edge.kind || '').toUpperCase();
        if (!source || !target || (!sourceIsTarget && !targetIsTarget)) continue;

        if (relation === 'TESTED_BY') {
          const testNode = source.is_test ? source : target.is_test ? target : targetIsTarget ? source : target;
          addCandidate(candidates, {
            ref: testNode.ref,
            reason: 'Codemap test coverage for declared target',
            source: 'codemap',
            relation: 'tests_for',
            score: 90,
          });
          continue;
        }
        if (relation === 'CALLS' && targetIsTarget) {
          addCandidate(candidates, {
            ref: source.ref,
            reason: 'Codemap caller of declared target',
            source: 'codemap',
            relation: 'callers_of',
            score: 80,
          });
          continue;
        }
        if ((relation === 'CALLS' || relation === 'IMPORTS_FROM') && sourceIsTarget) {
          addCandidate(candidates, {
            ref: target.ref,
            reason: relation === 'IMPORTS_FROM' ? 'Codemap imported dependency of declared target' : 'Codemap callee of declared target',
            source: 'codemap',
            relation: relation === 'IMPORTS_FROM' ? 'imports_from' : 'callees_of',
            score: 70,
          });
        }
      }
      return {
        // Keep every relation until the outer selector can apply its per-relation reserve.
        candidates: candidateOutput(candidates),
        codemap: {
          status: 'available',
          databasePath: '.code-review-graph/graph.db',
          updatedAt: metadata.last_updated || '',
          matchedTargetNodes: targetNames.length,
        },
      };
    } finally {
      db.close();
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { candidates: [], codemap: { status: 'unavailable', reason: 'codemap_not_built', databasePath: '.code-review-graph/graph.db' } };
    }
    return { candidates: [], codemap: { status: 'unavailable', reason: 'codemap_unreadable', databasePath: '.code-review-graph/graph.db' } };
  }
}

function isContainedPath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function existingWorkspaceFiles(rootDir, refs) {
  const present = [];
  const rootPath = path.resolve(rootDir);
  let realRoot = rootPath;
  try {
    realRoot = await fs.realpath(rootPath);
  } catch {
    // The workspace path is already required by the plan writer; retain lexical fallback here.
  }
  for (const ref of refs) {
    try {
      const realPath = await fs.realpath(path.join(rootPath, ref));
      const stat = await fs.stat(realPath);
      if (stat.isFile() && isContainedPath(realRoot, realPath)) present.push(ref);
    } catch {
      // A new target can still be proposed, but cannot be context until it exists.
    }
  }
  return present;
}

async function writeJsonAtomically(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function taskCandidateLockPath(rootDir, taskId) {
  return path.join(rootDir, CANDIDATE_DIR, '.locks', `${safeTaskFileName(taskId)}.lock`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireTaskCandidateLock(lockPath) {
  const handle = await fs.open(lockPath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify({ lockId: randomUUID(), pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, 'utf8');
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(lockPath, { force: true });
    throw error;
  } finally {
    await handle.close().catch(() => {});
  }
}

async function withTaskCandidateLock(rootDir, taskId, operation, { timeoutMs = 45_000, pollMs = 20 } = {}) {
  const lockPath = taskCandidateLockPath(rootDir, taskId);
  const startedAt = Date.now();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      await acquireTaskCandidateLock(lockPath);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`context candidate confirmation lock timed out: ${taskId}`);
      }
      await sleep(pollMs);
    }
  }
  try {
    return await operation();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

function activeTaskFor(plan, taskId) {
  const taskIndex = (Array.isArray(plan?.tasks) ? plan.tasks : [])
    .findIndex((task) => String(task?.id || '') === String(taskId || ''));
  if (taskIndex < 0) throw new Error(`task not found: ${taskId}`);
  return { taskIndex, task: normalizeTask(plan.tasks[taskIndex], taskIndex) };
}

function candidateSelection(rootDir, proposal, refs) {
  const requestedRefs = uniqueWorkspaceRefs(rootDir, refs);
  const candidateByRef = new Map((Array.isArray(proposal.candidates) ? proposal.candidates : [])
    .map((candidate) => [String(candidate?.ref || ''), candidate])
    .filter(([ref]) => ref));
  const selectedRefs = requestedRefs.length ? requestedRefs : [...candidateByRef.keys()];
  if (!selectedRefs.length) throw new Error(`context candidate has no selectable refs: ${proposal.taskId}`);
  const selected = selectedRefs.map((ref) => candidateByRef.get(ref));
  if (selected.some((candidate) => !candidate)) {
    throw new Error('selected context ref is not part of the current candidate');
  }
  return { selectedRefs, selected };
}

function mergedRequirements(task, selected) {
  const requirementsByRef = new Map(task.contextRequirements.map((item) => [item.ref, item]));
  for (const candidate of selected) {
    if (requirementsByRef.has(candidate.ref)) continue;
    const requirement = normalizeContextRequirement({
      ref: candidate.ref,
      reason: candidate.reason,
      required: true,
    });
    if (requirement) requirementsByRef.set(requirement.ref, requirement);
  }
  return [...requirementsByRef.values()];
}

async function ensureSelectedReadable(rootDir, selectedRefs, taskId) {
  const readableRefs = new Set(await existingWorkspaceFiles(rootDir, selectedRefs));
  if (readableRefs.size !== selectedRefs.length) {
    throw new Error(`selected context candidate is no longer readable: ${taskId}`);
  }
}

function pendingConfirmation(proposal, selectedRefs, confirmedBy) {
  const requestedAt = new Date().toISOString();
  return {
    confirmationId: `context-confirmation:${randomUUID()}`,
    requestedAt,
    confirmedBy: String(confirmedBy || 'human-cli').trim() || 'human-cli',
    selectedRefs,
  };
}

async function finalizeConfirmation(rootDir, taskId, proposal, state) {
  const confirmedAt = new Date().toISOString();
  proposal.status = 'confirmed';
  proposal.updatedAt = confirmedAt;
  proposal.confirmation = {
    ...proposal.confirmation,
    confirmedAt,
  };
  await writeJsonAtomically(resolveTaskContextCandidatePath(rootDir, taskId), proposal);
  return { proposal, state };
}

export function resolveTaskContextCandidatePath(rootDir, taskId) {
  return path.join(rootDir, CANDIDATE_DIR, safeTaskFileName(taskId));
}

export async function readTaskContextCandidate(rootDir, taskId) {
  const filePath = resolveTaskContextCandidatePath(rootDir, taskId);
  try {
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (value?.kind !== CANDIDATE_KIND || String(value?.taskId || '') !== String(taskId || '')) return null;
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`unable to read context candidate: ${error?.message || error}`);
  }
}

export async function proposeTaskContextCandidates({
  rootDir,
  taskId,
  targets = [],
  proposedBy = 'unknown',
  maxCandidates = 12,
} = {}) {
  if (!rootDir) throw new Error('proposeTaskContextCandidates requires rootDir');
  return await withTaskCandidateLock(rootDir, taskId, async () => {
    const existing = await readTaskContextCandidate(rootDir, taskId);
    if (existing?.status === 'confirming') {
      throw new Error(`context candidate confirmation is in progress: ${taskId}`);
    }
    const plan = readActivePlan(rootDir);
    if (!plan) throw new Error('no active plan');
    const { task } = activeTaskFor(plan, taskId);
    const proposedTargets = uniqueWorkspaceRefs(rootDir, Array.isArray(targets) && targets.length ? targets : task.targets);
    if (!proposedTargets.length) throw new Error('context candidate proposal requires one or more workspace-relative targets');

    const limit = Math.max(1, Math.min(50, Number.isFinite(Number(maxCandidates)) ? Math.floor(Number(maxCandidates)) : 12));
    const candidates = new Map();
    for (const ref of await existingWorkspaceFiles(rootDir, proposedTargets)) {
      addCandidate(candidates, {
        ref,
        reason: 'Declared task target',
        source: 'target',
        relation: 'target',
        score: 100,
      });
    }
    const codemapResult = readCodemapCandidates(rootDir, proposedTargets, limit);
    const readableCodemapRefs = new Set(await existingWorkspaceFiles(
      rootDir,
      codemapResult.candidates.map((candidate) => candidate.ref),
    ));
    for (const candidate of codemapResult.candidates) {
      if (!readableCodemapRefs.has(candidate.ref)) continue;
      addCandidate(candidates, {
        ...candidate,
        score: candidate.relation === 'tests_for' ? 90 : candidate.relation === 'callers_of' ? 80 : 70,
      });
    }
    const candidateList = candidateOutputWithCodemapReserve(candidates, limit);
    const fingerprint = taskFingerprint(plan, task, proposedTargets);
    const now = new Date().toISOString();
    const proposal = {
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      kind: CANDIDATE_KIND,
      proposalId: `context-candidate:${sha256(stableJson({ fingerprint, candidates: candidateList.map((candidate) => candidate.ref) })).slice(0, 24)}`,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
      proposedBy: String(proposedBy || 'unknown').trim() || 'unknown',
      plan: {
        relativePath: String(plan.relativePath || ''),
        sessionId: String(plan.sessionId || ''),
        taskFingerprint: fingerprint,
      },
      taskId: task.id,
      proposedTargets,
      candidates: candidateList,
      codemap: codemapResult.codemap,
    };
    await writeJsonAtomically(resolveTaskContextCandidatePath(rootDir, task.id), proposal);
    return proposal;
  });
}

export async function confirmTaskContextCandidates({
  rootDir,
  taskId,
  refs = [],
  confirmedBy = 'human-cli',
} = {}) {
  if (!rootDir) throw new Error('confirmTaskContextCandidates requires rootDir');
  return await withTaskCandidateLock(rootDir, taskId, async () => {
    const proposal = await readTaskContextCandidate(rootDir, taskId);
    if (!proposal) throw new Error(`context candidate not found: ${taskId}`);
    const plan = readActivePlan(rootDir);
    if (!plan) throw new Error('no active plan');
    const { task } = activeTaskFor(plan, taskId);

    if (proposal.status === 'confirmed') {
      if (proposal.confirmation?.confirmationId && task.contextCandidateConfirmationId === proposal.confirmation.confirmationId) {
        return { proposal, state: plan };
      }
      throw new Error(`confirmed context candidate does not match active task: ${taskId}`);
    }
    if (!['proposed', 'confirming'].includes(proposal.status)) {
      throw new Error(`context candidate is not pending confirmation: ${taskId}`);
    }

    let selectedRefs;
    let selected;
    if (proposal.status === 'confirming') {
      selectedRefs = Array.isArray(proposal.confirmation?.selectedRefs) ? proposal.confirmation.selectedRefs : [];
      ({ selected } = candidateSelection(rootDir, proposal, selectedRefs));
      if (!proposal.confirmation?.confirmationId) {
        throw new Error(`context candidate confirmation is malformed: ${taskId}`);
      }
      if (task.contextCandidateConfirmationId === proposal.confirmation.confirmationId) {
        return await finalizeConfirmation(rootDir, taskId, proposal, plan);
      }
      if (proposal.plan?.taskFingerprint !== taskFingerprint(plan, task, proposal.proposedTargets)) {
        throw new Error(`stale context candidate for task: ${taskId}`);
      }
      try {
        await ensureSelectedReadable(rootDir, selectedRefs, taskId);
      } catch (error) {
        proposal.status = 'proposed';
        proposal.updatedAt = new Date().toISOString();
        delete proposal.confirmation;
        await writeJsonAtomically(resolveTaskContextCandidatePath(rootDir, taskId), proposal);
        throw error;
      }
    } else {
      if (proposal.plan?.taskFingerprint !== taskFingerprint(plan, task, proposal.proposedTargets)) {
        throw new Error(`stale context candidate for task: ${taskId}`);
      }
      ({ selectedRefs, selected } = candidateSelection(rootDir, proposal, refs));
      await ensureSelectedReadable(rootDir, selectedRefs, taskId);
      proposal.status = 'confirming';
      proposal.updatedAt = new Date().toISOString();
      proposal.confirmation = pendingConfirmation(proposal, selectedRefs, confirmedBy);
      await writeJsonAtomically(resolveTaskContextCandidatePath(rootDir, taskId), proposal);
    }

    const state = updatePlanTask(rootDir, task.id, {
      targets: proposal.proposedTargets,
      contextRequirements: mergedRequirements(task, selected),
      contextCandidateConfirmationId: proposal.confirmation.confirmationId,
    });
    return await finalizeConfirmation(rootDir, taskId, proposal, state);
  });
}
