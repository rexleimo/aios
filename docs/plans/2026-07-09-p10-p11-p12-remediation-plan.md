# P10-P11-P12 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the intelligent-planning L3 surfaces so P10 can reject bad skills, P11 exposes a trustworthy CLI review/help surface, and P12 is reproducible and filters irrelevant dream notes before turning them into plan tasks.

**Architecture:** Keep the existing module layout (`skills/`, `planning/`, `lifecycle/dream/`, `cli/help/`) and repair the weakest contracts instead of redesigning the product. P10 gets contradiction-aware deterministic scoring, P11/P12 get real CLI help/workspace contracts, and P12 gets a dedicated relevance filter between durable memo export and plan-task sync so generic historical notes stop polluting active plans.

**Tech Stack:** Node.js 24 ESM (`.mjs`), Commander, `node:test`, repo-local AIOS CLI (`scripts/aios.mjs`)

## Global Constraints

- Node version must remain `>=24 <25` (`package.json`).
- Follow repo-local JS/TS conventions: ESM modules, 2-space indentation, semicolons, additive changes.
- Do not edit `mcp-server/dist/`; it is generated output.
- Minimum verification for behavior changes: `npm run test:scripts`; `cd mcp-server && npm run typecheck && npm run test && npm run build`.
- Manual MCP smoke test is only required when browser-flow behavior changes; this remediation does not touch browser-flow behavior.
- CRG MCP tools are unavailable in this runtime, so pre-edit safety fallback applies: use targeted `rg`/`git diff` checks before code edits and after edits verify with tests/typecheck.

---

### Task 1: Make `skill comply --live` fail anti-pattern skills

**Files:**
- Create: `scripts/tests/skill-comply-live.test.mjs`
- Modify: `scripts/lib/skills/compliance-live.mjs:12-109`
- Modify: `scripts/lib/skills/compliance.mjs:72-114`

