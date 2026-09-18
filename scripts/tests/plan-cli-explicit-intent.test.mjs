/**
 * Test scope contract — `aios plan auto-gate --explicit-intent`
 *
 * Recorded before the tests, under rex-test-design (capability software.testing.design,
 * activation 9d0f6630-07ba-461f-8362-31bdd460fea9, stage design-tests).
 *
 * User goal:
 *   A shell user can declare a precise workflow disposition for the auto-gate turn
 *   without going through a `/command` message prefix (the prefix whitelist has no
 *   `/read-only`), and the decision the policy derives matches that declaration.
 *
 * Explicit non-goals:
 *   - no new intent vocabulary; no change to policy routing rules;
 *   - no new `/command` prefix;
 *   - no MCP surface change (`aios_plan_auto_gate` already accepts explicitIntent);
 *   - no rex submodule change.
 *
 * In-scope behavior (observed at the public CLI seams):
 *   B1 `--explicit-intent <value>` parses into `options.explicitIntent`.
 *      Today the flag is unknown, so the parser silently degrades to help mode.
 *   B2 A declaration reaches the policy and changes the decision versus undeclared.
 *   B3 `read-only` (and the `readonly` alias) -> direct, no pre-edit safety gate.
 *   B4 `plan` -> planned with a selected rex capability.
 *   B5 Undeclared behavior is unchanged (guarded / adaptive-guarded-change).
 *   B6 An unknown value is NOT silent: blocked / explicit-intent-unknown.
 *      This is the reason the CLI must not grow its own allowlist: the policy
 *      already fails closed on vocabulary it does not know.
 *   B7 A field declaration wins over an in-message prefix, and a declaration on a
 *      non-planning disposition persists no artifact.
 *
 * Out-of-scope behavior:
 *   other plan subcommands; `--json` payload shape; routing semantics for values
 *   the policy already handles (review/debug/...).
 *
 * Allowed test seams:
 *   the two public entries behind the CLI — `parsePlanArgs` (argv -> options) and
 *   `runPlanCommand` (options -> decision). No internal helper is asserted.
 *
 * Completion criteria:
 *   every B1-B7 has an assertion that can fail independently; `npm run test:scripts`
 *   remains green.
 *
 * Forbidden fake passes:
 *   no skipped cases; no asserting "it does not throw"; no loosening an expectation
 *   to whatever the code currently returns; no asserting the io capture instead of
 *   the decision.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlanArgs } from '../lib/cli/parse-args/plan.mjs';
import { runPlanCommand } from '../lib/planning/cli.mjs';

const MESSAGE = 'add a vendor integration to the control plane';

function makeIo() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write(chunk) { stdoutText += String(chunk); } },
    stderr: { write(chunk) { stderrText += String(chunk); } },
    read() { return { stdoutText, stderrText }; },
  };
}

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-plan-explicit-intent-'));
}

/**
 * Full CLI path minus the process spawn: argv -> parsePlanArgs -> runPlanCommand.
 * Every assertion below reads the decision the user would see, never an internal.
 */
async function gateFromArgv(rootDir, argv) {
  const parsed = parsePlanArgs(argv);
  assert.equal(
    parsed.mode,
    'command',
    `plan CLI did not accept: ${argv.join(' ')}`,
  );
  const io = makeIo();
  const outcome = await runPlanCommand(
    { subcommand: 'auto-gate', json: true, ...parsed.options },
    { rootDir, ...io },
  );
  assert.equal(outcome.exitCode, 0);
  return outcome.result;
}

test('B1: --explicit-intent parses into options.explicitIntent', () => {
  const parsed = parsePlanArgs([
    'plan',
    'auto-gate',
    '--message',
    MESSAGE,
    '--explicit-intent',
    'read-only',
  ]);
  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.explicitIntent, 'read-only');

  const undeclared = parsePlanArgs(['plan', 'auto-gate', '--message', MESSAGE]);
  // 断言行为而不是表示：没声明时不得凭空造出一个 intent。
  assert.equal(Boolean(undeclared.options.explicitIntent), false);
});

