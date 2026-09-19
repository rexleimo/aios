/* 中文注释：客户端列表的防漂移契约。这些断言是“新增客户端只改 CLIENT_DEFINITIONS
   一处”这个不变量的执行面：派生列表的成员集合必须等于注册表，显式 priority 列表
   只允许表达顺序，写错名字必须在这里失败，而不是在运行时被静默过滤掉。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ALL_CLIENTS,
  CAPABILITY_CLIENT_ORDER,
  CLIENT_CAPABILITIES,
  CLIENT_DEFINITIONS,
  getClientInstructionFileName,
  orderByPriority,
} from '../lib/clients/registry.mjs';
import { CLIENT_ORDER } from '../lib/interception/clients/capabilities.mjs';
import { CLIENT_INSTRUCTION_FILES } from '../lib/components/codemap/constants.mjs';
import { AGENTS_MD_COWRITERS } from '../lib/native/emitters/shared.mjs';
import { EMITTERS } from '../lib/native/sync/constants.mjs';
import { readSkillFrontmatter } from '../lib/skills/frontmatter.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NON_CLI_HOST_IDS = Object.freeze(['aios-harness', 'cursor', 'generic-mcp']);
const SKILL_SURFACES = Object.freeze(['agents']);

function membersWithCapability(capability) {
  return ALL_CLIENTS.filter((client) => CLIENT_DEFINITIONS[client].capabilities.includes(capability));
}

test('capability order membership is derived from each client capability declaration', () => {
  for (const capability of CLIENT_CAPABILITIES) {
    const ordered = CAPABILITY_CLIENT_ORDER[capability];
    assert.ok(Array.isArray(ordered), `${capability} must have an ordered client list`);
    assert.deepEqual(
      [...ordered].sort(),
      membersWithCapability(capability).sort(),
      `${capability} order must contain exactly the clients declaring it`,
    );
    for (const client of ordered) {
      assert.ok(ALL_CLIENTS.includes(client), `${capability}: ${client} is not a registered client`);
    }
  }
});

test('documented dispatch priorities survive derivation', () => {
  const team = CAPABILITY_CLIENT_ORDER.team;
  assert.ok(
    team.indexOf('zcode') < team.indexOf('pi'),
    'team order must keep zcode ahead of pi',
  );
  const agents = CAPABILITY_CLIENT_ORDER.agents;
  assert.equal(agents[0], 'claude', 'agents order must keep claude first');
  assert.ok(
    AGENTS_MD_COWRITERS.indexOf('codex') < AGENTS_MD_COWRITERS.indexOf('opencode')
      && AGENTS_MD_COWRITERS.indexOf('opencode') < AGENTS_MD_COWRITERS.indexOf('grok'),
    'AGENTS.md co-writer priority must keep codex ahead of opencode ahead of grok',
  );
});

test('AGENTS.md co-writers are exactly the clients reading AGENTS.md', () => {
  const expected = ALL_CLIENTS.filter((client) => getClientInstructionFileName(client) === 'AGENTS.md');
  assert.deepEqual([...AGENTS_MD_COWRITERS].sort(), [...expected].sort());
  assert.equal(new Set(AGENTS_MD_COWRITERS).size, AGENTS_MD_COWRITERS.length);
});

test('exactly one AGENTS.md co-writer claims the file for any selection', () => {
  const selections = [
    ['codex'],
    ['opencode'],
    ['grok'],
    ['hermes'],
    ['workbuddy'],
    ['pi'],
    ['zcode'],
    ['qoder'],
    ['pi', 'zcode'],
    ['zcode', 'qoder'],
    ['hermes', 'pi'],
    ['codex', 'pi'],
    ['opencode', 'hermes'],
    ['grok', 'hermes'],
    [...ALL_CLIENTS],
  ];
  for (const selection of selections) {
    const writers = AGENTS_MD_COWRITERS
      .filter((client) => selection.includes(client))
      .filter((client) => EMITTERS[client]({ rootDir: REPO_ROOT, selectedClients: selection })
        .operations.some((op) => op.kind === 'markdown-block' && op.targetPath === 'AGENTS.md'));
    assert.equal(
      writers.length,
      1,
      `${selection.join(',')} expected exactly one AGENTS.md writer, got [${writers.join(',')}]`,
    );
  }
});

test('codemap instruction file targets partition the registry', () => {
  const covered = CLIENT_INSTRUCTION_FILES.flatMap((target) => target.clientKeys);
  assert.deepEqual(
    [...covered].sort(),
    [...ALL_CLIENTS].sort(),
    'every registered client must be routed to an instruction file exactly once',
  );
  for (const target of CLIENT_INSTRUCTION_FILES) {
    for (const client of target.clientKeys) {
      assert.equal(
        getClientInstructionFileName(client),
        target.fileName,
        `${client}: codemap instruction file must match registry instructionFileName`,
      );
    }
  }
});

test('interception matrix covers the registry plus the declared non-CLI hosts', () => {
  for (const client of ALL_CLIENTS) {
    assert.ok(CLIENT_ORDER.includes(client), `${client} missing from interception CLIENT_ORDER`);
  }
  assert.deepEqual(
    CLIENT_ORDER.filter((id) => !ALL_CLIENTS.includes(id)).sort(),
    [...NON_CLI_HOST_IDS].sort(),
  );
});

test('every registered client has a native emitter', () => {
  assert.deepEqual(
    Object.keys(EMITTERS).sort(),
    [...ALL_CLIENTS].sort(),
    'EMITTERS must cover the registry exactly',
  );
});

test('priority lists ignore unknown names but never drop members', () => {
  const members = Object.freeze(['codex', 'claude']);
  assert.deepEqual([...orderByPriority(members, ['nope', 'claude'])], ['claude', 'codex']);
  assert.deepEqual([...orderByPriority(members, [])], ['codex', 'claude']);
  assert.deepEqual([...orderByPriority(members, ['codex', 'claude', 'nope'])], ['codex', 'claude']);
});

test('skill frontmatter client and repoTargets names are all real', () => {
  const sourceRoot = path.join(REPO_ROOT, 'skill-sources');
  // .system/ 存放共享 partial，不是 skill 目录。
  const skillDirs = fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name);
  assert.ok(skillDirs.length > 0, 'expected skill sources to exist');

  const known = new Set([...ALL_CLIENTS, ...SKILL_SURFACES]);
  for (const dir of skillDirs) {
    const frontmatter = readSkillFrontmatter(path.join(sourceRoot, dir, 'SKILL.md'));
    assert.ok(frontmatter, `${dir}: SKILL.md must exist and parse`);
    // 未声明 clients/repoTargets 的 skill 走 source-tree 的空数组默认，不参与同步。
    for (const field of ['clients', 'repoTargets']) {
      const values = frontmatter[field];
      if (values === undefined || values === null) continue;
      assert.ok(Array.isArray(values), `${dir}: ${field} must parse as a list`);
      for (const value of values) {
        assert.ok(
          known.has(value),
          `${dir}: ${field} lists "${value}" which is neither a registered client nor a known surface`,
        );
      }
    }
  }
});
