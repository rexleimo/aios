#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCompatibilityExport } from './lib/agents/compat-export.mjs';
import { loadCanonicalAgents } from './lib/agents/source-tree.mjs';
import { writeFileAtomic } from './lib/fs/atomic-write.mjs';
import { syncGeneratedAgents } from './lib/harness/orchestrator-agents.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportPath = path.join(rootDir, 'scripts', 'lib', 'specs', 'orchestrator-agents.json');

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  const source = await loadCanonicalAgents({ rootDir });
  const exportText = renderCompatibilityExport(source);
  await writeFileAtomic(exportPath, exportText);

  const exportOnly = hasFlag('--export-only');
  const result = exportOnly
    ? { ok: true, targets: [], results: [] }
    : await syncGeneratedAgents({ rootDir, io: console });

  const totals = result.results.reduce((acc, item) => ({
    installed: acc.installed + item.installed,
    updated: acc.updated + item.updated,
    skipped: acc.skipped + item.skipped,
    removed: acc.removed + item.removed,
  }), { installed: 0, updated: 0, skipped: 0, removed: 0 });

  console.log('[agents] sync complete');
  console.log(JSON.stringify({ ok: result.ok, targets: result.targets, totals, results: result.results }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
