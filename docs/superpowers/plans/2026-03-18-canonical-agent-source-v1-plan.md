# Canonical Agent Source V1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-edited orchestrator agent compatibility spec with a canonical `agent-sources/` tree while keeping `.claude/agents`, `.codex/agents`, and existing orchestrator consumers behaviorally unchanged. The canonical authoring format is now Markdown frontmatter + body; JSON remains a generated compatibility/export format.

**Architecture:** Add a canonical source loader plus a deterministic compatibility/export and emitter-sync pipeline. Keep `scripts/lib/specs/orchestrator-agents.json` as the runtime-facing compatibility export in v1, but generate it from `agent-sources/`. Treat sync as a strict transaction: any malformed managed file, unmanaged conflict, collision, or write failure exits non-zero and leaves managed outputs unchanged.

**Tech Stack:** Node 22 ESM, built-in `node:test`, Markdown/frontmatter source files, generated JSON compatibility export, repo-local generated agent catalogs.

---

## File Structure

Create:
- `agent-sources/manifest.json`
- `agent-sources/roles/rex-planner.md`
- `agent-sources/roles/rex-implementer.md`
- `agent-sources/roles/rex-reviewer.md`
- `agent-sources/roles/rex-security-reviewer.md`
- `scripts/lib/agents/source-tree.mjs`
- `scripts/lib/agents/compat-export.mjs`
- `scripts/lib/agents/emitters/claude.mjs`
- `scripts/lib/agents/emitters/codex.mjs`
- `scripts/lib/agents/sync.mjs`
- `scripts/tests/agents-source-tree.test.mjs`
- `scripts/tests/agents-sync.test.mjs`

Modify:
- `scripts/lib/harness/orchestrator-agents.mjs`
- `scripts/generate-orchestrator-agents.mjs`
- `scripts/lib/components/agents.mjs`
- `scripts/lib/lifecycle/setup.mjs`
- `scripts/lib/lifecycle/update.mjs`
- `scripts/lib/lifecycle/uninstall.mjs`
- `scripts/lib/cli/help.mjs`
- `scripts/lib/lifecycle/options.mjs`
- `scripts/doctor-security-config.mjs`
- `scripts/package-release.sh`
- `scripts/package-release.ps1`
- `scripts/release-preflight.sh`
- `scripts/tests/aios-orchestrator-agents.test.mjs`
- `scripts/tests/aios-components.test.mjs`
- `scripts/tests/release-pipeline.test.mjs`
- `scripts/lib/specs/orchestrator-agents.json`
- `README.md`
- `README-zh.md`

Keep unchanged in v1:
- `scripts/lib/harness/orchestrator.mjs`
- `scripts/lib/harness/subagent-runtime.mjs`

Responsibility split:
- `scripts/lib/agents/source-tree.mjs`: validate manifest, validate `roles/<id>.md` frontmatter/body, load canonical agents, enforce fixed role cardinality.
- `scripts/lib/agents/compat-export.mjs`: render deterministic `scripts/lib/specs/orchestrator-agents.json` content from canonical source.
- `scripts/lib/agents/emitters/*.mjs`: pure Markdown renderers for client-specific agent files.
- `scripts/lib/agents/sync.mjs`: target resolution, strict managed-file detection, collision checks, staging, rollback, stale-file removal.
- `scripts/lib/harness/orchestrator-agents.mjs`: thin compatibility wrapper around the new source/export/sync modules so existing callers do not need large rewrites in v1.

## Chunk 1: Canonical Source, Export, And Strict Sync

### Task 1: Add canonical source files and validation coverage

**Files:**
- Create: `agent-sources/manifest.json`
- Create: `agent-sources/roles/rex-planner.md`
- Create: `agent-sources/roles/rex-implementer.md`
- Create: `agent-sources/roles/rex-reviewer.md`
- Create: `agent-sources/roles/rex-security-reviewer.md`
- Create: `scripts/tests/agents-source-tree.test.mjs`

- [ ] **Step 1: Add the failing source-tree tests**

