# Memory System Optimization: Layered Memory with Agent Views

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared workspace layer and handoff protocol to the AIOS memory system so multiple agents can share context, avoid write conflicts, and retrieve only relevant memory.

**Architecture:** A new `memory/workspace/` directory holds shared state (meta, skill index, knowledge snapshot). Each agent session reads from workspace at startup and writes back with optimistic locking. The existing `continuity.json` is extended to HandoffPacket v2 for structured agent-to-agent handoffs. A `memory doctor` command validates consistency.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test` + `node:assert/strict`, atomic file writes (temp + rename), JSON/JSONL/Markdown storage.

---

## File Structure

| File | Purpose |
|------|---------|
| `scripts/lib/contextdb/workspace.mjs` | Workspace shared layer: meta, skill index, knowledge snapshot, read/write with optimistic locking |
| `scripts/lib/contextdb/handoff.mjs` | HandoffPacket v2: normalize, write, read, render — extends continuity schema |
| `scripts/lib/contextdb/doctor.mjs` | Memory doctor: consistency checks, orphan detection, drift reporting |
| `scripts/lib/contextdb/skill-index.mjs` | Skill index builder: scan `memory/skills/`, extract summaries, build `active-skills.json` |
| `memory/workspace/meta.json` | Workspace version metadata (created at runtime) |
| `memory/workspace/active-skills.json` | Skill summary index (created at runtime) |
| `memory/workspace/knowledge-snapshot.json` | Knowledge subset snapshot (created at runtime) |
| `scripts/tests/workspace.test.mjs` | Tests for workspace read/write/locking |
| `scripts/tests/handoff.test.mjs` | Tests for HandoffPacket v2 |
| `scripts/tests/skill-index.test.mjs` | Tests for skill index builder |
| `scripts/tests/doctor.test.mjs` | Tests for memory doctor |

---

## Task 1: Workspace Core — Meta Read/Write with Optimistic Locking

**Files:**
- Create: `scripts/lib/contextdb/workspace.mjs`
- Test: `scripts/tests/workspace.test.mjs`

- [ ] **Step 1: Write the failing test for workspace init and meta read/write**

```javascript
// scripts/tests/workspace.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  initWorkspace,
  readWorkspaceMeta,
  writeWorkspaceMeta,
  workspaceDir,
} from '../lib/contextdb/workspace.mjs';