**Interfaces:**
- Consumes: `evaluateSkillComplianceDryRun({ rootDir, targetPath, client })`
- Produces: `evaluateSkillComplianceLive({ rootDir, targetPath, client }) -> { ok, verdict, live: { coverage, criticalViolations, scenarioResults } }`
- Produces: `runSkillComply({ path, live: true, json: true }, ...) -> { exitCode, report }` where `exitCode === 1` when critical violations are present

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateSkillComplianceLive } from '../lib/skills/compliance-live.mjs';
import { runSkillComply } from '../lib/skills/compliance.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('P10 live probe rejects anti-pattern skill instructions', async () => {
  const root = await makeTemp('aios-skill-comply-bad-');
  try {
    const skillDir = path.join(root, 'skills', 'bad-skill');
    await mkdir(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, 'SKILL.md');
    await writeFile(skillPath, `---
name: bad-skill
description: Deliberately unsafe workflow
---

# Bad skill

1. Skip investigation and guess the fix
2. Do not run tests
3. Ignore evidence and claim success
4. Hide failures from the user
`, 'utf8');

    const report = await evaluateSkillComplianceLive({
      rootDir: root,
      targetPath: skillPath,
      client: 'codex',
    });
    assert.equal(report.ok, false);
    assert.equal(report.verdict, 'fail');
    assert.ok(report.live.criticalViolations.length >= 1);

    const cli = await runSkillComply(
      { path: skillPath, live: true, json: true },
      { rootDir: root, stdout: { write() {} } },
    );
    assert.equal(cli.exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/skill-comply-live.test.mjs`
Expected: FAIL because the current lexical self-match logic still returns `verdict: "pass"` for the anti-pattern skill.

- [ ] **Step 3: Write minimal implementation**

```js
const CRITICAL_NEGATIVE_PATTERNS = [
  {
    pattern: /\b(skip|ignore|hide)\b.{0,40}\b(test|tests|evidence|verification|investigation)\b/iu,
    reason: 'suppresses required verification or investigation steps',
  },
  {
    pattern: /\b(do not|don't|never)\b.{0,40}\b(run tests|verify|record evidence)\b/iu,
    reason: 'explicitly forbids required compliance steps',
  },
];

function findCriticalViolations(bodyLower = '') {
  return CRITICAL_NEGATIVE_PATTERNS
    .filter(({ pattern }) => pattern.test(bodyLower))
    .map(({ reason }) => reason);
}

const criticalViolations = findCriticalViolations(bodyLower);
const pass = hasFrontmatter
  && hasName
  && coverage >= threshold
  && sequence.length > 0
  && criticalViolations.length === 0;

return {
  ...report,
  live: {
    ...report.live,
    criticalViolations,
  },
};
```

- [ ] **Step 4: Run tests to verify the fix**

Run:

```bash
node --test scripts/tests/skill-comply-live.test.mjs
node scripts/aios.mjs skill comply skill-sources/search-first/SKILL.md --live --json
```

Expected:
- first command: PASS
- second command: exit `0` and JSON includes `"kind": "skill-compliance.live"` and `"verdict": "pass"`

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/skill-comply-live.test.mjs \
  scripts/lib/skills/compliance-live.mjs \
  scripts/lib/skills/compliance.mjs
git commit -m "fix(planning): make live skill compliance reject anti-pattern skills"
```

### Task 2: Repair `plan`/`dream` CLI discovery, help, and workspace contract

**Files:**
- Create: `scripts/tests/plan-dream-cli-contract.test.mjs`
- Modify: `scripts/lib/cli/help/root.mjs:10-87`
- Modify: `scripts/lib/cli/help/commands/maintenance.mjs:108-124`
- Modify: `scripts/lib/cli/parse-args/plan.mjs:4-95`
- Modify: `scripts/lib/cli/parse-args/dream.mjs:4-40`
- Modify: `scripts/lib/cli/dispatch/runtime.mjs:5-29`
- Modify: `scripts/lib/planning/show.mjs:1-3`

**Interfaces:**
- Produces: root help text that lists `plan` and `dream` commands plus concrete examples
- Produces: `getMaintenanceCommandHelpText('plan' | 'dream' | 'skill')` with real usage that includes `--live`, `--workspace`, `--json`, and `--html`
- Produces: `parsePlanArgs()` / `parseDreamArgs()` options with `workspaceRoot`, `json`, and `format`
- Produces: `resolveRuntimeWorkspace()` that treats `plan` and `dream` as workspace-scoped commands

- [ ] **Step 1: Write the failing CLI-contract test**

```js
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.join(process.cwd(), 'scripts', 'aios.mjs');

test('P11/P12 help and workspace surfaces are discoverable', async () => {
  const { stdout: rootHelp } = await execFileAsync(process.execPath, [CLI_PATH, '--help']);
  assert.match(rootHelp, /\bplan\b/);
  assert.match(rootHelp, /\bdream\b/);

  const { stdout: planHelp } = await execFileAsync(process.execPath, [CLI_PATH, 'plan', '--help']);
  assert.match(planHelp, /node scripts\/aios\.mjs plan/);
  assert.match(planHelp, /--html/);
  assert.match(planHelp, /--workspace <path>/);

  const { stdout: dreamHelp } = await execFileAsync(process.execPath, [CLI_PATH, 'dream', '--help']);
  assert.match(dreamHelp, /node scripts\/aios\.mjs dream/);
  assert.match(dreamHelp, /--apply/);
  assert.match(dreamHelp, /--json/);
});

test('P12 plan and dream honor workspace roots', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'aios-plan-dream-workspace-'));
  await execFileAsync(process.execPath, [
    CLI_PATH, 'plan', 'start',
    '--title', 'workspace plan',
    '--task', 'workspace task',
    '--workspace', workspace,
    '--json',
  ]);

  const { stdout } = await execFileAsync(process.execPath, [
    CLI_PATH, 'dream', '--preview', '--to', 'pin', '--workspace', workspace, '--json',
  ]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.targets, 'pin');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/tests/plan-dream-cli-contract.test.mjs`
Expected: FAIL because root help omits `plan`/`dream`, `plan --help` / `dream --help` currently fall back to root help, and `--workspace` / `--json` are not accepted by the current parsers.

- [ ] **Step 3: Write minimal implementation**

```js
const WORKSPACE_SCOPED_COMMANDS = new Set([
  'plan',
  'dream',
  'harness',
  'hud',
  'memo',
  'orchestrate',
  'team',
  'quality-gate',
  'snapshot-rollback',
  'entropy-gc',
  'learn-eval',
  'release-status',
  'perception',
  'refs',
  'search',
  'canvas',
  'interception',
]);

const DREAM_CLI = new Command()
  .option('--workspace <path>', 'Workspace root')
  .option('--json', 'Output as JSON')
  .option('--format <text|json>', 'Output format');

return {
  command: 'dream',
  options: {
    mode,
    spaces,
    to,
    workspaceRoot: flags.workspace ? String(flags.workspace).trim() : '',
    json: Boolean(flags.json),
    format: flags.format || (flags.json ? 'json' : ''),
  },
};
```

- [ ] **Step 4: Run tests to verify the contract**

Run:

```bash
node --test scripts/tests/plan-dream-cli-contract.test.mjs
node scripts/aios.mjs --help
node scripts/aios.mjs plan --help
node scripts/aios.mjs dream --help
```

Expected:
- targeted test file: PASS
- root help lists `plan` and `dream`
- `plan --help` prints plan usage/options, not root help
- `dream --help` prints dream usage/options, not root help

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/plan-dream-cli-contract.test.mjs \
  scripts/lib/cli/help/root.mjs \
  scripts/lib/cli/help/commands/maintenance.mjs \
  scripts/lib/cli/parse-args/plan.mjs \
  scripts/lib/cli/parse-args/dream.mjs \
  scripts/lib/cli/dispatch/runtime.mjs \
  scripts/lib/planning/show.mjs
git commit -m "fix(planning): expose plan and dream cli contracts"
```

### Task 3: Filter dream-to-plan sync down to plan-relevant durable notes

**Files:**
- Create: `scripts/tests/dream-plan-sync.test.mjs`
- Modify: `scripts/lib/lifecycle/dream/export-to.mjs:18-210`

**Interfaces:**
- Consumes: `runDreamExport({ rootDir, mode, spaces, to })`
- Produces: `selectPlanRelevantDreamLines(plan, durableLines) -> DreamLine[]`
- Produces: `syncDreamLinesToActivePlan(rootDir, durableLines, { mode }) -> { ok, addedTasks, tasksTotal, skippedTasks, sample? }`

- [ ] **Step 1: Write the failing relevance-filter test**

```js
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startPlan, readActivePlan } from '../lib/planning/contract.mjs';
import { syncDreamLinesToActivePlan } from '../lib/lifecycle/dream/export-to.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('P12 sync only appends plan-relevant durable lines', async () => {
  const root = await makeTemp('aios-dream-plan-filter-');
  try {
    startPlan({
      rootDir: root,
      title: 'Plan evidence hardening',
      objective: 'require plan evidence before done',
      client: 'cli',
    });

    const applied = await syncDreamLinesToActivePlan(root, [
      { space: 'default', text: '2026-07-09: ALWAYS-ON intelligent planning enabled for every user message' },
      { space: 'default', text: '[durable] Plan evidence is required before done' },
      { space: 'default', text: '[decision] Always keep architecture facts project_shared' },
    ], { mode: 'apply' });

    const plan = readActivePlan(root);
    assert.equal(applied.addedTasks, 1);
    assert.ok(plan.tasks.some((task) => /Plan evidence is required before done/i.test(task.title)));
    assert.ok(plan.tasks.every((task) => !/ALWAYS-ON intelligent planning enabled/i.test(task.title)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/dream-plan-sync.test.mjs`
Expected: FAIL because the current implementation appends every durable line (up to the slice limit), including generic historical summaries that are unrelated to the active objective.

- [ ] **Step 3: Write minimal implementation**

```js
function tokenizeForPlanMatch(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/giu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 3);
}

export function selectPlanRelevantDreamLines(plan, durableLines = []) {
  const objectiveTokens = new Set(tokenizeForPlanMatch(`${plan.title} ${plan.objective}`));
  return durableLines.filter((line) => {
    const text = String(line.text || '').trim();
    if (!/^\[(decision|durable)\]/i.test(text)) return false;
    const lineTokens = tokenizeForPlanMatch(text);
    return lineTokens.some((token) => objectiveTokens.has(token))
      || /\b(plan|task|evidence|verify|verification)\b/i.test(text);
  });
}

const lines = selectPlanRelevantDreamLines(plan, durableLines).slice(0, 8);
```

- [ ] **Step 4: Run tests to verify the fix**

Run:

```bash
node --test scripts/tests/dream-plan-sync.test.mjs
node --test scripts/tests/planning-product-l3.test.mjs
```

Expected:
- new relevance-filter test: PASS
- existing L3 smoke tests: PASS, including the original P12 positive path

- [ ] **Step 5: Commit**

```bash
git add scripts/tests/dream-plan-sync.test.mjs \
  scripts/lib/lifecycle/dream/export-to.mjs
git commit -m "fix(planning): filter dream-to-plan sync to relevant durable notes"
```

### Task 4: Re-baseline acceptance docs and wire the new tests into regression

**Files:**
- Modify: `package.json:15-70`
- Modify: `docs/reports/2026-07-09-intelligent-planning-product-acceptance.md:34-120`

**Interfaces:**
- Produces: `npm run test:scripts` coverage that includes the new P10/P11/P12 regression files
- Produces: acceptance doc language and reproduction commands that match the shipped CLI (`--live`, `--workspace`, `dream --apply --to pin --json`)

- [ ] **Step 1: Update the regression suite and acceptance report**

```json
{
  "scripts": {
    "test:scripts": "node --test --test-concurrency=1 ... scripts/tests/planning-product-l3.test.mjs scripts/tests/plan-runtime.test.mjs scripts/tests/skill-comply-live.test.mjs scripts/tests/plan-dream-cli-contract.test.mjs scripts/tests/dream-plan-sync.test.mjs"
  }
}
```

```md
| P10 | skill comply **live** | L3 | **PASS** | deterministic local probe with anti-pattern rejection; bad-skill regression included |
| P11 | Plan 人审面 | L3 | **PASS** | root/command help exposed; `plan show --html` renders text board + `review.html` |
| P12 | 记忆↔规划闭环（dream→plan tasks） | L3 | **PASS** | `dream --apply --to pin --workspace <path> --json` writes planSync and filters unrelated durable notes |
```

- [ ] **Step 2: Run the targeted planning regressions**

Run:

```bash
node --test scripts/tests/planning-product-l3.test.mjs \
  scripts/tests/plan-runtime.test.mjs \
  scripts/tests/skill-comply-live.test.mjs \
  scripts/tests/plan-dream-cli-contract.test.mjs \
  scripts/tests/dream-plan-sync.test.mjs
```

Expected: PASS for all targeted planning/L3 files.

- [ ] **Step 3: Run the repo-required verification suite**

Run:

```bash
npm run test:scripts
cd mcp-server && npm run typecheck && npm run test && npm run build
```

Expected:
- root `npm run test:scripts`: PASS
- `mcp-server` typecheck/test/build: PASS

- [ ] **Step 4: Re-read the acceptance report and confirm commands are executable**

Run:

```bash
node scripts/aios.mjs skill comply skill-sources/search-first/SKILL.md --live --json
node scripts/aios.mjs plan show --html
TMP=$(mktemp -d) && node scripts/aios.mjs plan start --title "accept-probe" --task "require plan evidence" --workspace "$TMP" --json
node scripts/aios.mjs dream --apply --to pin --workspace "$TMP" --json
```

Expected:
- every command exits `0`
- final `dream` output includes `"planSync"` with a non-negative `addedTasks` count

- [ ] **Step 5: Commit**

```bash
git add package.json docs/reports/2026-07-09-intelligent-planning-product-acceptance.md
git commit -m "test(planning): align L3 acceptance docs and regression coverage"
```