```js
test('loadCanonicalAgents validates manifest and returns four role-bound agents', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir);

  const mod = await import('../lib/agents/source-tree.mjs');
  const result = await mod.loadCanonicalAgents({ rootDir });

  assert.equal(result.manifest.schemaVersion, 1);
  assert.deepEqual(Object.keys(result.agentsById), [
    'rex-implementer',
    'rex-planner',
    'rex-reviewer',
    'rex-security-reviewer',
  ]);
  assert.equal(result.roleMap['planner'], 'rex-planner');
});

test('loadCanonicalAgents rejects unknown keys and unexpected files', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    extraRoleFile: 'roles/notes.txt',
    extraRootDir: 'drafts',
    plannerOverride: { extra: true },
  });

  const mod = await import('../lib/agents/source-tree.mjs');
  await assert.rejects(
    () => mod.loadCanonicalAgents({ rootDir }),
    /unknown key|unexpected file/i
  );
});

test('loadCanonicalAgents rejects duplicate ids, duplicate roles, missing required roles, filename mismatch, multiline scalar fields, and managed-marker injection', async () => {
  const mod = await import('../lib/agents/source-tree.mjs');

  await assert.rejects(() => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithDuplicateId() }), /duplicate id/i);
  await assert.rejects(() => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithDuplicateRole() }), /duplicate role/i);
  await assert.rejects(() => mod.loadCanonicalAgents({ rootDir: await makeFixtureMissingRole('reviewer') }), /missing required role/i);
  await assert.rejects(() => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithFilenameMismatch() }), /filename/i);
  await assert.rejects(() => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithMultilineDescription() }), /single-line/i);
  await assert.rejects(() => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithManagedMarker() }), /managed marker/i);
});
```

- [ ] **Step 2: Run the new source-tree tests and confirm failure**

Run: `node --test scripts/tests/agents-source-tree.test.mjs`
Expected: FAIL with import or missing-module errors for `scripts/lib/agents/source-tree.mjs`

- [ ] **Step 3: Add canonical source fixtures**

Create the new source tree with one file per existing role, mirroring current live values from `scripts/lib/specs/orchestrator-agents.json`.

Example fixture content:

```json
{
  "schemaVersion": 1,
  "generatedTargets": ["claude", "codex", "opencode", "crush"]
}
```

```json
{
  "schemaVersion": 1,
  "id": "rex-planner",
  "role": "planner",
  "name": "rex-planner",
  "description": "Planner role card for AIOS orchestrations (scope, risks, ordering).",
  "tools": ["Read", "Grep", "Glob"],
  "model": "sonnet",
  "handoffTarget": "next-phase",
  "systemPrompt": "You are the Planner. Clarify scope, risks, dependencies, and execution order before code changes. Produce a concrete plan that an implementer can follow."
}
```

- [ ] **Step 4: Implement the canonical source loader**

Add `scripts/lib/agents/source-tree.mjs` with:

```js
export async function loadCanonicalAgents({ rootDir }) {}
export function validateManifest(raw) {}
export function validateCanonicalAgent(raw) {}
export function buildRoleMap(agentsById) {}
```

Required behavior:
- read only `agent-sources/manifest.json` and `agent-sources/roles/*.md`
- require `manifest.schemaVersion === 1`
- require `manifest.generatedTargets` to equal resolved client agent targets, currently `["claude", "codex", "opencode", "crush"]`
- reject unknown manifest keys
- reject unknown agent keys
- require per-agent `schemaVersion === 1`
- require non-empty `id`, `role`, `name`, `description`, `model`, `handoffTarget`, and `systemPrompt`
- require kebab-case `id`
- require `role` in `planner|implementer|reviewer|security-reviewer`
- require `handoffTarget` in `next-phase|merge-gate`
- require `tools` to be an array of strings
- enforce filename `<id>.md` in default canonical mode
- reject duplicate agent `id`
- reject duplicate `role`
- enforce exactly one agent per required role
- reject unexpected files under `agent-sources/roles/`; `.json` role files require explicit legacy compatibility mode
- reject unexpected subdirectories under `agent-sources/`
- reject multi-line `name`, `description`, `model`, and `tools[]` items
- reject any string field containing managed marker text
- sort returned ids lexicographically

- [ ] **Step 5: Run the source-tree tests and confirm pass**

