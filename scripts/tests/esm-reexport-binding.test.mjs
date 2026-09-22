import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * ESM re-export binding integrity.
 *
 * Why this exists (2026-09-22, audit F1): `export { x } from '...'` only *forwards* a
 * binding — it does NOT introduce `x` into the module's own scope. A module that
 * re-exports a name and then calls it locally throws `ReferenceError: x is not defined`
 * on that path. This happened twice and was fixed twice as one-off patches:
 *
 *   - `scripts/lib/rl-orchestrator-v1/decision-runner/shared.mjs` (`normalizeText`, A8,
 *     v6.0.7) — repaired 10 tests.
 *   - `scripts/lib/rl-core/trainer/core.mjs` (`computeHash`, audit F1, v6.0.12) — latent
 *     because `bandit-state.mjs` seeds `rngState` first, so the branch rarely ran.
 *
 * Repairing instances twice without a guard is what let the class recur, so the rule is
 * enforced here: re-exported names must not be used locally unless they are also bound by
 * an `import` or a local declaration.
 *
 * Comments are stripped before counting uses — the original scan flagged
 * `src/core/index.mjs`, whose only "uses" were names listed in a comment header.
 * Parsing is intentionally shallow (no evaluation, no dependency resolution).
 */

const ROOTS = ['scripts', 'src', 'packages', 'mcp-server/src'];

/**
 * Produce a "code view" of a module: comment bodies removed and string/template
 * *contents* blanked out (delimiters kept). Both matter:
 *   - comments must not count as uses (that was the false positive on src/core/index.mjs);
 *   - a string that merely quotes `export { x } from '...'` must not be mistaken for a real
 *     re-export (that was this guard flagging its own test data).
 */
export function codeView(source) {
  const out = [];
  let state = 'code';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; i += 1; continue; }
      if (ch === '/' && next === '*') { state = 'block'; i += 1; continue; }
      if (ch === "'" || ch === '"' || ch === '`') {
        state = ch === "'" ? 'single' : ch === '"' ? 'double' : 'template';
        out.push(ch);
        continue;
      }
      out.push(ch);
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out.push(ch); }
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; i += 1; continue; }
      if (ch === '\n') out.push(ch);
      continue;
    }
    // Inside a string/template: keep the shape, drop the contents.
    if (ch === '\\') { out.push(' ', ' '); i += 1; continue; }
    const closer = state === 'single' ? "'" : state === 'double' ? '"' : '`';
    if (ch === closer) { state = 'code'; out.push(ch); continue; }
    out.push(ch === '\n' ? '\n' : ' ');
  }
  return out.join('');
}

function moduleFiles() {
  const files = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(mjs|js)$/u.test(entry.name)) files.push(full.split(path.sep).join('/'));
    }
  };
  for (const root of ROOTS) walk(root);
  return files.sort();
}

function namesFromClause(clause) {
  return clause
    .split(',')
    .map((raw) => raw.trim().split(/\s+as\s+/u).pop().trim())
    .filter(Boolean);
}

/** Re-exported names that are used locally without any local binding. */
export function unboundReExports(source) {
  const code = codeView(source);

  const reExported = new Map();
  for (const match of code.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/gu)) {
    for (const name of namesFromClause(match[1])) reExported.set(name, match[0]);
  }
  if (reExported.size === 0) return [];

  const bound = new Set();
  for (const match of code.matchAll(/import\s*(?:[\w*$]+\s*,\s*)?\{([^}]+)\}\s*from/gu)) {
    for (const name of namesFromClause(match[1])) bound.add(name);
  }
  for (const match of code.matchAll(/import\s+([\w$]+)\s+from/gu)) bound.add(match[1]);
  for (const match of code.matchAll(/(?:async\s+)?function\s+([\w$]+)|class\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)/gu)) {
    bound.add(match[1] || match[2] || match[3]);
  }

  const offenders = [];
  for (const [name, statement] of reExported) {
    if (bound.has(name)) continue;
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'gu');
    const total = (code.match(pattern) || []).length;
    const inStatement = (statement.match(pattern) || []).length;
    if (total > inStatement) offenders.push(`${name} (${total - inStatement} local use(s) without a binding)`);
  }
  return offenders;
}

test('no module uses a re-exported name without binding it locally', () => {
  const violations = [];
  for (const file of moduleFiles()) {
    const offenders = unboundReExports(fs.readFileSync(file, 'utf8'));
    if (offenders.length) violations.push(`${file} -> ${offenders.join(', ')}`);
  }
  assert.deepEqual(
    violations,
    [],
    'these modules re-export a name and also use it locally; `export { x } from` does not '
      + `bind x, so the local use throws ReferenceError. Import it too and re-export it: ${violations.join('; ')}`,
  );
});

test('the detector itself separates comments, strings, and real uses', () => {
  // A use only inside a comment must not count (the original scan's false positive).
  assert.deepEqual(
    unboundReExports("// header mentions runCommand\n/* and commandExists */\nexport { runCommand } from './x.mjs';\n"),
    [],
  );
  // Text that merely *quotes* an export statement must not be treated as one.
  assert.deepEqual(
    unboundReExports("const sample = \"export { runCommand } from './x.mjs';\";\n"),
    [],
  );
  // A name used inside a string or an import path must not count as a use.
  assert.deepEqual(
    unboundReExports("export { helper } from './x.mjs';\nconst label = 'helper';\n"),
    [],
  );
  // A real call must count.
  assert.deepEqual(
    unboundReExports("export { helper } from './x.mjs';\nexport function go() { return helper(1); }\n"),
    ['helper (1 local use(s) without a binding)'],
  );
  // A parallel import binds the name, so the same call is fine.
  assert.deepEqual(
    unboundReExports("import { helper } from './x.mjs';\nexport { helper } from './x.mjs';\nfunction go() { return helper(1); }\n"),
    [],
  );
  // A local declaration binds the name.
  assert.deepEqual(
    unboundReExports("export { helper } from './x.mjs';\nfunction helper() {}\nhelper();\n"),
    [],
  );
});
