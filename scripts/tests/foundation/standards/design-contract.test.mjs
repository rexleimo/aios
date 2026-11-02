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

import { compareRuleSets, extractRuleSections, missingSections, unresolvedPlaceholders, universalPath, REQUIRED_DESIGN_SECTIONS } from '../../../lib/design-contract/rules.mjs';
import { collectFacts } from '../../../lib/design-contract/facts.mjs';
import { listScannedFiles } from '../../../check-motion-contract.mjs';
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
  // Answer every marker the way a person would: replace it with a decision.
  // Both contracts are answered because `init` writes both; answering only the
  // motion one would leave the project half-decided while looking done.
  for (const name of ['MOTION.md', 'DESIGN.md']) {
    const file = path.join(root, name);
    const text = fs.readFileSync(file, 'utf8').replace(/TODO\(decision\)[^\n]*/g, '不适用：本项目只有一张静态页，无动效。');
    fs.writeFileSync(file, text);
  }
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
  // Both contracts are reported by kind, because one combined count cannot tell
  // you which document still has open decisions.
  assert.equal(init.written.length, 2);
  assert.ok(init.written.every((entry) => entry.openDecisions.length > 0));
  assert.ok(init.written.every((entry) => entry.missingSections.length === 0));
});

test('a missing target directory is a usage error with a readable message', () => {
  // A raw ENOENT stack does not say which argument was wrong, and a caller
  // reading it cannot tell a typo from a broken installation.
  const result = run(['init', '--root', path.join(os.tmpdir(), 'aios-design-does-not-exist')]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--root does not exist/);
  assert.ok(!/at Object\./.test(result.stderr), 'a stack trace is not a message');
});

test('the declaration gate and the design facts agree on what a surface is', () => {
  // Two exclusion lists produced two authoritative answers about one repository:
  // docs/reports/ and video/ were excluded by the motion gate and included by
  // the design scanner. This pins them to one owner.
  const facts = collectFacts({ rootDir: REPO });
  const scanned = listScannedFiles({ rootDir: REPO });
  assert.equal(scanned.ok, true);
  const cssHtml = facts.surfaces.filter((file) => /\.(css|html?)$/i.test(file)).sort();
  assert.deepEqual(scanned.files, cssHtml);
});

test('a project exclusion without a reason is rejected, not applied', () => {
  const root = project();
  fs.mkdirSync(path.join(root, 'comics'), { recursive: true });
  fs.writeFileSync(path.join(root, 'comics', 'page.html'), '<div/>');
  fs.mkdirSync(path.join(root, 'config', 'design-contract'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'config', 'design-contract', 'exclusions.json'),
    JSON.stringify({ exclusions: [{ prefix: 'comics/' }] }),
  );
  execFileSync('git', ['add', '-A'], { cwd: root });
  const facts = collectFacts({ rootDir: root });
  // The files stay in scope, and the malformed entry is reported: silently
  // honouring it would hide a decision instead of recording one.
  assert.ok(facts.surfaces.includes('comics/page.html'));
  assert.ok(facts.unknown.some((entry) => entry.includes('exclusion without a reason')));
});

test('init writes both contracts from one measurement, and check refuses open decisions', () => {
  const root = project();
  const init = run(['init', '--root', root]);
  assert.equal(init.code, 0, init.stderr);
  const motion = fs.readFileSync(path.join(root, 'MOTION.md'), 'utf8');
  const design = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');

  // The same scan has to produce both, or the two contracts can disagree about
  // which files are in scope while each looks internally consistent.
  assert.ok(motion.includes('src/app.css'));
  assert.ok(design.includes('src/app.css'));
  assert.match(design, /TODO\(decision\)/);
  // Evidence, not adjectives: the design contract has to carry the number it
  // stands on, which only exists because something was measured.
  assert.match(design, /Evidence Snapshot/);
  assert.match(design, /colours outside tokens: 0|未走 token 的颜色/);

  const blocked = run(['check', '--root', root]);
  assert.equal(blocked.code, 1, 'a contract full of TODO(decision) must not pass');
});

test('check passes only after every decision is answered', () => {
  const root = project();
  assert.equal(run(['init', '--root', root]).code, 0);
  for (const name of ['MOTION.md', 'DESIGN.md']) {
    const file = path.join(root, name);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/TODO\(decision\)[^\n]*/g, '答：本项目只有一页界面。'));
  }
  const result = run(['check', '--root', root]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /DESIGN\.md — faithful and answered/);
});

test('--only design does not write a motion contract', () => {
  const root = project();
  assert.equal(run(['init', '--root', root, '--only', 'design']).code, 0);
  assert.ok(fs.existsSync(path.join(root, 'DESIGN.md')));
  // Writing the other contract "for completeness" would create a file the
  // project never asked for and its own check would then have to judge.
  assert.ok(!fs.existsSync(path.join(root, 'MOTION.md')));
});

