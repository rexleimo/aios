// What an agent can find out, and what it is told to do with it.
//
// The failure this pins is not "the kit is absent" - it is "the kit is absent
// and nothing the agent reads says so". A gate nobody invokes and a skill that
// never mentions it produce the same outcome as no gate at all, so the
// discoverability contract is tested rather than assumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');

/**
 * The projected skill file an agent actually loads is not in the repository:
 * `skill-sources/` is the source, and each client root is generated. Tests read
 * the source (the owner) and additionally assert the generated copy carries the
 * same instruction, because a sync that silently dropped it would leave the
 * source correct and the shipped skill mute.
 */
const SKILL_SOURCE = path.join(REPO, 'skill-sources', 'frontend-design', 'SKILL.md');
const PROJECTED = ['.agents', '.codex', '.claude'].map((root) =>
  path.join(REPO, root, 'skills', 'frontend-design', 'SKILL.md'),
);

function readSkill() {
  return fs.readFileSync(SKILL_SOURCE, 'utf8');
}

test('the design skill tells the agent to ask whether the motion material exists', () => {
  const skill = readSkill();
  // The command, not a description of the command: an agent that is told to
  // "check if it is installed" without a command will guess.
  assert.match(skill, /check-motion-kit\.mjs/);
  assert.match(skill, /never assume either way/i);
});

test('the design skill forbids the failure mode that actually happened', () => {
  const skill = readSkill();
  // The specific lie: reporting a skipped frame check as a passed one.
  assert.match(skill, /skipped frame check is not a passed frame check/i);
  assert.match(skill, /check-motion-frame\.mjs/);
  // And the false premise that broke the previous attempt: assuming the kit.
  assert.match(skill, /kit components are not part of this material/i);
});

test('the design skill names the reference texts as the source of the rules', () => {
  const skill = readSkill();
  assert.match(skill, /vendor\/stageshow\/references/);
  // Reading all 16 on every task would bury the task; the instruction has to
  // say to read the one that matches the problem.
  assert.match(skill, /not all 16/i);
});

test('the instruction survives projection to the client roots', () => {
  for (const file of PROJECTED) {
    if (!fs.existsSync(file)) continue;
    const projected = fs.readFileSync(file, 'utf8');
    assert.match(projected, /check-motion-kit\.mjs/, `${file} lost the kit check`);
    assert.match(projected, /skipped frame check is not a passed frame check/i, `${file} lost the honesty rule`);
  }
});

test('the archive allowlist carries the material the contracts reference', () => {
  const script = fs.readFileSync(path.join(REPO, 'scripts', 'package-release.sh'), 'utf8');
  const allowlist = script.slice(script.indexOf('release_paths=('), script.indexOf(')', script.indexOf('release_paths=(')));
  // Both entries were added after shipping defects. The allowlist is an
  // explicit opt-in list, so anything a shipped contract points at has to be
  // named here - silence means omission.
  for (const entry of ['MOTION.md', 'DESIGN.md', 'vendor']) {
    assert.match(allowlist, new RegExp(`(^|\\s)${entry.replace('.', '\\.')}(\\s|$)`, 'm'), `${entry} is not in release_paths`);
  }
});

test('the contents check passes on this repository', () => {
  // Runs the real script, not a reimplementation: the point is that the
  // published contracts resolve against the published tree. The assertion is on
  // the shape of the report rather than on its wording: a version that says
  // "all resolve" while having skipped a whole absent tree was the defect, so
  // what matters is that zero are missing and that the count is not zero.
  const stdout = execFileSync(process.execPath, [path.join(REPO, 'scripts', 'check-release-contents.mjs'), '--root', REPO], {
    encoding: 'utf8',
  });
  const checked = Number.parseInt(stdout.match(/\[contents\] (\d+) path reference/)?.[1] ?? '0', 10);
  assert.ok(checked > 0, `no references were checked: ${stdout.trim()}`);
  assert.doesNotMatch(stdout, /do not resolve|tree absent/i);
});

test('the skill routes illustration work to upstream instead of leaving it unmentioned', () => {
  const skill = readSkill();
  // The correction this pins: the kit is not abandoned, it is a different
  // entry point. An earlier version said "no command installs them", which was
  // false - `npx skills add` does, and silently dropping that turned a real
  // capability into a dead end for the agent reading the skill.
  assert.match(skill, /npx skills add benjitaylor\/skills --skill stageshow/);
  assert.match(skill, /product illustration rather than product UI/i);
  // And the part that makes the upstream skill usable at all: copy an example.
  assert.match(skill, /copy the closest gold example/i);
});

test('the upstream skill is registered as external, not as something this repo ships', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'skills-lock.json'), 'utf8'));
  const entry = lock.skills.stageshow;
  assert.ok(entry, 'stageshow must be recorded so its licence and provenance are not folklore');
  assert.equal(entry.license, 'MIT');
  assert.match(entry.commit, /^[0-9a-f]{40}$/);
  // The distinction the whole vendoring decision rests on.
  assert.match(entry.note, /not for this repo/);
});

test('the design contract names all three routes, so "which tool" is answerable', () => {
  const design = fs.readFileSync(path.join(REPO, 'DESIGN.md'), 'utf8');
  assert.match(design, /先分清你在做哪一种界面/);
  assert.match(design, /debug-hub/);
  assert.match(design, /stageshow/);
  assert.match(design, /awesome-design-md/);
});
