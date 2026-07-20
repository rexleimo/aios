import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { advanceLongRunningDelivery } from '../../../rex-harness/src/index.mjs';

const DELIVERY_DIR = path.join('.aios', 'workflow-activations', 'long-running-deliveries');
const RECORD_KIND = 'aios.rex-long-running-delivery.v1';
const REX_LEDGER_KIND = 'rex.long-running-delivery.v1';

function normalizeDeliveryId(deliveryId) {
  const value = String(deliveryId || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/u.test(value)) {
    throw new Error(`invalid long-running delivery id: ${value || '(empty)'}`);
  }
  return value;
}

function deliveryPath(rootDir, deliveryId) {
  if (!rootDir) throw new Error('long-running delivery store requires rootDir');
  return path.join(rootDir, DELIVERY_DIR, `${normalizeDeliveryId(deliveryId)}.json`);
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('long-running delivery store requires a Rex result');
  }
  if (result.ledger?.kind !== REX_LEDGER_KIND) {
    throw new Error('long-running delivery store requires a Rex long-running ledger');
  }
  if (!result.decision || typeof result.decision !== 'object' || Array.isArray(result.decision)) {
    throw new Error('long-running delivery store requires a Rex decision');
  }
  return Object.freeze({ ledger: result.ledger, decision: result.decision });
}

function atomicWrite(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function recordFromResult(deliveryId, result) {
  const normalized = normalizeResult(result);
  return Object.freeze({
    schemaVersion: 1,
    kind: RECORD_KIND,
    deliveryId: normalizeDeliveryId(deliveryId),
    ledger: normalized.ledger,
    decision: normalized.decision,
  });
}

function parseRecord(target) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`invalid long-running delivery record: ${target}: ${error.message}`, { cause: error });
  }
  if (record?.kind !== RECORD_KIND || record.schemaVersion !== 1) {
    throw new Error(`invalid long-running delivery record: ${target}`);
  }
  return recordFromResult(record.deliveryId, record);
}

/**
 * Persist Rex output as an opaque envelope. AIOS verifies only the envelope
 * and Rex type tags; all feature and terminal semantics remain in Rex.
 */
export function persistAiosLongRunningDelivery({ rootDir, deliveryId, result } = {}) {
  const record = recordFromResult(deliveryId, result);
  atomicWrite(deliveryPath(rootDir, record.deliveryId), record);
  return Object.freeze({ ledger: record.ledger, decision: record.decision });
}

export function readAiosLongRunningDelivery({ rootDir, deliveryId } = {}) {
  const normalizedDeliveryId = normalizeDeliveryId(deliveryId);
  const target = deliveryPath(rootDir, normalizedDeliveryId);
  if (!fs.existsSync(target)) return null;
  const record = parseRecord(target);
  if (record.deliveryId !== normalizedDeliveryId) {
    throw new Error(`long-running delivery record does not match requested id: ${target}`);
  }
  return Object.freeze({ ledger: record.ledger, decision: record.decision });
}

/**
 * The host gets one Rex-issued decision per call and can only return evidence
 * for Rex to evaluate. It never selects, retries, or completes a feature.
 */
export async function runAiosLongRunningDeliveryIteration({
  rootDir,
  deliveryId,
  resolveReceipt,
  runIteration,
} = {}) {
  if (typeof runIteration !== 'function') {
    throw new TypeError('long-running delivery iteration requires runIteration');
  }
  const current = readAiosLongRunningDelivery({ rootDir, deliveryId });
  if (!current) throw new Error(`long-running delivery not found: ${normalizeDeliveryId(deliveryId)}`);
  const evidence = await runIteration(Object.freeze({
    deliveryId: normalizeDeliveryId(deliveryId),
    decision: current.decision,
  }));
  const advanced = advanceLongRunningDelivery(current.ledger, evidence, { resolveReceipt });
  persistAiosLongRunningDelivery({ rootDir, deliveryId, result: advanced });
  return advanced;
}
