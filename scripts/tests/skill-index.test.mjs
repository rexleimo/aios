/* 中文注释：Skill 索引测试验证触发词和跨客户端同步，防止路由退化成 prompt-only。 */
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
const testRoot = path.join(__dirname, '..', '..', 'temp');

async function setupTestDir() {
  await fs.mkdir(testRoot, { recursive: true });
  const testDir = await fs.mkdtemp(path.join(testRoot, 'skill-index-test-'));
  await fs.mkdir(path.join(testDir, '.codex', 'skills'), { recursive: true });
  await fs.mkdir(path.join(testDir, '.aios', 'workspace'), { recursive: true });
  return testDir;
}

async function teardownTestDir(testDir) {
  await fs.rm(testDir, { recursive: true, force: true });
}

test('buildSkillIndex extracts skill summaries', async () => {
  const testDir = await setupTestDir();
  try {
    await fs.mkdir(path.join(testDir, '.codex', 'skills', 'publish-note'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.codex', 'skills', 'publish-note', 'SKILL.md'), `---
name: publish笔记
description: "发布流程 TRIGGER: 发布, 笔记"
version: 1.0.0
---
# publish笔记
`);

    await fs.mkdir(path.join(testDir, '.codex', 'skills', 'interaction-ops'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.codex', 'skills', 'interaction-ops', 'SKILL.md'), `---
name: 互动操作
description: "互动流程 TRIGGER: 点赞, 评论, 关注"
version: 2.0.0
---
# 互动操作
`);

    const index = await buildSkillIndex(testDir);

    assert.strictEqual(index.skills.length, 2);
    const publishSkill = index.skills.find((skill) => skill.file === '.codex/skills/publish-note/SKILL.md');
    const interactionSkill = index.skills.find((skill) => skill.file === '.codex/skills/interaction-ops/SKILL.md');
    assert.ok(publishSkill);
    assert.ok(interactionSkill);
    assert.strictEqual(publishSkill.name, 'publish笔记');
    assert.strictEqual(publishSkill.version, '1.0.0');
    assert.deepStrictEqual(publishSkill.keywords, ['发布', '笔记']);
    assert.strictEqual(interactionSkill.name, '互动操作');
  } finally {
    await teardownTestDir(testDir);
  }
});

test('buildSkillIndex skips malformed legacy files', async () => {
  const testDir = await setupTestDir();
  try {
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
  } finally {
    await teardownTestDir(testDir);
  }
});

test('buildSkillIndex prefers discoverable project skills over legacy JSON duplicates', async () => {
  const testDir = await setupTestDir();
  try {
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
  } finally {
    await teardownTestDir(testDir);
  }
});

test('writeSkillIndex and readSkillIndex round-trip', async () => {
  const testDir = await setupTestDir();
  try {
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
  } finally {
    await teardownTestDir(testDir);
  }
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
