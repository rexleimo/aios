// The generator's job is to be specific, and its honesty is what makes it
// usable: a project that cannot be measured must say so, and a contract with
// unanswered decisions must be refused. Both directions are asserted here,
// because a generator that always "succeeds" and a checker that always "passes"
// would satisfy a one-sided test while shipping exactly the plausible-looking
// document this work exists to prevent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareRuleSets, extractRuleSections, missingSections, unresolvedPlaceholders, universalPath } from '../../../lib/design-contract/rules.mjs';
import { collectFacts } from '../../../lib/design-contract/facts.mjs';
import { renderContract } from '../../../lib/design-contract/render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CLI = path.join(REPO, 'scripts', 'design.mjs');

/**
 * `execFileSync` only surfaces stderr through a thrown error, so a command that
 * succeeds while printing a warning is invisible to it. The warnings this suite
 * asserts on are exactly that kind, so the helper has to use spawnSync.
 */
function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * A project with one CSS surface and one page.
 *
 * `commit: false` still initialises a repository, so the three states are
 * distinguishable: no git at all, a repository whose files were never added,
 * and a measured project. Collapsing them is how "0 surfaces" gets reported as
 * a fact about a project nobody looked at.
 */
function project({ commit = true, gitInit = true, withAnimation = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-design-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.css'), withAnimation ? '.x{transition:opacity .18s}\n' : '.x{color:red}\n');
  fs.writeFileSync(path.join(root, 'src', 'index.html'), '<div class="x">hi</div>\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { vue: '3.4.0' } }));
  if (gitInit) execFileSync('git', ['init', '-q'], { cwd: root });
  if (commit) {
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: root });
  }
  return root;
}

test('the universal rules contain no project paths, so they can travel', () => {
  const universal = fs.readFileSync(universalPath(REPO), 'utf8');
  // If a project name leaks into the shared half, every adopter silently
  // inherits someone else's scope.
  for (const forbidden of ['docs-site/', 'debug-hub', 'genealogy-gui', 'rex-harness/website']) {
    assert.ok(!universal.includes(forbidden), `shared rules mention ${forbidden}`);
  }
  assert.ok(extractRuleSections(universal).length >= 40, 'the shared set lost rules');
});

test('a generated contract restates every shared rule verbatim', () => {
  const root = project();
  const universal = fs.readFileSync(universalPath(REPO), 'utf8');
  const text = renderContract({ facts: collectFacts({ rootDir: root }), universal });
  const comparison = compareRuleSets({ universal, instance: text });
  assert.equal(comparison.ok, true);
  assert.equal(comparison.instanceCount, comparison.universalCount);
});

test('the generator measures the project instead of describing a generic one', () => {
  const root = project();
  const facts = collectFacts({ rootDir: root });
  assert.deepEqual(facts.surfaces.sort(), ['src/app.css', 'src/index.html']);
  assert.deepEqual(facts.framework.frameworks, ['vue']);
  assert.ok(facts.motion.durations.some((entry) => entry.ms === 180), 'the 180ms transition must be measured');
  // No reduced-motion block in the fixture, so the gap has to be reported.
  assert.ok(facts.motion.withoutReducedMotion.includes('src/app.css'));
});

test('init writes a contract, and check refuses it while decisions are open', () => {
  const root = project();
  const init = run(['init', '--root', root]);
  assert.equal(init.code, 0, init.stderr);
  const written = fs.readFileSync(path.join(root, 'MOTION.md'), 'utf8');
  assert.ok(unresolvedPlaceholders(written).length > 0, 'a fresh contract must leave decisions open');
  assert.deepEqual(missingSections(written), []);

  const checked = run(['check', '--root', root]);
  assert.equal(checked.code, 1, 'open decisions must not pass');
  assert.match(checked.stderr, /unresolved decision/);
});

test('check passes once the decisions are answered', () => {
  const root = project();
  run(['init', '--root', root]);
  const file = path.join(root, 'MOTION.md');
  let text = fs.readFileSync(file, 'utf8');
  // Answer every marker the way a person would: replace it with a decision.
  text = text.replace(/TODO\(decision\)[^\n]*/g, '不适用：本项目只有一张静态页，无动效。');
  fs.writeFileSync(file, text);
  const checked = run(['check', '--root', root]);
  assert.equal(checked.code, 0, checked.stdout + checked.stderr);
});

