import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getActiveMemoStorage } from './config.mjs';
import { withMemoStorageLock } from './lock.mjs';
import { appendText, atomicWriteText, collectRecursiveFiles } from './fs-io.mjs';
import { collectEvents, readJsonlEvents } from './events-read.mjs';
import {
  normalizeMemoStorageName,
  normalizeMemoScope,
  normalizeMemoAgent,
  normalizeSpaceName,
  sanitizeSpace,
  sortEventsAscending,
  toRefs,
} from './normalizers.mjs';
import {
  fileEventsPath,
  splitEventDir,
} from './paths.mjs';
import {
  buildMemoAuthority,
  normalizeClaimStatus,
  normalizeStoredMemoProvenance,
} from './provenance.mjs';
import {
  normalizeIsoTimestamp,
  partitionSupersedes,
  toSupersedeDenials,
  toSupersedes,
} from './temporal.mjs';

async function nextFileSeq(workspaceRoot, { env = process.env } = {}) {
  const { events } = await readJsonlEvents(fileEventsPath(workspaceRoot, { env }), { tolerateMalformed: false });
  const maxSeq = events.reduce((max, event) => Math.max(max, Number.isFinite(event?.seq) ? event.seq : 0), 0);
  return maxSeq + 1;
}

async function nextSplitSeq(workspaceRoot, safeSpace, { env = process.env } = {}) {
  const files = await collectRecursiveFiles(splitEventDir(workspaceRoot, safeSpace, { env }), (filePath) => /^\d+\.json$/u.test(path.basename(filePath)));
  const maxSeq = files.reduce((max, filePath) => {
    const parsed = Number.parseInt(path.basename(filePath, '.json'), 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return maxSeq + 1;
}

function paddedSeq(seq) {
  return String(seq).padStart(12, '0');
}

export function createMemoEvent({ storage, space, text, refs, turn, seq, eventId, ts, legacy, scope, agent, role, validAt, supersedes, supersedeDenied, runtimeIdentity, trustedProvenance, claimStatus, promotionOf }) {
  const normalizedSpace = normalizeSpaceName(space);
  const safeSpace = sanitizeSpace(normalizedSpace);
  const timestamp = ts ? String(ts) : new Date().toISOString();
  const id = eventId || `memo:${safeSpace}:${timestamp.replace(/[-:.TZ]/gu, '')}-${randomUUID().slice(0, 8)}`;
  const normalizedScope = normalizeMemoScope(scope);
  const authority = trustedProvenance
    ? {
        role: String(role || 'user'),
        agent: normalizeMemoAgent(agent),
        provenance: normalizeStoredMemoProvenance(trustedProvenance),
      }
    : buildMemoAuthority({ runtimeIdentity, scope: normalizedScope, agent });
  const normalizedClaimStatus = normalizeClaimStatus(claimStatus || authority.claimStatus, authority.provenance);
  return {
    schemaVersion: 1,
    eventId: id,
    storage,
    space: normalizedSpace,
    spaceKey: safeSpace,
    seq,
    ts: timestamp,
    role: authority.role,
    kind: 'memo',
    text: String(text ?? '').trim(),
    refs: toRefs(refs),
    scope: normalizedScope,
    agent: authority.agent,
    claimStatus: normalizedClaimStatus,
    provenance: authority.provenance,
    ...(promotionOf ? { promotionOf: String(promotionOf).trim() } : {}),
    // `validAt` is when the fact became true, which is not always when it was
    // recorded — backfilled knowledge can predate its own memo entry.
    validAt: normalizeIsoTimestamp(validAt) || normalizeIsoTimestamp(timestamp),
    ...(toSupersedes(supersedes).length > 0 ? { supersedes: toSupersedes(supersedes) } : {}),
    ...(toSupersedeDenials(supersedeDenied).length > 0 ? { supersedeDenied: toSupersedeDenials(supersedeDenied) } : {}),
    ...(turn && typeof turn === 'object' ? { turn } : {}),
    ...(legacy && typeof legacy === 'object' ? { legacy } : {}),
  };
}

async function writeEventToFile(workspaceRoot, event, { env = process.env } = {}) {
  await appendText(fileEventsPath(workspaceRoot, { env }), `${JSON.stringify(event)}\n`);
}

async function writeEventToSplit(workspaceRoot, event, { env = process.env } = {}) {
  const safeSpace = event.spaceKey || sanitizeSpace(event.space);
  const seq = Number.isFinite(event.seq) && event.seq > 0 ? event.seq : await nextSplitSeq(workspaceRoot, safeSpace, { env });
  const filePath = path.join(splitEventDir(workspaceRoot, safeSpace, { env }), `${paddedSeq(seq)}.json`);
  const normalized = { ...event, seq };
  await atomicWriteText(filePath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export async function writeExistingEvents(workspaceRoot, storage, events, { env = process.env } = {}) {
  const normalizedStorage = normalizeMemoStorageName(storage);
  const sorted = sortEventsAscending(events);
  if (normalizedStorage === 'file') {
    for (let index = 0; index < sorted.length; index += 1) {
      const event = createMemoEvent({
        ...sorted[index],
        storage: normalizedStorage,
        seq: index + 1,
        eventId: sorted[index].eventId,
        trustedProvenance: sorted[index].provenance,
      });
      await writeEventToFile(workspaceRoot, event, { env });
    }
    return;
  }

  const nextBySpace = new Map();
  for (const sourceEvent of sorted) {
    const safeSpace = sourceEvent.spaceKey || sanitizeSpace(sourceEvent.space);
    if (!nextBySpace.has(safeSpace)) {
      nextBySpace.set(safeSpace, await nextSplitSeq(workspaceRoot, safeSpace, { env }));
    }
    const seq = nextBySpace.get(safeSpace);
    nextBySpace.set(safeSpace, seq + 1);
    const event = createMemoEvent({
      ...sourceEvent,
      storage: normalizedStorage,
      seq,
      eventId: sourceEvent.eventId,
      trustedProvenance: sourceEvent.provenance,
    });
    await writeEventToSplit(workspaceRoot, event, { env });
  }
}

export async function appendMemoEvent({ workspaceRoot, storage, space = 'default', text, refs = [], turn = undefined, scope = 'project_shared', agent = '', validAt = '', supersedes = [], runtimeIdentity = null, promotionOf = '', lockOptions = {}, env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const content = String(text ?? '').trim();
  if (!content) {
    throw new Error('memo text is required');
  }

  const { timeoutMs, pollMs } = lockOptions && typeof lockOptions === 'object' ? lockOptions : {};
  return await withMemoStorageLock({ workspaceRoot, timeoutMs, pollMs, env }, async () => {
    const safeSpace = sanitizeSpace(space);
    const normalizedScope = normalizeMemoScope(scope);
    const authority = buildMemoAuthority({ runtimeIdentity, scope: normalizedScope, agent });
    const requestedSupersedes = toSupersedes(supersedes);
    let allowedSupersedes = requestedSupersedes;
    let supersedeDenied = [];
    if (requestedSupersedes.length > 0) {
      const { events } = await collectEvents(workspaceRoot, { storage: resolvedStorage, space });
      const partition = partitionSupersedes({
        space,
        spaceKey: safeSpace,
        scope: normalizedScope,
        agent: authority.agent,
        claimStatus: authority.claimStatus,
        promotionOf: String(promotionOf || '').trim(),
        supersedes: requestedSupersedes,
      }, events);
      allowedSupersedes = partition.allowed;
      supersedeDenied = partition.denied;
    }
    const seq = resolvedStorage === 'file'
      ? await nextFileSeq(workspaceRoot, { env })
      : await nextSplitSeq(workspaceRoot, safeSpace, { env });
    const event = createMemoEvent({
      storage: resolvedStorage,
      space,
      text: content,
      refs,
      turn,
      scope,
      agent,
      runtimeIdentity,
      promotionOf,
      validAt,
      supersedes: allowedSupersedes,
      supersedeDenied,
      seq,
    });

    if (resolvedStorage === 'file') {
      await writeEventToFile(workspaceRoot, event, { env });
      return event;
    }
    return await writeEventToSplit(workspaceRoot, event, { env });
  });
}
