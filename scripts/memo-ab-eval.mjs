#!/usr/bin/env node
// Runs the bi-temporal recall ablation and prints the comparison table.
// Each arm gets its own throwaway workspace so the corpora cannot leak.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ARMS, formatReport, runArm } from './lib/memo/eval/recall-ab.mjs';

async function main() {
  const asJson = process.argv.includes('--json');
  const results = [];

  for (const arm of ARMS) {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), `memo-ab-${arm}-`));
    try {
      results.push(await runArm(workspaceRoot, arm));
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }

  console.log(asJson ? JSON.stringify(results, null, 2) : formatReport(results));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