test('initWorkspace creates meta.json with version 1', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    const result = await initWorkspace(root);
    assert.equal(result.created, true);
    assert.equal(result.meta.workspaceVersion, 1);

    const meta = await readWorkspaceMeta(root);
    assert.equal(meta.workspaceVersion, 1);
    assert.equal(meta.schemaVersion, 1);
    assert.equal(meta.projectName, 'aios');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('initWorkspace is idempotent — returns existing meta if already initialized', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    const first = await initWorkspace(root);
    const second = await initWorkspace(root);
    assert.equal(second.created, false);
    assert.equal(second.meta.workspaceVersion, first.meta.workspaceVersion);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeWorkspaceMeta increments version on write', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    await initWorkspace(root);
    const before = await readWorkspaceMeta(root);
    assert.equal(before.workspaceVersion, 1);

    const after = await writeWorkspaceMeta(root, {
      lastUpdatedBy: 'test-session-1',
    });
    assert.equal(after.workspaceVersion, 2);
    assert.equal(after.lastUpdatedBy, 'test-session-1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeWorkspaceMeta rejects stale writes with OptimisticLockError', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    await initWorkspace(root);
    const meta = await readWorkspaceMeta(root);

    // Another writer increments the version first
    await writeWorkspaceMeta(root, { lastUpdatedBy: 'other-session' });

    // This write is based on the old version — should fail
    await assert.rejects(
      () => writeWorkspaceMeta(root, {
        lastUpdatedBy: 'stale-session',
        expectedVersion: meta.workspaceVersion,
      }),
      { message: /optimistic lock failed/i }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: FAIL — `workspace.mjs` does not exist

- [ ] **Step 3: Write minimal workspace.mjs implementation**

```javascript
// scripts/lib/contextdb/workspace.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const WORKSPACE_DIRNAME = 'workspace';
export const META_FILENAME = 'meta.json';

class OptimisticLockError extends Error {
  constructor(expected, actual) {
    super(`Optimistic lock failed: expected version ${expected}, actual ${actual}`);
    this.name = 'OptimisticLockError';
    this.code = 'OPTIMISTIC_LOCK_FAILED';
    this.expected = expected;
    this.actual = actual;
  }
}

export { OptimisticLockError };

export function workspaceDir(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot || process.cwd()), 'memory', WORKSPACE_DIRNAME);
}

function metaPath(workspaceRoot) {
  return path.join(workspaceDir(workspaceRoot), META_FILENAME);
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function defaultMeta() {
  return {
    schemaVersion: 1,
    workspaceVersion: 1,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: '',
    projectName: 'aios',
  };
}

export async function initWorkspace(workspaceRoot) {
  const mPath = metaPath(workspaceRoot);
  try {
    const raw = await fs.readFile(mPath, 'utf8');
    const meta = JSON.parse(raw);
    return { created: false, meta };
  } catch {
    const meta = defaultMeta();
    await writeAtomicFile(mPath, `${JSON.stringify(meta, null, 2)}\n`);
    return { created: true, meta };
  }
}

export async function readWorkspaceMeta(workspaceRoot) {
  const mPath = metaPath(workspaceRoot);
  const raw = await fs.readFile(mPath, 'utf8');
  return JSON.parse(raw);
}

export async function writeWorkspaceMeta(workspaceRoot, updates = {}) {
  const mPath = metaPath(workspaceRoot);
  const current = await readWorkspaceMeta(workspaceRoot);

  if (updates.expectedVersion !== undefined && updates.expectedVersion !== current.workspaceVersion) {
    throw new OptimisticLockError(updates.expectedVersion, current.workspaceVersion);
  }

  const next = {
    ...current,
    ...updates,
    workspaceVersion: current.workspaceVersion + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
  delete next.expectedVersion;

  await writeAtomicFile(mPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/workspace.mjs scripts/tests/workspace.test.mjs
git commit -m "feat(memory): add workspace core with optimistic locking"
```

---

## Task 2: Skill Index Builder

**Files:**
- Create: `scripts/lib/contextdb/skill-index.mjs`
- Test: `scripts/tests/skill-index.test.mjs`

- [ ] **Step 1: Write the failing test for skill index builder**

```javascript
// scripts/tests/skill-index.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSkillIndex,
  writeSkillIndex,
  readSkillIndex,
  findSkillsByTaskType,
  findSkillsByKeywords,
} from '../lib/contextdb/skill-index.mjs';

async function createSkillFile(skillsDir, filename, content) {
  await mkdir(skillsDir, { recursive: true });
  await writeFile(path.join(skillsDir, filename), JSON.stringify(content, null, 2), 'utf8');
}

test('buildSkillIndex scans skill files and extracts summaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-si-'));
  try {
    const skillsDir = path.join(root, 'memory', 'skills');
    await createSkillFile(skillsDir, '发布笔记.json', {
      skill_name: '发布小红书笔记',
      description: '完整的小红书笔记发布流程',
      trigger_keywords: ['发布笔记', '发小红书'],
    });
    await createSkillFile(skillsDir, '数据分析.json', {
      skill_name: '数据分析',
      description: '小红书数据分析',
      trigger_keywords: ['数据分析', '数据'],
    });

    const index = await buildSkillIndex(root);
    assert.equal(index.skills.length, 2);
    assert.equal(index.skills[0].name, '发布小红书笔记');
    assert.equal(index.skills[0].file, 'memory/skills/发布笔记.json');
    assert.deepEqual(index.skills[0].keywords, ['发布笔记', '发小红书']);
    assert.equal(index.skills[1].name, '数据分析');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSkillIndex skips non-JSON files and malformed JSON', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-si-'));
  try {
    const skillsDir = path.join(root, 'memory', 'skills');
    await createSkillFile(skillsDir, 'good.json', {
      skill_name: 'Good Skill',
      description: 'A valid skill',
      trigger_keywords: ['good'],
    });
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, 'bad.json'), 'not valid json{', 'utf8');
    await writeFile(path.join(skillsDir, 'readme.md'), '# Skills', 'utf8');

    const index = await buildSkillIndex(root);
    assert.equal(index.skills.length, 1);
    assert.equal(index.skills[0].name, 'Good Skill');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeSkillIndex and readSkillIndex round-trip through workspace dir', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-si-'));
  try {
    const skillsDir = path.join(root, 'memory', 'skills');
    await createSkillFile(skillsDir, 'test.json', {
      skill_name: 'Test Skill',
      description: 'Test',
      trigger_keywords: ['test'],
    });

    const index = await buildSkillIndex(root);
    await writeSkillIndex(root, index);

    const loaded = await readSkillIndex(root);
    assert.equal(loaded.skills.length, 1);
    assert.equal(loaded.skills[0].name, 'Test Skill');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('findSkillsByKeywords matches partial keywords', async () => {
  const index = {
    skills: [
      { name: '发布笔记', file: 'a.json', keywords: ['发布', '笔记'], taskTypes: ['content-publish'], version: 1 },
      { name: '数据分析', file: 'b.json', keywords: ['数据', '分析'], taskTypes: ['analytics'], version: 1 },
    ],
  };

  const results = findSkillsByKeywords(index, ['发布']);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, '发布笔记');
});

test('findSkillsByTaskType matches task type strings', async () => {
  const index = {
    skills: [
      { name: '发布笔记', file: 'a.json', keywords: ['发布'], taskTypes: ['content-publish', 'xhs-ops'], version: 1 },
      { name: '数据分析', file: 'b.json', keywords: ['数据'], taskTypes: ['analytics'], version: 1 },
    ],
  };

  const results = findSkillsByTaskType(index, 'xhs-ops');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, '发布笔记');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/skill-index.test.mjs`
Expected: FAIL — `skill-index.mjs` does not exist

- [ ] **Step 3: Write minimal skill-index.mjs implementation**

```javascript
// scripts/lib/contextdb/skill-index.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { workspaceDir } from './workspace.mjs';

const SKILLS_INDEX_FILENAME = 'active-skills.json';

function skillsDir(workspaceRoot) {
  return path.join(path.resolve(workspaceRoot || process.cwd()), 'memory', 'skills');
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function extractTaskTypes(skill) {
  if (Array.isArray(skill.taskTypes)) return skill.taskTypes;
  const fromPlatforms = skill.platforms ? Object.keys(skill.platforms) : [];
  const fromMcp = (skill.mcp_servers || []).map((s) => s.id);
  return [...fromPlatforms, ...fromMcp];
}

export async function buildSkillIndex(workspaceRoot) {
  const dir = skillsDir(workspaceRoot);
  const skills = [];

  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const filePath = path.join(dir, entry);
      let content;
      try {
        content = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch {
        continue;
      }
      skills.push({
        name: content.skill_name || content.name || entry.replace('.json', ''),
        file: `memory/skills/${entry}`,
        keywords: Array.isArray(content.trigger_keywords) ? content.trigger_keywords : [],
        taskTypes: extractTaskTypes(content),
        version: content.version || 1,
        lastUsed: content.last_used || null,
      });
    }
  } catch {
    // skills dir does not exist yet
  }

  return { skills };
}

export async function writeSkillIndex(workspaceRoot, index) {
  const indexPath = path.join(workspaceDir(workspaceRoot), SKILLS_INDEX_FILENAME);
  await writeAtomicFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

export async function readSkillIndex(workspaceRoot) {
  const indexPath = path.join(workspaceDir(workspaceRoot), SKILLS_INDEX_FILENAME);
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { skills: [] };
  }
}

export function findSkillsByKeywords(index, keywords) {
  const lower = keywords.map((k) => k.toLowerCase());
  return index.skills.filter((s) =>
    s.keywords.some((k) => lower.some((q) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase())))
  );
}

export function findSkillsByTaskType(index, taskType) {
  const lower = taskType.toLowerCase();
  return index.skills.filter((s) =>
    s.taskTypes.some((t) => t.toLowerCase() === lower)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/skill-index.test.mjs`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/skill-index.mjs scripts/tests/skill-index.test.mjs
git commit -m "feat(memory): add skill index builder for workspace active-skills"
```

---

## Task 3: Knowledge Snapshot Builder

**Files:**
- Modify: `scripts/lib/contextdb/workspace.mjs` — add `writeKnowledgeSnapshot` and `readKnowledgeSnapshot`
- Test: `scripts/tests/workspace.test.mjs` — add snapshot tests

- [ ] **Step 1: Write the failing test for knowledge snapshot**

Append to `scripts/tests/workspace.test.mjs`:

```javascript
import {
  initWorkspace,
  readWorkspaceMeta,
  writeWorkspaceMeta,
  writeKnowledgeSnapshot,
  readKnowledgeSnapshot,
  workspaceDir,
} from '../lib/contextdb/workspace.mjs';

test('writeKnowledgeSnapshot and readKnowledgeSnapshot round-trip', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    await initWorkspace(root);
    const snapshot = {
      categories: ['敏感词库', '热门话题'],
      items: [
        { name: '敏感词库', file: 'memory/knowledge/敏感词库.json', version: '1.0.0' },
        { name: '热门话题', file: 'memory/knowledge/热门话题.json', version: '1.0.0' },
      ],
      generatedAt: new Date().toISOString(),
    };
    await writeKnowledgeSnapshot(root, snapshot);

    const loaded = await readKnowledgeSnapshot(root);
    assert.equal(loaded.categories.length, 2);
    assert.equal(loaded.items[0].name, '敏感词库');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readKnowledgeSnapshot returns null when no snapshot exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    const loaded = await readKnowledgeSnapshot(root);
    assert.equal(loaded, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: FAIL — `writeKnowledgeSnapshot` is not exported

- [ ] **Step 3: Add knowledge snapshot functions to workspace.mjs**

Append to `scripts/lib/contextdb/workspace.mjs`:

```javascript
const KNOWLEDGE_SNAPSHOT_FILENAME = 'knowledge-snapshot.json';

export async function writeKnowledgeSnapshot(workspaceRoot, snapshot) {
  const snapPath = path.join(workspaceDir(workspaceRoot), KNOWLEDGE_SNAPSHOT_FILENAME);
  await writeAtomicFile(snapPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

export async function readKnowledgeSnapshot(workspaceRoot) {
  const snapPath = path.join(workspaceDir(workspaceRoot), KNOWLEDGE_SNAPSHOT_FILENAME);
  try {
    const raw = await fs.readFile(snapPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/workspace.mjs scripts/tests/workspace.test.mjs
git commit -m "feat(memory): add knowledge snapshot read/write to workspace"
```

---

## Task 4: HandoffPacket v2

**Files:**
- Create: `scripts/lib/contextdb/handoff.mjs`
- Test: `scripts/tests/handoff.test.mjs`

- [ ] **Step 1: Write the failing test for HandoffPacket v2**

```javascript
// scripts/tests/handoff.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normalizeHandoffPacket,
  writeHandoffPacket,
  readHandoffPacket,
  renderHandoffInjection,
} from '../lib/contextdb/handoff.mjs';

test('normalizeHandoffPacket produces valid v2 packet from minimal input', () => {
  const packet = normalizeHandoffPacket({
    fromSessionId: 'session-1',
    agentType: 'claude-code',
    role: 'implementer',
    intent: 'implement workspace layer',
    progress: 'wrote workspace.mjs',
    nextActions: ['write tests'],
  });

  assert.equal(packet.schemaVersion, 2);
  assert.equal(packet.fromAgent.sessionId, 'session-1');
  assert.equal(packet.fromAgent.agentType, 'claude-code');
  assert.equal(packet.fromAgent.role, 'implementer');
  assert.equal(packet.intent, 'implement workspace layer');
  assert.deepEqual(packet.nextActions, ['write tests']);
  assert.deepEqual(packet.blockers, []);
  assert.deepEqual(packet.touchedFiles, []);
  assert.deepEqual(packet.workspaceChanges, []);
  assert.deepEqual(packet.pendingWrites, []);
  assert.equal(packet.confidence, 'medium');
  assert.deepEqual(packet.assumptions, []);
});

test('normalizeHandoffPacket rejects invalid agentType', () => {
  assert.throws(
    () => normalizeHandoffPacket({
      fromSessionId: 's1',
      agentType: 'invalid-agent',
      role: 'planner',
      intent: 'test',
      progress: 'none',
      nextActions: [],
    }),
    { message: /invalid agentType/i }
  );
});

test('writeHandoffPacket and readHandoffPacket round-trip', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ho-'));
  const sessionId = 'handoff-test-session';
  try {
    const packet = normalizeHandoffPacket({
      fromSessionId: 'session-a',
      agentType: 'claude-code',
      role: 'planner',
      intent: 'design memory system',
      progress: 'completed design doc',
      nextActions: ['implement workspace', 'write tests'],
      touchedFiles: ['docs/design.md'],
      blockers: ['waiting on review'],
      confidence: 'high',
      assumptions: ['Node.js 20+', 'file-based storage'],
    });

    await writeHandoffPacket(root, sessionId, packet);
    const loaded = await readHandoffPacket(root, sessionId);

    assert.equal(loaded.schemaVersion, 2);
    assert.equal(loaded.fromAgent.sessionId, 'session-a');
    assert.equal(loaded.confidence, 'high');
    assert.deepEqual(loaded.touchedFiles, ['docs/design.md']);
    assert.deepEqual(loaded.assumptions, ['Node.js 20+', 'file-based storage']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readHandoffPacket returns null for missing session', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ho-'));
  try {
    const result = await readHandoffPacket(root, 'nonexistent-session');
    assert.equal(result, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renderHandoffInjection produces compact markdown', () => {
  const packet = normalizeHandoffPacket({
    fromSessionId: 'session-a',
    agentType: 'claude-code',
    role: 'implementer',
    intent: 'build feature X',
    progress: '50% done',
    nextActions: ['finish tests', 'commit'],
    blockers: ['CI is down'],
    confidence: 'medium',
  });

  const md = renderHandoffInjection(packet);
  assert.match(md, /## Handoff from session-a/);
  assert.match(md, /build feature X/);
  assert.match(md, /50% done/);
  assert.match(md, /finish tests/);
  assert.match(md, /CI is down/);
  assert.match(md, /medium/);
});

test('renderHandoffInjection returns empty string for null input', () => {
  assert.equal(renderHandoffInjection(null), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/handoff.test.mjs`
Expected: FAIL — `handoff.mjs` does not exist

- [ ] **Step 3: Write handoff.mjs implementation**

```javascript
// scripts/lib/contextdb/handoff.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HANDOFF_FILENAME = 'handoff.json';
const VALID_AGENT_TYPES = ['claude-code', 'codex', 'gemini', 'codex-cli', 'gemini-cli', 'opencode-cli'];
const VALID_ROLES = ['planner', 'implementer', 'reviewer', 'orchestrator'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];

function normalizeStringArray(value) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split('|') : [];
  return [...new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeWorkspaceDiffArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((d) => d && typeof d === 'object')
    .map((d) => ({
      file: normalizeText(d.file),
      operation: ['create', 'update', 'delete'].includes(d.operation) ? d.operation : 'update',
      summary: normalizeText(d.summary),
    }))
    .filter((d) => d.file);
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function sessionDir(workspaceRoot, sessionId) {
  return path.join(
    path.resolve(workspaceRoot || process.cwd()),
    'memory',
    'context-db',
    'sessions',
    normalizeText(sessionId)
  );
}

export function normalizeHandoffPacket(input = {}) {
  const agentType = normalizeText(input.agentType, 'claude-code');
  if (!VALID_AGENT_TYPES.includes(agentType)) {
    throw new Error(`Invalid agentType: ${agentType}. Must be one of: ${VALID_AGENT_TYPES.join(', ')}`);
  }

  const role = normalizeText(input.role, 'implementer');
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
  }

  const confidence = normalizeText(input.confidence, 'medium');
  if (!VALID_CONFIDENCE.includes(confidence)) {
    throw new Error(`Invalid confidence: ${confidence}. Must be one of: ${VALID_CONFIDENCE.join(', ')}`);
  }

  return {
    schemaVersion: 2,
    fromAgent: {
      sessionId: normalizeText(input.fromSessionId),
      agentType,
      role,
    },
    intent: normalizeText(input.intent),
    progress: normalizeText(input.progress),
    nextActions: normalizeStringArray(input.nextActions),
    blockers: normalizeStringArray(input.blockers),
    touchedFiles: normalizeStringArray(input.touchedFiles),
    workspaceChanges: normalizeWorkspaceDiffArray(input.workspaceChanges),
    pendingWrites: normalizeStringArray(input.pendingWrites),
    confidence,
    assumptions: normalizeStringArray(input.assumptions),
    updatedAt: new Date().toISOString(),
  };
}

export async function writeHandoffPacket(workspaceRoot, sessionId, packet) {
  const dir = sessionDir(workspaceRoot, sessionId);
  const filePath = path.join(dir, HANDOFF_FILENAME);
  await writeAtomicFile(filePath, `${JSON.stringify(packet, null, 2)}\n`);
  return { ...packet, filePath };
}

export async function readHandoffPacket(workspaceRoot, sessionId) {
  const dir = sessionDir(workspaceRoot, sessionId);
  const filePath = path.join(dir, HANDOFF_FILENAME);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function renderHandoffInjection(packet) {
  if (!packet) return '';
  const p = normalizeHandoffPacket(packet);
  const lines = [
    `## Handoff from ${p.fromAgent.sessionId}`,
    '',
    `- **Role:** ${p.fromAgent.role} (${p.fromAgent.agentType})`,
    `- **Confidence:** ${p.confidence}`,
    `- **Intent:** ${p.intent}`,
    '',
    '### Progress',
    p.progress,
    '',
  ];
  if (p.nextActions.length > 0) {
    lines.push('### Next Actions');
    for (const a of p.nextActions) lines.push(`- ${a}`);
    lines.push('');
  }
  if (p.blockers.length > 0) {
    lines.push('### Blockers');
    for (const b of p.blockers) lines.push(`- ${b}`);
    lines.push('');
  }
  if (p.assumptions.length > 0) {
    lines.push('### Assumptions to Verify');
    for (const a of p.assumptions) lines.push(`- ${a}`);
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/handoff.test.mjs`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/handoff.mjs scripts/tests/handoff.test.mjs
git commit -m "feat(memory): add HandoffPacket v2 for agent-to-agent context transfer"
```

---

## Task 5: Conflict Marker Writer

**Files:**
- Modify: `scripts/lib/contextdb/workspace.mjs` — add conflict marker functions
- Test: `scripts/tests/workspace.test.mjs` — add conflict tests

- [ ] **Step 1: Write the failing test for conflict markers**

Append to `scripts/tests/workspace.test.mjs`:

```javascript
import {
  initWorkspace,
  readWorkspaceMeta,
  writeWorkspaceMeta,
  writeKnowledgeSnapshot,
  readKnowledgeSnapshot,
  writeConflictMarker,
  readConflictMarkers,
  workspaceDir,
} from '../lib/contextdb/workspace.mjs';

test('writeConflictMarker creates a conflict file and readConflictMarkers lists it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    await initWorkspace(root);
    const conflict = {
      file: 'workspace/active-skills.json',
      expectedVersion: 1,
      actualVersion: 2,
      attemptedBy: 'session-1',
      attemptedAt: new Date().toISOString(),
    };

    await writeConflictMarker(root, conflict);
    const markers = await readConflictMarkers(root);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].file, 'workspace/active-skills.json');
    assert.equal(markers[0].expectedVersion, 1);
    assert.equal(markers[0].actualVersion, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readConflictMarkers returns empty array when no conflicts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    const markers = await readConflictMarkers(root);
    assert.deepEqual(markers, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: FAIL — `writeConflictMarker` is not exported

- [ ] **Step 3: Add conflict marker functions to workspace.mjs**

Append to `scripts/lib/contextdb/workspace.mjs`:

```javascript
const CONFLICTS_DIRNAME = 'conflicts';

function conflictsDir(workspaceRoot) {
  return path.join(workspaceDir(workspaceRoot), CONFLICTS_DIRNAME);
}

export async function writeConflictMarker(workspaceRoot, conflict) {
  const dir = conflictsDir(workspaceRoot);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${timestamp}.json`);
  await writeAtomicFile(filePath, `${JSON.stringify({
    ...conflict,
    detectedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  return filePath;
}

export async function readConflictMarkers(workspaceRoot) {
  const dir = conflictsDir(workspaceRoot);
  try {
    const entries = await fs.readdir(dir);
    const markers = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, entry), 'utf8');
        markers.push(JSON.parse(raw));
      } catch {
        // skip unreadable
      }
    }
    return markers;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/workspace.mjs scripts/tests/workspace.test.mjs
git commit -m "feat(memory): add conflict marker write/read for optimistic lock failures"
```

---

## Task 6: Memory Doctor

**Files:**
- Create: `scripts/lib/contextdb/doctor.mjs`
- Test: `scripts/tests/doctor.test.mjs`

- [ ] **Step 1: Write the failing test for memory doctor**

```javascript
// scripts/tests/doctor.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runDoctorChecks } from '../lib/contextdb/doctor.mjs';

test('runDoctorChecks reports healthy for initialized workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-doc-'));
  try {
    // Create workspace meta
    const wsDir = path.join(root, 'memory', 'workspace');
    await mkdir(wsDir, { recursive: true });
    await writeFile(
      path.join(wsDir, 'meta.json'),
      JSON.stringify({ schemaVersion: 1, workspaceVersion: 1, lastUpdatedAt: new Date().toISOString(), lastUpdatedBy: '', projectName: 'aios' }, null, 2)
    );

    const report = await runDoctorChecks(root);
    assert.equal(report.status, 'healthy');
    assert.ok(report.checks.length > 0);
    assert.ok(report.checks.every((c) => c.status === 'pass'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runDoctorChecks reports warning when workspace is not initialized', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-doc-'));
  try {
    const report = await runDoctorChecks(root);
    assert.equal(report.status, 'warning');
    assert.ok(report.checks.some((c) => c.id === 'workspace-meta' && c.status === 'fail'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runDoctorChecks detects skill index drift', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-doc-'));
  try {
    // Create workspace meta
    const wsDir = path.join(root, 'memory', 'workspace');
    await mkdir(wsDir, { recursive: true });
    await writeFile(
      path.join(wsDir, 'meta.json'),
      JSON.stringify({ schemaVersion: 1, workspaceVersion: 1, lastUpdatedAt: new Date().toISOString(), lastUpdatedBy: '', projectName: 'aios' }, null, 2)
    );

    // Create a skill file
    const skillsDir = path.join(root, 'memory', 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(
      path.join(skillsDir, 'test.json'),
      JSON.stringify({ skill_name: 'Test', description: 'Test skill', trigger_keywords: ['test'] }, null, 2)
    );

    // Create empty skill index (drift: 1 skill in dir, 0 in index)
    await writeFile(
      path.join(wsDir, 'active-skills.json'),
      JSON.stringify({ skills: [] }, null, 2)
    );

    const report = await runDoctorChecks(root);
    assert.ok(report.checks.some((c) => c.id === 'skill-index-drift' && c.status === 'warn'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runDoctorChecks detects conflict markers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-doc-'));
  try {
    const wsDir = path.join(root, 'memory', 'workspace');
    const conflictDir = path.join(wsDir, 'conflicts');
    await mkdir(conflictDir, { recursive: true });
    await writeFile(
      path.join(wsDir, 'meta.json'),
      JSON.stringify({ schemaVersion: 1, workspaceVersion: 1, lastUpdatedAt: new Date().toISOString(), lastUpdatedBy: '', projectName: 'aios' }, null, 2)
    );
    await writeFile(
      path.join(conflictDir, '2026-05-10T12-00-00-000Z.json'),
      JSON.stringify({ file: 'test', expectedVersion: 1, actualVersion: 2 }, null, 2)
    );

    const report = await runDoctorChecks(root);
    assert.ok(report.checks.some((c) => c.id === 'conflict-markers' && c.status === 'warn'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/doctor.test.mjs`
Expected: FAIL — `doctor.mjs` does not exist

- [ ] **Step 3: Write doctor.mjs implementation**

```javascript
// scripts/lib/contextdb/doctor.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { workspaceDir } from './workspace.mjs';
import { readConflictMarkers } from './workspace.mjs';

function makeCheck(id, label) {
  return { id, label, status: 'pass', detail: '' };
}

async function checkWorkspaceMeta(workspaceRoot) {
  const check = makeCheck('workspace-meta', 'Workspace meta.json exists and valid');
  try {
    const metaPath = path.join(workspaceDir(workspaceRoot), 'meta.json');
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw);
    if (!meta.schemaVersion || !meta.workspaceVersion) {
      check.status = 'fail';
      check.detail = 'meta.json missing required fields';
    }
  } catch {
    check.status = 'fail';
    check.detail = 'workspace not initialized — run initWorkspace()';
  }
  return check;
}

async function checkSkillIndexDrift(workspaceRoot) {
  const check = makeCheck('skill-index-drift', 'Skill index matches skills directory');
  const skillsDir = path.join(path.resolve(workspaceRoot || process.cwd()), 'memory', 'skills');
  const indexPath = path.join(workspaceDir(workspaceRoot), 'active-skills.json');

  let diskCount = 0;
  let indexCount = 0;

  try {
    const entries = await fs.readdir(skillsDir);
    diskCount = entries.filter((e) => e.endsWith('.json')).length;
  } catch {
    diskCount = 0;
  }

  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const index = JSON.parse(raw);
    indexCount = Array.isArray(index.skills) ? index.skills.length : 0;
  } catch {
    indexCount = 0;
  }

  if (diskCount !== indexCount) {
    check.status = 'warn';
    check.detail = `Drift: ${diskCount} skill files on disk, ${indexCount} in index. Run buildSkillIndex() to sync.`;
  }
  return check;
}

async function checkConflictMarkers(workspaceRoot) {
  const check = makeCheck('conflict-markers', 'No unresolved conflict markers');
  const markers = await readConflictMarkers(workspaceRoot);
  if (markers.length > 0) {
    check.status = 'warn';
    check.detail = `${markers.length} unresolved conflict(s) in workspace/conflicts/. Manual resolution required.`;
  }
  return check;
}

export async function runDoctorChecks(workspaceRoot) {
  const checks = await Promise.all([
    checkWorkspaceMeta(workspaceRoot),
    checkSkillIndexDrift(workspaceRoot),
    checkConflictMarkers(workspaceRoot),
  ]);

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const status = hasFail ? 'unhealthy' : hasWarn ? 'warning' : 'healthy';

  return { status, checks, runAt: new Date().toISOString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/doctor.test.mjs`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/doctor.mjs scripts/tests/doctor.test.mjs
git commit -m "feat(memory): add memory doctor for workspace consistency checks"
```

---

## Task 7: Workspace Init CLI Command

**Files:**
- Modify: `scripts/ctx-agent-core.mjs` — add `workspace-init`, `workspace-sync`, `workspace-doctor` subcommands

- [ ] **Step 1: Find the subcommand dispatch section in ctx-agent-core.mjs**

The file is large (~2146 lines). Search for the command routing section (typically a `switch` or `if/else` chain on `process.argv` or parsed args). Identify where to add new workspace commands.

- [ ] **Step 2: Add workspace-init command**

Add a `workspace-init` command that calls `initWorkspace()` and `buildSkillIndex()` + `writeSkillIndex()`:

```javascript
// Inside the command dispatch, add:
case 'workspace-init': {
  const { initWorkspace } = await import('./lib/contextdb/workspace.mjs');
  const { buildSkillIndex, writeSkillIndex } = await import('./lib/contextdb/skill-index.mjs');
  const result = await initWorkspace(workspaceRoot);
  const index = await buildSkillIndex(workspaceRoot);
  await writeSkillIndex(workspaceRoot, index);
  console.log(JSON.stringify({ ...result, skillCount: index.skills.length }, null, 2));
  break;
}
```

- [ ] **Step 3: Add workspace-sync command**

```javascript
case 'workspace-sync': {
  const { buildSkillIndex, writeSkillIndex } = await import('./lib/contextdb/skill-index.mjs');
  const index = await buildSkillIndex(workspaceRoot);
  await writeSkillIndex(workspaceRoot, index);
  console.log(JSON.stringify({ synced: index.skills.length }, null, 2));
  break;
}
```

- [ ] **Step 4: Add workspace-doctor command**

```javascript
case 'workspace-doctor': {
  const { runDoctorChecks } = await import('./lib/contextdb/doctor.mjs');
  const report = await runDoctorChecks(workspaceRoot);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'healthy') process.exitCode = 1;
  break;
}
```

- [ ] **Step 5: Test CLI commands manually**

```bash
node scripts/ctx-agent-core.mjs workspace-init
node scripts/ctx-agent-core.mjs workspace-sync
node scripts/ctx-agent-core.mjs workspace-doctor
```

Expected: JSON output for each command, doctor exits 0

- [ ] **Step 6: Commit**

```bash
git add scripts/ctx-agent-core.mjs
git commit -m "feat(memory): add workspace-init, workspace-sync, workspace-doctor CLI commands"
```

---

## Task 8: Workspace Bootstrap in ctx-agent Session Init

**Files:**
- Modify: `scripts/ctx-agent-core.mjs` — add workspace bootstrap to session initialization

- [ ] **Step 1: Find the session initialization section**

Locate where `init` or session creation happens in `ctx-agent-core.mjs`. This is where the session meta.json and state.json are created.

- [ ] **Step 2: Add workspace init + doctor call at session startup**

After session initialization, add workspace bootstrap:

```javascript
// After session init, bootstrap workspace
const { initWorkspace } = await import('./lib/contextdb/workspace.mjs');
const { readSkillIndex } = await import('./lib/contextdb/skill-index.mjs');
const wsResult = await initWorkspace(workspaceRoot);
if (wsResult.created) {
  const { buildSkillIndex, writeSkillIndex } = await import('./lib/contextdb/skill-index.mjs');
  const index = await buildSkillIndex(workspaceRoot);
  await writeSkillIndex(workspaceRoot, index);
}
```

- [ ] **Step 3: Add handoff packet read at session startup**

After workspace bootstrap, attempt to load the previous session's handoff:

```javascript
const { readHandoffPacket } = await import('./lib/contextdb/handoff.mjs');
const previousHandoff = latestPreviousSessionId
  ? await readHandoffPacket(workspaceRoot, latestPreviousSessionId)
  : null;
// Include previousHandoff in context injection if present
```

- [ ] **Step 4: Add handoff packet write at session end**

At the checkpoint/session-end section, write a handoff packet:

```javascript
const { normalizeHandoffPacket, writeHandoffPacket } = await import('./lib/contextdb/handoff.mjs');
const packet = normalizeHandoffPacket({
  fromSessionId: sessionId,
  agentType: agent,
  role: routeRole || 'implementer',
  intent: goal,
  progress: lastCheckpointSummary || '',
  nextActions: continuityNextActions || [],
  touchedFiles: extractedTouchedFiles || [],
  blockers: [],
  confidence: 'medium',
});
await writeHandoffPacket(workspaceRoot, sessionId, packet);
```

- [ ] **Step 5: Test end-to-end session flow**

```bash
node scripts/ctx-agent-core.mjs --agent claude-code --goal "test workspace integration" --dry-run
```

Verify that:
1. `memory/workspace/meta.json` is created
2. `memory/workspace/active-skills.json` is created with skill summaries
3. Session `handoff.json` is created in the session directory

- [ ] **Step 6: Commit**

```bash
git add scripts/ctx-agent-core.mjs
git commit -m "feat(memory): integrate workspace bootstrap and handoff into session lifecycle"
```

---

## Task 9: Agent View Assembly

**Files:**
- Modify: `scripts/lib/contextdb/workspace.mjs` — add `buildAgentView` function
- Test: `scripts/tests/workspace.test.mjs` — add agent view tests

- [ ] **Step 1: Write the failing test for buildAgentView**

Append to `scripts/tests/workspace.test.mjs`:

```javascript
import {
  initWorkspace,
  readWorkspaceMeta,
  writeWorkspaceMeta,
  writeKnowledgeSnapshot,
  readKnowledgeSnapshot,
  writeConflictMarker,
  readConflictMarkers,
  buildAgentView,
  workspaceDir,
} from '../lib/contextdb/workspace.mjs';

test('buildAgentView assembles view from workspace and session data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    await initWorkspace(root);
    const { writeSkillIndex } = await import('../lib/contextdb/skill-index.mjs');
    await writeSkillIndex(root, { skills: [{ name: '发布笔记', file: 'memory/skills/发布笔记.json', keywords: ['发布'], taskTypes: ['content-publish'], version: 1 }] });

    const view = await buildAgentView(root, 'test-session', 'content-publish');
    assert.equal(view.sessionId, 'test-session');
    assert.equal(view.workspaceVersion, 1);
    assert.ok(typeof view.projectContext === 'string');
    assert.equal(view.relevantSkills.length, 1);
    assert.equal(view.relevantSkills[0].name, '发布笔记');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildAgentView with missing workspace returns default view', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-ws-'));
  try {
    const view = await buildAgentView(root, 'test-session');
    assert.equal(view.sessionId, 'test-session');
    assert.equal(view.workspaceVersion, 0);
    assert.deepEqual(view.relevantSkills, []);
    assert.equal(view.continuity, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: FAIL — `buildAgentView` is not exported

- [ ] **Step 3: Add buildAgentView to workspace.mjs**

Append to `scripts/lib/contextdb/workspace.mjs`:

```javascript
import { readSkillIndex, findSkillsByTaskType, findSkillsByKeywords } from './skill-index.mjs';
import { readHandoffPacket } from './handoff.mjs';

export async function buildAgentView(workspaceRoot, sessionId, taskType = '') {
  let meta;
  let projectContext = '';

  try {
    meta = await readWorkspaceMeta(workspaceRoot);
    const contextPath = path.join(workspaceDir(workspaceRoot), 'project-context.md');
    try {
      projectContext = await fs.readFile(contextPath, 'utf8');
    } catch {
      projectContext = '';
    }
  } catch {
    return {
      sessionId,
      workspaceVersion: 0,
      projectContext: '',
      relevantSkills: [],
      activeTasks: [],
      continuity: null,
    };
  }

  const index = await readSkillIndex(workspaceRoot);
  const relevantSkills = taskType
    ? findSkillsByTaskType(index, taskType)
    : index.skills;

  let continuity = null;
  try {
    const sessionsDir = path.join(path.resolve(workspaceRoot), 'memory', 'context-db', 'sessions');
    const entries = await fs.readdir(sessionsDir);
    let latestSessionId = '';
    let latestMtime = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(sessionsDir, entry.name, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const m = JSON.parse(raw);
        const mtime = new Date(m.updated_at || m.updatedAt || m.created_at || m.createdAt || 0).getTime();
        if (mtime > latestMtime && entry.name !== sessionId) {
          latestMtime = mtime;
          latestSessionId = entry.name;
        }
      } catch {
        // skip
      }
    }
    if (latestSessionId) {
      continuity = await readHandoffPacket(workspaceRoot, latestSessionId);
    }
  } catch {
    // no sessions
  }

  return {
    sessionId,
    workspaceVersion: meta.workspaceVersion,
    projectContext,
    relevantSkills,
    activeTasks: [],
    continuity,
  };
}
```

Note: Move the existing `import { readSkillIndex, ... } from './skill-index.mjs'` to the top of the file, or use a dynamic import pattern. Since `skill-index.mjs` imports `workspaceDir` from `workspace.mjs`, use dynamic import to avoid circular dependency:

```javascript
export async function buildAgentView(workspaceRoot, sessionId, taskType = '') {
  let meta;
  let projectContext = '';

  try {
    meta = await readWorkspaceMeta(workspaceRoot);
    const contextPath = path.join(workspaceDir(workspaceRoot), 'project-context.md');
    try {
      projectContext = await fs.readFile(contextPath, 'utf8');
    } catch {
      projectContext = '';
    }
  } catch {
    return {
      sessionId,
      workspaceVersion: 0,
      projectContext: '',
      relevantSkills: [],
      activeTasks: [],
      continuity: null,
    };
  }

  const { readSkillIndex, findSkillsByTaskType } = await import('./skill-index.mjs');
  const { readHandoffPacket } = await import('./handoff.mjs');

  const index = await readSkillIndex(workspaceRoot);
  const relevantSkills = taskType
    ? findSkillsByTaskType(index, taskType)
    : index.skills;

  let continuity = null;
  try {
    const sessionsDir = path.join(path.resolve(workspaceRoot), 'memory', 'context-db', 'sessions');
    const entries = await fs.readdir(sessionsDir);
    let latestSessionId = '';
    let latestMtime = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(sessionsDir, entry.name, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const m = JSON.parse(raw);
        const mtime = new Date(m.updated_at || m.updatedAt || m.created_at || m.createdAt || 0).getTime();
        if (mtime > latestMtime && entry.name !== sessionId) {
          latestMtime = mtime;
          latestSessionId = entry.name;
        }
      } catch {
        // skip
      }
    }
    if (latestSessionId) {
      continuity = await readHandoffPacket(workspaceRoot, latestSessionId);
    }
  } catch {
    // no sessions
  }

  return {
    sessionId,
    workspaceVersion: meta.workspaceVersion,
    projectContext,
    relevantSkills,
    activeTasks: [],
    continuity,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/tests/workspace.test.mjs`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/contextdb/workspace.mjs scripts/tests/workspace.test.mjs
git commit -m "feat(memory): add buildAgentView for tiered agent context assembly"
```

---

## Task 10: Integration Test — Full Session Lifecycle

**Files:**
- Create: `scripts/tests/workspace-integration.test.mjs`

- [ ] **Step 1: Write integration test**

```javascript
// scripts/tests/workspace-integration.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { initWorkspace, writeWorkspaceMeta, buildAgentView } from '../lib/contextdb/workspace.mjs';
import { buildSkillIndex, writeSkillIndex } from '../lib/contextdb/skill-index.mjs';
import { normalizeHandoffPacket, writeHandoffPacket } from '../lib/contextdb/handoff.mjs';
import { runDoctorChecks } from '../lib/contextdb/doctor.mjs';

test('full lifecycle: two agents share workspace and handoff', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-integ-'));
  try {
    // Setup: create skills directory with test skill
    const skillsDir = path.join(root, 'memory', 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, '发布笔记.json'), JSON.stringify({
      skill_name: '发布小红书笔记',
      description: '发布流程',
      trigger_keywords: ['发布', '笔记'],
    }));

    // Agent A: init workspace + build skill index
    await initWorkspace(root);
    const index = await buildSkillIndex(root);
    await writeSkillIndex(root, index);

    // Agent A: create session + handoff
    const sessionADir = path.join(root, 'memory', 'context-db', 'sessions', 'agent-a-session');
    await mkdir(sessionADir, { recursive: true });
    await writeFile(path.join(sessionADir, 'meta.json'), JSON.stringify({
      sessionId: 'agent-a-session',
      agent: 'claude-code',
      status: 'done',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const packet = normalizeHandoffPacket({
      fromSessionId: 'agent-a-session',
      agentType: 'claude-code',
      role: 'planner',
      intent: 'design memory optimization',
      progress: 'design complete',
      nextActions: ['implement workspace layer'],
      touchedFiles: ['docs/design.md'],
      confidence: 'high',
    });
    await writeHandoffPacket(root, 'agent-a-session', packet);

    // Agent B: start, read workspace + handoff from Agent A
    const sessionBDir = path.join(root, 'memory', 'context-db', 'sessions', 'agent-b-session');
    await mkdir(sessionBDir, { recursive: true });
    await writeFile(path.join(sessionBDir, 'meta.json'), JSON.stringify({
      sessionId: 'agent-b-session',
      agent: 'claude-code',
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const view = await buildAgentView(root, 'agent-b-session');
    assert.equal(view.workspaceVersion, 1);
    assert.ok(view.relevantSkills.length >= 1);
    assert.ok(view.continuity !== null);
    assert.equal(view.continuity.intent, 'design memory optimization');
    assert.deepEqual(view.continuity.nextActions, ['implement workspace layer']);

    // Run doctor
    const report = await runDoctorChecks(root);
    assert.equal(report.status, 'healthy');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run integration test**

Run: `node --test scripts/tests/workspace-integration.test.mjs`
Expected: PASS

- [ ] **Step 3: Run all tests together**

Run: `node --test scripts/tests/workspace.test.mjs scripts/tests/skill-index.test.mjs scripts/tests/handoff.test.mjs scripts/tests/doctor.test.mjs scripts/tests/workspace-integration.test.mjs`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/workspace-integration.test.mjs
git commit -m "test(memory): add full lifecycle integration test for workspace + handoff"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Each design section (1-5) maps to a task: Section 1 (workspace) → Tasks 1, 3, 5; Section 2 (agent view) → Task 9; Section 3 (handoff) → Task 4; Section 4 (skill index) → Task 2; Section 5 (doctor) → Task 6
- [x] **Placeholder scan:** No TBD/TODO placeholders; all code blocks are complete
- [x] **Type consistency:** `normalizeHandoffPacket` uses `fromSessionId` param → `fromAgent.sessionId` field; `writeHandoffPacket` takes `(root, sessionId, packet)` consistently; `buildAgentView` returns same fields everywhere