Run: `node --test scripts/tests/agents-source-tree.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit the source-tree foundation**

```bash
git add agent-sources scripts/lib/agents/source-tree.mjs scripts/tests/agents-source-tree.test.mjs
git commit -m "feat(agents): add canonical agent source loader"
```

### Task 2: Generate the compatibility export from canonical source

**Files:**
- Create: `scripts/lib/agents/compat-export.mjs`
- Modify: `scripts/generate-orchestrator-agents.mjs`
- Modify: `scripts/lib/specs/orchestrator-agents.json`
- Modify: `scripts/tests/aios-orchestrator-agents.test.mjs`

- [ ] **Step 1: Add the failing compatibility-export tests**

Add tests asserting:

```js
test('renderCompatibilityExport preserves current orchestrator agent shape', async () => {
  const source = await loadCanonicalFixture();
  const mod = await import('../lib/agents/compat-export.mjs');
  const text = mod.renderCompatibilityExport(source);
  const parsed = JSON.parse(text);

  assert.deepEqual(Object.keys(parsed), ['schemaVersion', 'roleMap', 'agents']);
  assert.deepEqual(Object.keys(parsed.roleMap), [
    'planner',
    'implementer',
    'reviewer',
    'security-reviewer',
  ]);
  assert.deepEqual(Object.keys(parsed.agents), [
    'rex-implementer',
    'rex-planner',
    'rex-reviewer',
    'rex-security-reviewer',
  ]);
  assert.equal(parsed.agents['rex-planner'].model, 'sonnet');
});
```

- [ ] **Step 2: Run the compatibility-export tests and confirm failure**

Run: `node --test scripts/tests/aios-orchestrator-agents.test.mjs`
Expected: FAIL with missing export-renderer module or missing function

- [ ] **Step 3: Implement deterministic export rendering**

Add `scripts/lib/agents/compat-export.mjs` with:

```js
export function buildCompatibilitySpec(source) {}
export function renderCompatibilityExport(source) {}
export function validateCompatibilityExport(spec, source) {}
```

Required behavior:
- emit key order `schemaVersion`, `roleMap`, `agents`
- emit `agents` object keys in lexicographic `id` order
- emit agent field order `name`, `description`, `tools`, `model`, `role`, `handoffTarget`, `systemPrompt`
- use two-space indentation
- end file with exactly one trailing newline
- validate parsed export before any write
- fail if the rendered export is missing required roles or expected agent ids

- [ ] **Step 4: Update the generator CLI to support export-only regeneration**

Modify `scripts/generate-orchestrator-agents.mjs` so it supports:

```bash
node scripts/generate-orchestrator-agents.mjs --export-only
```

Required behavior:
- load canonical source
- render and validate the compatibility export
- write only `scripts/lib/specs/orchestrator-agents.json`
- do not sync `.claude/agents` or `.codex/agents` yet in this step

- [ ] **Step 5: Verify byte-for-byte cutover for the compatibility export only**

Run:

```bash
node scripts/generate-orchestrator-agents.mjs --export-only
git diff -- scripts/lib/specs/orchestrator-agents.json
git diff -- .claude/agents .codex/agents
```

Expected:
- no diff at all for `scripts/lib/specs/orchestrator-agents.json` before repository authority switches to `agent-sources/`
- no diff for `.claude/agents` and `.codex/agents` because `--export-only` must not touch generated target roots

- [ ] **Step 6: Run agent tests and confirm pass**

Run: `node --test scripts/tests/aios-orchestrator-agents.test.mjs`
Expected: PASS

- [ ] **Step 7: Commit the compatibility-export cutover**

```bash
git add scripts/lib/agents/compat-export.mjs scripts/generate-orchestrator-agents.mjs scripts/tests/aios-orchestrator-agents.test.mjs scripts/lib/specs/orchestrator-agents.json
git commit -m "refactor(agents): generate compatibility export from canonical source"
```

### Task 3: Split emitters and implement strict transactional sync

**Files:**
- Create: `scripts/lib/agents/emitters/claude.mjs`
- Create: `scripts/lib/agents/emitters/codex.mjs`
- Create: `scripts/lib/agents/sync.mjs`
- Create: `scripts/tests/agents-sync.test.mjs`
- Modify: `scripts/lib/harness/orchestrator-agents.mjs`
- Modify: `scripts/generate-orchestrator-agents.mjs`

- [ ] **Step 1: Add the failing emitter and sync tests**

Add tests for:

```js
test('renderClaudeAgentMarkdown matches the normative template', async () => {
  const source = canonicalAgent('planner');
  const mod = await import('../lib/agents/emitters/claude.mjs');
  const rendered = mod.renderClaudeAgent(source);
  const md = rendered.content;
  assert.equal(md.endsWith('\n'), true);
  assert.equal(rendered.targetRelPath, '.claude/agents/rex-planner.md');
  assert.match(md, /^---\nname: rex-planner\n/);
  assert.match(md, /^([\s\S]*)<!-- END AIOS-GENERATED -->\n$/);
});

