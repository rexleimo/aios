import { test } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSkillIndex,
  writeSkillIndex,
  readSkillIndex,
  findSkillsByKeywords,
  findSkillsByTaskType
} from '../lib/contextdb/skill-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, '..', '..', 'temp', 'skill-index-test');

async function setupTestDir() {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(path.join(testDir, '.codex', 'skills'), { recursive: true });
  await fs.mkdir(path.join(testDir, '.aios', 'workspace'), { recursive: true });
}

async function teardownTestDir() {
  await fs.rm(testDir, { recursive: true, force: true });
}

test('buildSkillIndex extracts skill summaries', async () => {
  await setupTestDir();

  await fs.mkdir(path.join(testDir, '.codex', 'skills', 'publish-note'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.codex', 'skills', 'publish-note', 'SKILL.md'), `---
name: publish笔记
description: "发布流程。TRIGGER: 发布, 笔记"
version: 1.0.0
---
# publish笔记
`);

  await fs.mkdir(path.join(testDir, '.codex', 'skills', 'interaction-ops'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.codex', 'skills', 'interaction-ops', 'SKILL.md'), `---
name: 互动操作
description: "互动流程。TRIGGER: 点赞, 评论, 关注"
version: 2.0.0
---
# 互动操作
`);

  const index = await buildSkillIndex(testDir);

  assert.strictEqual(index.skills.length, 2);
  assert.strictEqual(index.skills[0].name, 'publish笔记');
  assert.strictEqual(index.skills[0].version, '1.0.0');
  assert.deepStrictEqual(index.skills[0].keywords, ['发布', '笔记']);
  assert.strictEqual(index.skills[0].file, '.codex/skills/publish-note/SKILL.md');
  assert.strictEqual(index.skills[1].name, '互动操作');

  await teardownTestDir();
});

test('buildSkillIndex skips malformed legacy files', async () => {
  await setupTestDir();
  await fs.mkdir(path.join(testDir, 'memory', 'skills'), { recursive: true });

  await fs.writeFile(
    path.join(testDir, 'memory', 'skills', 'good.json'),
    JSON.stringify({ name: 'good', version: '1.0.0' })
  );
  await fs.writeFile(
    path.join(testDir, 'memory', 'skills', 'bad.json'),
    'invalid json {'
  );
  await fs.writeFile(
    path.join(testDir, 'memory', 'skills', 'readme.txt'),
    'not a skill'
  );

  const index = await buildSkillIndex(testDir);

  assert.strictEqual(index.skills.length, 1);
  assert.strictEqual(index.skills[0].name, 'good');

  await teardownTestDir();
});

test('buildSkillIndex prefers discoverable project skills over legacy JSON duplicates', async () => {
  await setupTestDir();
  await fs.mkdir(path.join(testDir, '.codex', 'skills', 'good'), { recursive: true });
  await fs.writeFile(path.join(testDir, '.codex', 'skills', 'good', 'SKILL.md'), `---
name: good
description: "modern skill"
---
# good
`);

  await fs.mkdir(path.join(testDir, 'memory', 'skills'), { recursive: true });
  await fs.writeFile(
    path.join(testDir, 'memory', 'skills', 'good.json'),
    JSON.stringify({ name: 'good', version: '0.1.0', trigger_keywords: ['legacy'] })
  );

  const index = await buildSkillIndex(testDir);

  assert.strictEqual(index.skills.length, 1);
  assert.strictEqual(index.skills[0].file, '.codex/skills/good/SKILL.md');
  assert.strictEqual(index.skills[0].source, 'skill');

  await teardownTestDir();
});

test('writeSkillIndex and readSkillIndex round-trip', async () => {
  await setupTestDir();

  const originalIndex = {
    skills: [
      { name: 'skill1', file: 'skill1.json', keywords: ['a'], taskTypes: [], version: '1.0.0', lastUsed: null },
      { name: 'skill2', file: 'skill2.json', keywords: ['b', 'c'], taskTypes: ['xhs'], version: '2.0.0', lastUsed: null }
    ]
  };

  await writeSkillIndex(testDir, originalIndex);

  const readIndex = await readSkillIndex(testDir);

  assert.deepStrictEqual(readIndex, originalIndex);
  await fs.stat(path.join(testDir, '.aios', 'workspace', 'active-skills.json'));
  await assert.rejects(() => fs.stat(path.join(testDir, 'memory', 'workspace', 'active-skills.json')));

  await teardownTestDir();
});

test('findSkillsByKeywords matches case-insensitively', async () => {
  const index = {
    skills: [
      { name: 'publish笔记', keywords: ['发布', '笔记'], taskTypes: [], version: '1.0.0', lastUsed: null },
      { name: '互动操作', keywords: ['点赞', '评论'], taskTypes: [], version: '1.0.0', lastUsed: null },
      { name: '内容分析', keywords: ['分析', '内容'], taskTypes: [], version: '1.0.0', lastUsed: null }
    ]
  };

  const result1 = findSkillsByKeywords(index, ['发布']);
  assert.strictEqual(result1.length, 1);
  assert.strictEqual(result1[0].name, 'publish笔记');

  const result2 = findSkillsByKeywords(index, ['分析']);
  assert.strictEqual(result2.length, 1);
  assert.strictEqual(result2[0].name, '内容分析');

  const result3 = findSkillsByKeywords(index, ['点赞', '分析']);
  assert.strictEqual(result3.length, 2);
});

test('findSkillsByTaskType matches case-insensitively', async () => {
  const index = {
    skills: [
      { name: 'skill1', keywords: [], taskTypes: ['xhs', 'browser'], version: '1.0.0', lastUsed: null },
      { name: 'skill2', keywords: [], taskTypes: ['api'], version: '1.0.0', lastUsed: null },
      { name: 'skill3', keywords: [], taskTypes: ['XHS', 'image'], version: '1.0.0', lastUsed: null }
    ]
  };

  const result1 = findSkillsByTaskType(index, 'xhs');
  assert.strictEqual(result1.length, 2);

  const result2 = findSkillsByTaskType(index, 'XHS');
  assert.strictEqual(result2.length, 2);

  const result3 = findSkillsByTaskType(index, 'api');
  assert.strictEqual(result3.length, 1);
  assert.strictEqual(result3[0].name, 'skill2');

  const result4 = findSkillsByTaskType(index, 'nonexistent');
  assert.strictEqual(result4.length, 0);
});