test('a deleted rule is reported by name, not silently accepted', () => {
  const root = project();
  run(['init', '--root', root]);
  const file = path.join(root, 'MOTION.md');
  const universal = fs.readFileSync(universalPath(REPO), 'utf8');
  const rule = extractRuleSections(universal)[0];
  const text = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== rule.trim()).join('\n');
  fs.writeFileSync(file, text.replace(/TODO\(decision\)[^\n]*/g, 'answered'));

  const checked = run(['check', '--root', root]);
  assert.equal(checked.code, 1);
  assert.match(checked.stderr, /missing 1 shared rule/);
});

test('a local rule that the shared set does not have is reported as a decision', () => {
  const root = project();
  run(['init', '--root', root]);
  const file = path.join(root, 'MOTION.md');
  let text = fs.readFileSync(file, 'utf8').replace(/TODO\(decision\)[^\n]*/g, 'answered');
  // Inject a rule into a section that owns rules.
  text = text.replace('## 循环', '## 循环\n\n- **我们的品牌动画允许 3s**：品牌片例外。');
  fs.writeFileSync(file, text);
  const checked = run(['check', '--root', root]);
  assert.equal(checked.code, 1);
  assert.match(checked.stderr, /local rule\(s\) not in the shared set/);
});

test('init refuses to overwrite a contract that already records decisions', () => {
  const root = project();
  run(['init', '--root', root]);
  const second = run(['init', '--root', root]);
  assert.equal(second.code, 1);
  assert.match(second.stderr, /REFUSED/);
  assert.match(second.stderr, /--force/);
});

test('a repository whose files were never added is reported as unmeasured', () => {
  // The files exist. `git ls-files` cannot see them. Reporting "0 surfaces" as a
  // fact is how a contract ends up claiming a scope nobody inspected.
  const root = project({ commit: false });
  const facts = run(['facts', '--root', root]);
  assert.equal(facts.code, 0);
  assert.match(facts.stdout, /unknown:\s+no tracked files/);

  const init = run(['init', '--root', root]);
  assert.equal(init.code, 0);
  assert.match(init.stderr, /NOT MEASURED/);
  assert.match(init.stderr, /untracked file/);
});

test('a directory outside git says so, instead of reporting an empty project', () => {
  const root = project({ commit: false, gitInit: false });
  const facts = run(['facts', '--root', root]);
  assert.equal(facts.code, 0);
  assert.match(facts.stdout, /git work tree: false/);
  assert.match(facts.stdout, /unknown:\s+tracked file list \(not a git work tree\)/);
});

test('build output and dependencies are excluded, and the exclusion is reported', () => {
  const root = project();
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'bundle.css'), '.y{transition:opacity 3s}\n');
  fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'x', 'lib.css'), '.z{transition:all 9s}\n');
  execFileSync('git', ['add', '-f', 'dist', 'node_modules'], { cwd: root });

  const facts = collectFacts({ rootDir: root });
  assert.ok(!facts.surfaces.some((file) => file.startsWith('dist/')), 'build output must not be a surface');
  assert.ok(!facts.surfaces.some((file) => file.startsWith('node_modules/')), 'dependencies must not be a surface');
  const reasons = facts.excluded.map((entry) => entry.why);
  assert.ok(reasons.includes('build output'));
  assert.ok(reasons.includes('dependencies'));
});

test('json output carries the same facts a human sees', () => {
  const root = project();
  const facts = JSON.parse(run(['facts', '--root', root, '--json']).stdout);
  assert.equal(facts.surfaces.length, 2);
  assert.equal(facts.unknown.length, 0);
  const init = JSON.parse(run(['init', '--root', root, '--json']).stdout);
  assert.ok(init.openDecisions.length > 0);
});

test('a missing target directory is a usage error with a readable message', () => {
  // A raw ENOENT stack does not say which argument was wrong, and a caller
  // reading it cannot tell a typo from a broken installation.
  const result = run(['init', '--root', path.join(os.tmpdir(), 'aios-design-does-not-exist')]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--root does not exist/);
  assert.ok(!/at Object\./.test(result.stderr), 'a stack trace is not a message');
});