test('B2/B3: a read-only declaration reaches the policy and yields direct', async () => {
  const root = await makeTemp();
  try {
    const undeclared = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      MESSAGE,
      '--dry-run',
    ]);
    assert.equal(undeclared.decision.disposition, 'guarded');
    assert.equal(undeclared.decision.reason, 'adaptive-guarded-change');

    const declared = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      MESSAGE,
      '--explicit-intent',
      'read-only',
      '--dry-run',
    ]);
    assert.equal(declared.decision.disposition, 'direct');
    assert.equal(declared.decision.reason, 'explicit-direct-intent');
    assert.equal(declared.decision.requiresPreEditSafety, false);
    assert.notEqual(declared.decision.disposition, undeclared.decision.disposition);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('B3: the readonly alias normalizes to the same direct decision', async () => {
  const root = await makeTemp();
  try {
    const declared = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      MESSAGE,
      '--explicit-intent',
      'readonly',
      '--dry-run',
    ]);
    assert.equal(declared.decision.disposition, 'direct');
    assert.equal(declared.decision.reason, 'explicit-direct-intent');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('B4: a plan declaration selects the planning capability and persists a plan', async () => {
  const root = await makeTemp();
  try {
    // 真实路径（不 dry-run）：dry-run 按设计不产出 Provider Command，也就不足以证明"选出了 Provider"。
    const declared = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      MESSAGE,
      '--explicit-intent',
      'plan',
    ]);
    assert.equal(declared.decision.disposition, 'planned');
    assert.equal(
      declared.decision.capabilityDecision.capabilityId,
      'software.planning.sequence',
    );
    assert.equal(declared.capabilityCommand.capabilityId, 'software.planning.sequence');
    assert.equal(declared.capabilityCommand.provider.kind, 'skill');
    assert.equal(declared.capabilityCommand.provider.id, 'rex-planning');
    assert.equal(declared.capabilityCommand.stageId, 'sequence');
    assert.equal(declared.created, true);
    assert.equal(
      fs.existsSync(path.join(root, 'docs', 'plans')),
      true,
      'a plan declaration must persist a plan artifact',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('B5: an undeclared turn keeps the deterministic guarded default', async () => {
  const root = await makeTemp();
  try {
    const undeclared = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      MESSAGE,
      '--dry-run',
    ]);
    assert.equal(undeclared.decision.disposition, 'guarded');
    assert.equal(undeclared.decision.reason, 'adaptive-guarded-change');
    assert.equal(undeclared.decision.requiresPreEditSafety, true);
    assert.equal(undeclared.decision.capabilityDecision, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('B6: an unknown declaration is refused loudly, not silently defaulted', async () => {
  const root = await makeTemp();
  try {
    const typo = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      MESSAGE,
      '--explicit-intent',
      'readony',
      '--dry-run',
    ]);
    assert.equal(typo.decision.disposition, 'blocked');
    assert.equal(typo.decision.reason, 'explicit-intent-unknown');
    // The refusal must not be confusable with the undeclared default.
    assert.notEqual(typo.decision.reason, 'adaptive-guarded-change');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('B7: a field declaration beats an in-message prefix and persists nothing', async () => {
  const root = await makeTemp();
  try {
    const declared = await gateFromArgv(root, [
      'plan',
      'auto-gate',
      '--message',
      `/plan ${MESSAGE}`,
      '--explicit-intent',
      'read-only',
    ]);
    assert.equal(declared.decision.disposition, 'direct');
    assert.equal(declared.decision.reason, 'explicit-direct-intent');
    assert.equal(declared.decision.persistence, 'none');
    assert.equal(declared.created, false);
    assert.equal(
      fs.existsSync(path.join(root, 'docs', 'plans')),
      false,
      'a non-planning declaration must not create a plan artifact',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
