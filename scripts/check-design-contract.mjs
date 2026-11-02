#!/usr/bin/env node
// Forwards to `node scripts/design.mjs check`.
//
// This file used to hold its own copy of the comparison logic, and that copy
// only knew about MOTION.md. Once the design contract gained its own required
// sections and the CLI learned to check both, keeping a second implementation
// here meant a project could pass `check:design` while `design.mjs check`
// failed, or the reverse. Two answers to one question is how a gate gets
// ignored, so the logic has one owner and this is the entry point CI uses.
//
// Usage:
//   node scripts/check-design-contract.mjs [--root <dir>] [--json] [--only motion|design|both]
// Exit: whatever `design.mjs check` exits with (0 faithful and answered,
// 1 drifted or unanswered, 2 usage error).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, 'design.mjs'), 'check', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