test('syncCanonicalAgents aborts before write on unmanaged conflict', async () => {
  const rootDir = await makeRootDir();
  await writeFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'manual\n', 'utf8');

  const mod = await import('../lib/agents/sync.mjs');
  await assert.rejects(() => mod.syncCanonicalAgents({ rootDir, targets: ['claude'] }), /unmanaged conflict/i);
});

test('syncCanonicalAgents rolls back replacements when final export write fails', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir);

  const mod = await import('../lib/agents/sync.mjs');
  const beforeClaude = await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8');
  const beforeCodex = await readFile(path.join(rootDir, '.codex/agents/rex-planner.md'), 'utf8');
  const beforeExport = await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['claude', 'codex'],
      fsOps: { writeCompatibilityExport: async () => { throw new Error('final export write'); } },
    }),
    /final export write/i
  );

  assert.equal(await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8'), beforeClaude);
  assert.equal(await readFile(path.join(rootDir, '.codex/agents/rex-planner.md'), 'utf8'), beforeCodex);
  assert.equal(await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8'), beforeExport);
});

test('syncCanonicalAgents rolls back when stale managed backup move fails', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir, { extraManagedFile: '.claude/agents/old-agent.md' });

  const mod = await import('../lib/agents/sync.mjs');
  const beforePlanner = await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8');
  const beforeStale = await readFile(path.join(rootDir, '.claude/agents/old-agent.md'), 'utf8');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['claude'],
      fsOps: { moveStaleManagedFile: async () => { throw new Error('backup move failed'); } },
    }),
    /backup move failed/i
  );

  assert.equal(await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8'), beforePlanner);
  assert.equal(await readFile(path.join(rootDir, '.claude/agents/old-agent.md'), 'utf8'), beforeStale);
});

test('syncCanonicalAgents rolls back when target replacement fails during commit', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir);

  const mod = await import('../lib/agents/sync.mjs');
  const beforePlanner = await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8');
  const beforeExport = await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['claude'],
      fsOps: { replaceTargetFile: async () => { throw new Error('replace failed'); } },
    }),
    /replace failed/i
  );

  assert.equal(await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8'), beforePlanner);
  assert.equal(await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8'), beforeExport);
});

test('syncCanonicalAgents detects collisions before any file is written', async () => {
  const mod = await import('../lib/agents/sync.mjs');
  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir: await makeRootDir(),
      emitters: {
        claude: () => ({ targetRelPath: '.claude/agents/rex-planner.md', content: 'a\n' }),
        codex: () => ({ targetRelPath: '.claude/agents/rex-planner.md', content: 'b\n' }),
      },
    }),
    /collision/i
  );
});

test('syncCanonicalAgents removes stale managed files after successful sync', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir, { extraManagedFile: '.claude/agents/old-agent.md' });

  const mod = await import('../lib/agents/sync.mjs');
  await mod.syncCanonicalAgents({ rootDir, targets: ['claude'] });

  await assert.rejects(() => readFile(path.join(rootDir, '.claude/agents/old-agent.md'), 'utf8'));
});

test('syncCanonicalAgents rejects malformed marker-bearing files', async () => {
  const rootDir = await makeRootDir();
  await writeFile(path.join(rootDir, '.claude/agents/rex-planner.md'), '<!-- AIOS-GENERATED: orchestrator-agents v1 -->\nmanual\n', 'utf8');

  const mod = await import('../lib/agents/sync.mjs');
  await assert.rejects(() => mod.syncCanonicalAgents({ rootDir, targets: ['claude'] }), /malformed managed file/i);
});