test('a design contract missing a design section is reported by name', () => {
  const root = project();
  assert.equal(run(['init', '--root', root, '--only', 'design']).code, 0);
  const file = path.join(root, 'DESIGN.md');
  const text = fs.readFileSync(file, 'utf8').replace('## Accessibility Baseline', '## 可访问性');
  fs.writeFileSync(file, text);
  const result = run(['check', '--root', root, '--only', 'design']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Accessibility Baseline/);
});

test('the design contract names a contradiction instead of stating a rule the tokens disprove', () => {
  const root = project();
  const tokens = [
    ':root {',
    '  --p-text: #111;',
    '  --p-bg: #fff;',
    '  --p-space-1: 4px;',
    '  --p-radius-md: 6px;',
    '  --p-accent: #0066ff;',
    '}',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'src', 'tokens.css'), tokens);
  // The literal goes in a *different* file. Inside the token source it would be
  // skipped by design, and a test that puts it there asserts nothing.
  fs.writeFileSync(path.join(root, 'src', 'page.css'), '.loose { color: #ff0000; }\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  assert.equal(run(['init', '--root', root, '--only', 'design']).code, 0);

  const design = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
  // A token file exists and a colour bypasses it: the contract has to say so,
  // because "we have tokens" and "the page uses them" are different facts.
  assert.match(design, /1 处颜色字面量|绕过它们/);
  assert.ok(!design.includes('--p-accent: var(--p-unknown)'), 'the generator invented a token reference');
});

test('a CSS token block written on one line is still measured', () => {
  const root = project();
  fs.writeFileSync(
    path.join(root, 'src', 'tokens.css'),
    ':root{--q-bg:#fff;--q-text:#111;--q-space-1:4px;--q-space-2:8px;--q-radius-md:6px}\n',
  );
  execFileSync('git', ['add', '-A'], { cwd: root });
  assert.equal(run(['init', '--root', root, '--only', 'design']).code, 0);
  const design = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
  // Line-anchored parsing reported such a project as having no tokens at all,
  // which is a measurement bug that reads as a finding about the project.
  assert.match(design, /`src\/tokens\.css`/);
  assert.match(design, /\| 5 \|/);
});

test('check refuses a missing --root with a usage error, not a stack trace', () => {
  const result = run(['check', '--root', path.join(os.tmpdir(), 'aios-design-absent-xyz')]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--root does not exist/);
});

test('the design structure document and the enforced section list agree', () => {
  const structure = fs.readFileSync(path.join(REPO, 'config', 'design-contract', 'DESIGN-STRUCTURE.md'), 'utf8');
  // The headings are bolded in prose because the file is a reader's guide, not a
  // template. Extracting them is the only way to keep it from drifting away from
  // the list that actually gates a project.
  const documented = [...structure.matchAll(/^\*\*(.+?)\*\* —/gm)].map((match) => match[1].trim());
  assert.ok(documented.length >= 6, `structure document lists only ${documented.length} section(s)`);
  const enforced = REQUIRED_DESIGN_SECTIONS.map((entry) => entry.heading).filter((heading) => heading !== '适用范围');
  for (const heading of enforced) {
    assert.ok(documented.includes(heading), `DESIGN-STRUCTURE.md does not document ${heading}`);
  }
  for (const heading of documented) {
    assert.ok(
      REQUIRED_DESIGN_SECTIONS.some((entry) => entry.heading === heading),
      `DESIGN-STRUCTURE.md documents ${heading}, which nothing enforces`,
    );
  }
});

test('the design contract has no 验证 section, because it has no command to run', () => {
  const root = project();
  assert.equal(run(['init', '--root', root, '--only', 'design']).code, 0);
  const design = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
  // Requiring it would make the design contract demand a command it does not
  // own, and the two section lists were separate for exactly that reason.
  assert.ok(!/^## 验证$/m.test(design));
  assert.ok(!REQUIRED_DESIGN_SECTIONS.some((entry) => entry.heading === '验证'));
});

test('--help in the first position is help, not an unknown command', () => {
  const help = run(['--help']);
  // A user asking how the tool works must not get an error line and exit 2: the
  // one command that can never look like a failure is the one that explains the
  // others.
  assert.equal(help.code, 0);
  assert.match(help.stdout, /usage:/);
  assert.doesNotMatch(help.stderr, /unknown command/);
  // A bare invocation is still a usage error, because guessing which subcommand
  // the user meant is not this program's job.
  assert.equal(run([]).code, 2);
});
