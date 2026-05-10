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
  await fs.mkdir(path.join(testDir, 'memory', 'skills'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'memory', 'workspace'), { recursive: true });
}

async function teardownTestDir() {
  await fs.rm(testDir, { recursive: true, force: true });
}

test('buildSkillIndex extracts skill summaries', async () => {
  await setupTestDir();

  const skill1 = {
    name: 'publish笔记',
    version: '1.0.0',
    trigger_keywords: ['发布', '笔记']
  };

  const skill2 = {
    skill_name: '互动操作',
    version: '2.0.0',
    trigger_keywords: ['点赞', '评论', '关注']
  };

  await fs.writeFile(
    path.join(testDir, 'memory', 'skills', 'publish笔记.json'),
    JSON.stringify(skill1)
  );
  await fs.writeFile(
    path.join(testDir, 'memory', 'skills', '互动操作.json'),
    JSON.stringify(skill2)
  );

  const index = await buildSkillIndex(testDir);

  assert.strictEqual(index.skills.length, 2);
  assert.strictEqual(index.skills[0].name, 'publish笔记');
  assert.strictEqual(index.skills[0].version, '1.0.0');
  assert.deepStrictEqual(index.skills[0].keywords, ['发布', '笔记']);
  assert.strictEqual(index.skills[1].name, '互动操作');

  await teardownTestDir();
});

test('buildSkillIndex skips malformed files', async () => {
  await setupTestDir();

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