test('isManagedAgentMarkdown enforces the full ownership predicate', async () => {
  const mod = await import('../lib/agents/sync.mjs');
  const valid = await readFixture('valid-managed-rex-planner.md');
  assert.equal(mod.isManagedAgentMarkdown(valid, 'rex-planner'), true);
  assert.equal(mod.isManagedAgentMarkdown(valid.replace('---\n', ''), 'rex-planner'), false);
  assert.equal(mod.isManagedAgentMarkdown(valid.replace('<!-- END AIOS-GENERATED -->\n', ''), 'rex-planner'), false);
  assert.equal(mod.isManagedAgentMarkdown(valid.replace('Role: planner', 'Role: reviewer'), 'rex-planner'), true);
  assert.equal(mod.isManagedAgentMarkdown(valid, 'rex-reviewer'), false);
});

test('renderCodexAgentMarkdown matches the same deterministic template contract', async () => {
  const source = canonicalAgent('planner');
  const mod = await import('../lib/agents/emitters/codex.mjs');
  const rendered = mod.renderCodexAgent(source);
  const md = rendered.content;
  assert.equal(md.endsWith('\n'), true);
  assert.equal(rendered.targetRelPath, '.codex/agents/rex-planner.md');
  assert.match(md, /^---\nname: rex-planner\n/);
});
```

- [ ] **Step 2: Run the sync tests and confirm failure**

Run: `node --test scripts/tests/agents-sync.test.mjs`
Expected: FAIL with missing emitter or sync modules

- [ ] **Step 3: Implement pure client emitters**

Add:

```js
export function renderClaudeAgent(agent) {}
export function renderCodexAgent(agent) {}
```

Requirements:
- use the exact current template from `renderAgentMarkdown`
- keep marker strings:
  - `<!-- AIOS-GENERATED: orchestrator-agents v1 -->`
  - `<!-- END AIOS-GENERATED -->`
- quote YAML `description`
- render `tools` inline as `["Read", "Grep"]`
- return `{ targetRelPath, content }`

- [ ] **Step 4: Implement strict transactional sync**

Add `scripts/lib/agents/sync.mjs` with:

```js
export async function syncCanonicalAgents({
  rootDir,
  targets,
  mode = 'install',
  writeCompatibilityExport = true,
  io = console,
  fsOps,
  emitters,
}) {}
export function isManagedAgentMarkdown(content, expectedId) {}
export function resolveAgentTargets(client) {}
```

Required behavior:
- `client=claude` -> `['claude']`
- `client=codex` -> `['codex']`
- `client=all|gemini|opencode` -> `['claude', 'codex']`
- `mode='install'` and `mode='update'` compute the selected targets' expected managed set from canonical source
- `mode='uninstall'` computes an empty expected set only for the selected target roots and removes only managed files under those roots
- `writeCompatibilityExport=true` is used for install/update sync; `writeCompatibilityExport=false` is required for uninstall so `scripts/lib/specs/orchestrator-agents.json` remains unchanged
- reject any unmanaged conflict with non-zero failure
- reject malformed marker-bearing files with non-zero failure
- detect collisions before writing anything
- stage compatibility export and target files before commit; when `writeCompatibilityExport=false`, stage only the selected target roots
- on any commit failure, including stale managed backup-move failure or final target replacement failure, restore managed files and leave export unchanged
- accept injectable `fsOps` and `emitters` test seams so rollback and collision cases can be verified without production-only flags
- `isManagedAgentMarkdown` must require:
  - YAML frontmatter opening line `---`
  - closing `---` line before content
  - first content line exactly `<!-- AIOS-GENERATED: orchestrator-agents v1 -->`
  - last non-empty line exactly `<!-- END AIOS-GENERATED -->`
  - filename/id match enforced by `expectedId`

- [ ] **Step 5: Rewire the existing harness wrapper**

Modify `scripts/lib/harness/orchestrator-agents.mjs` so it becomes a compatibility facade:

```js
export function normalizeOrchestratorAgentSpec(raw) {}
export function resolveAgentRefIdForRole(roleId, spec) {}
export function renderAgentMarkdown(agent) {}
export async function syncGeneratedAgents(options) {}
```

Required behavior:
- preserve current export names so existing callers keep working
- keep `normalizeOrchestratorAgentSpec` behavior stable enough that `scripts/lib/harness/subagent-runtime.mjs` remains unchanged in v1
- delegate source loading, compatibility export generation, and target sync to the new modules
- do not introduce a new ad hoc wrapper file

- [ ] **Step 6: Update the generator CLI**

Modify `scripts/generate-orchestrator-agents.mjs` so it:
- loads canonical source,
- regenerates `scripts/lib/specs/orchestrator-agents.json`,
- syncs selected target roots,
- prints totals from the new sync result.

- [ ] **Step 7: Run focused tests and confirm pass**

Run:

```bash
node --test scripts/tests/agents-sync.test.mjs scripts/tests/aios-orchestrator-agents.test.mjs
node scripts/generate-orchestrator-agents.mjs
git diff -- .claude/agents .codex/agents
```

Expected:
- focused tests PASS
- full generator exits 0
- generated `.claude/agents` and `.codex/agents` show no diff against the pre-cutover committed outputs

- [ ] **Step 8: Commit emitter/sync refactor**

```bash
git add scripts/lib/agents scripts/lib/harness/orchestrator-agents.mjs scripts/generate-orchestrator-agents.mjs scripts/tests/agents-sync.test.mjs scripts/tests/aios-orchestrator-agents.test.mjs
git commit -m "refactor(agents): split emitters and add transactional sync"
```

### Task 4: Wire setup/update/uninstall, packaging, and security scanning

**Files:**
- Modify: `scripts/lib/components/agents.mjs`
- Modify: `scripts/lib/lifecycle/setup.mjs`
- Modify: `scripts/lib/lifecycle/update.mjs`
- Modify: `scripts/lib/lifecycle/uninstall.mjs`
- Modify: `scripts/lib/cli/help.mjs`
- Modify: `scripts/lib/lifecycle/options.mjs`
- Modify: `scripts/doctor-security-config.mjs`
- Modify: `scripts/package-release.sh`
- Modify: `scripts/package-release.ps1`
- Modify: `scripts/release-preflight.sh`
- Modify: `scripts/tests/aios-components.test.mjs`
- Modify: `scripts/tests/release-pipeline.test.mjs`

- [ ] **Step 1: Add failing lifecycle and release tests**

Extend tests to assert:
- `installOrchestratorAgents({ client: 'gemini' })` resolves to the compatibility target pair
- uninstall removes only managed files
- release packaging includes `agent-sources/`, `.claude/agents`, and `.codex/agents`
- security doctor includes `agent-sources/**`, `.claude/agents/**`, and `.codex/agents/**`

- [ ] **Step 2: Run component and release tests and confirm failure**

Run:

```bash
node --test scripts/tests/aios-components.test.mjs scripts/tests/release-pipeline.test.mjs
```

Expected: FAIL on missing `agent-sources` coverage or old target-resolution behavior

- [ ] **Step 3: Update `components/agents.mjs` target resolution and sync calls**

Modify `scripts/lib/components/agents.mjs` to delegate target resolution to the new sync module and preserve current user-facing client options.

Expected:
- `client=gemini` and `client=opencode` still succeed for `agents`, but resolve to the compatibility target pair
- invalid client values still fail argument parsing

- [ ] **Step 4: Update lifecycle entrypoints to preserve the current CLI surface**

Modify:
- `scripts/lib/lifecycle/setup.mjs`
- `scripts/lib/lifecycle/update.mjs`
- `scripts/lib/lifecycle/uninstall.mjs`
- `scripts/lib/cli/help.mjs`
- `scripts/lib/lifecycle/options.mjs`

Required behavior:
- `setup` and `update` still pass the selected client through to the agents component
- `uninstall` still routes `agents` through the same client surface
- `uninstall` renders an empty expected set only for the selected target roots
- `uninstall` leaves `agent-sources/` unchanged
- `uninstall` leaves `scripts/lib/specs/orchestrator-agents.json` unchanged
- help text remains `--client <all|codex|claude|gemini|opencode>`
- no new CLI values are added in v1

- [ ] **Step 5: Update packaging and preflight**

Change:
- `scripts/package-release.sh`
- `scripts/package-release.ps1`
- `scripts/release-preflight.sh`

Required behavior:
- release archives include `agent-sources/`
- release archives still include `.claude/agents` and `.codex/agents`
- preflight validates the regenerated agent state with the new generator/check path

- [ ] **Step 6: Extend security scanning**

Modify `scripts/doctor-security-config.mjs` to include the new canonical source tree in the same review surface as generated agent roots.

- [ ] **Step 7: Run lifecycle and release tests and confirm pass**

Run:

```bash
node --test scripts/tests/aios-components.test.mjs scripts/tests/release-pipeline.test.mjs
```

Expected: PASS

- [ ] **Step 8: Commit integration wiring**

```bash
git add scripts/lib/components/agents.mjs scripts/lib/lifecycle/setup.mjs scripts/lib/lifecycle/update.mjs scripts/lib/lifecycle/uninstall.mjs scripts/lib/cli/help.mjs scripts/lib/lifecycle/options.mjs scripts/doctor-security-config.mjs scripts/package-release.sh scripts/package-release.ps1 scripts/release-preflight.sh scripts/tests/aios-components.test.mjs scripts/tests/release-pipeline.test.mjs
git commit -m "feat(agents): wire canonical source through lifecycle and release flows"
```

### Task 5: Refresh docs and run full verification

**Files:**
- Modify: `README.md`
- Modify: `README-zh.md`

- [ ] **Step 1: Update operator docs**

Document that:
- `agent-sources/` is the canonical source
- `scripts/lib/specs/orchestrator-agents.json` is generated compatibility output
- `.claude/agents` and `.codex/agents` are generated sync-owned outputs
- `gemini` and `opencode` client selections still resolve to compatibility targets in v1

- [ ] **Step 2: Run the full agent-related test set**

Run:

```bash
node --test \
  scripts/tests/agents-source-tree.test.mjs \
  scripts/tests/agents-sync.test.mjs \
  scripts/tests/aios-orchestrator-agents.test.mjs \
  scripts/tests/aios-components.test.mjs \
  scripts/tests/release-pipeline.test.mjs \
  scripts/tests/aios-orchestrator.test.mjs
```

Expected: PASS

- [ ] **Step 3: Run the repo script suite**

Run:

```bash
npm run test:scripts
```

Expected: PASS

- [ ] **Step 4: Verify export-only regeneration**

Run:

```bash
node scripts/generate-orchestrator-agents.mjs --export-only
git diff -- .claude/agents .codex/agents
```

Expected:
- `--export-only` exits 0 and only refreshes `scripts/lib/specs/orchestrator-agents.json`
- `.claude/agents` and `.codex/agents` remain unchanged

- [ ] **Step 5: Verify full generation and setup flow**

Run:

```bash
node scripts/generate-orchestrator-agents.mjs
node scripts/aios.mjs setup --components agents --client all --skip-doctor
```

Expected:
- full generator exits 0
- setup exits 0

- [ ] **Step 6: Inspect generated agent outputs**

Run:

```bash
sed -n '1,40p' .claude/agents/rex-planner.md
sed -n '1,40p' .codex/agents/rex-planner.md
```

Expected:
- both `sed` commands show the expected managed marker and `Role: planner` block

- [ ] **Step 7: Verify update, orchestrator smoke, and uninstall flow**

Run:

```bash
node scripts/aios.mjs update --components agents --client codex --skip-doctor
node scripts/aios.mjs orchestrate feature --task "Smoke canonical agents" --format json
node scripts/aios.mjs uninstall --components agents --client claude
test ! -e .claude/agents/rex-planner.md
test -e .codex/agents/rex-planner.md
```

Expected:
- update/uninstall exit 0
- orchestrator smoke command exits 0 and still resolves `agentRefId` through `scripts/lib/specs/orchestrator-agents.json`
- after uninstall, `.claude/agents/rex-planner.md` is absent and `.codex/agents/rex-planner.md` is still present

- [ ] **Step 8: Restore generated roots and verify clean tree**

Run:

```bash
node scripts/generate-orchestrator-agents.mjs
git status --short
```

Expected:
- final regeneration restores generated roots before the final `git status --short` check
- only intentional doc changes remain before final commit, or the tree is clean

- [ ] **Step 9: Commit docs and final verification snapshot**

```bash
git add README.md README-zh.md
git commit -m "docs(agents): document canonical source and generated outputs"
```
