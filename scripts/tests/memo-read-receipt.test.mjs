import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assembleExecutionContext } from '../lib/contextdb/execution-context.mjs';

const BODY = 'CONTROLLED READ BODY FOR RECEIPT PROOF';

async function withRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-read-receipt-'));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function plan() {
  return {
    relativePath: 'plans/read-receipt.md',
    sessionId: 'read-receipt-session',
    title: 'read receipt proof',
    tasks: [{
      id: 'read-task',
      title: 'read task',
      targets: ['docs/context.md'],
      allowedWrites: ['docs/**'],
      contextRequirements: [{ ref: 'docs/context.md', reason: 'required proof context', required: true }],
    }],
  };
}

test('assembly receipt records the controlled read events the assembler performed', async () => {
  await withRoot(async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'), { recursive: true });
    await writeFile(path.join(rootDir, 'docs', 'context.md'), BODY, 'utf8');
    const result = await assembleExecutionContext({
      rootDir,
      plan: plan(),
      taskId: 'read-task',
      persist: false,
    });
    const expectedHash = createHash('sha256').update(BODY, 'utf8').digest('hex');
    assert.ok(Array.isArray(result.receipt.reads), 'receipt must carry a reads array');
    assert.equal(result.receipt.reads.length, 1);
    const [read] = result.receipt.reads;
    assert.equal(read.ref, 'docs/context.md');
    assert.equal(read.sourceHash, expectedHash);
    assert.equal(read.reader, 'orchestrator_assembler');
    assert.ok(typeof read.readAt === 'string' && read.readAt.length > 0);
  });
});

test('caller assertions can never inject read events into the receipt', async () => {
  await withRoot(async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'), { recursive: true });
    await writeFile(path.join(rootDir, 'docs', 'context.md'), BODY, 'utf8');
    const result = await assembleExecutionContext({
      rootDir,
      plan: plan(),
      taskId: 'read-task',
      persist: false,
    });
    // The assembler takes no readRefs input at all: every receipt read must
    // correspond to a packet item the assembler itself inspected.
    const itemRefs = new Set(result.packet.items.map((item) => item.ref));
    for (const read of result.receipt.reads) {
      assert.ok(itemRefs.has(read.ref), `receipt read must match an inspected packet item: ${read.ref}`);
    }
    assert.ok(!result.receipt.reads.some((read) => read.ref === 'attacker:fake-ref'));
    assert.equal(result.receipt.evidenceBoundary.callerAssertionsAccepted, false);
  });
});
