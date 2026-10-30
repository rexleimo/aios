/* 中文注释：native partial 的“送达门”——行为级，不是 grep 级。
 *
 * 背景（2026-10-30 实测）：`client-sources/native-base/shared/partials/` 里 10 个 partial，
 * 只有 `core/core-instructions.md` 真的被 composeNativeMarkdown 读进模型可见面；
 * 其余 9 个没有任何 loader 引用（`readSharedMarkdownParts` 本身零调用者）。
 * 仓库代码与已安装运行时（~/.rexcil/aios）结论一致。
 *
 * 这道门要防的错误很具体：把“我写了一份细则文件”当成“我把它送达了模型”。
 * 因此判定只用客观事实：真跑投影、真记录 loader 读了哪些文件、真检查产物里有没有该段落标题。
 *
 * disposition 是显式声明的（不是猜的）：
 * - composed            ：必须被真实投影读到，且产物文本里能查到它的 H2 标题；
 * - documentation-only  ：刻意不投递，只作人类参考文档，担保它不与 live 面冲突（见一致性断言）。
 * 新出现的 partial 没有 disposition → 失败；被读到却没有标成 composed → 失败（说明投递面悄悄变了）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const PARTIALS_REL_DIR = path.join('client-sources', 'native-base', 'shared', 'partials');

// 唯一 owner：哪些 partial 走“送达”，哪些走“人类文档”，新增必须在这里表态。
const PARTIAL_DISPOSITIONS = Object.freeze({
  'core/core-instructions.md': 'composed',
  'core/contextdb.md': 'documentation-only: context 拉取制，投影不注入会话历史；见 AGENTS.md 的 pull-based context 约定',
  'core/codemap.md': 'documentation-only: codemap 工具面由 aios-codemap-ops skill 与 AGENTS.md 的 bounded checkpoint 段承载',
  'core/harness.md': 'documentation-only: long-running harness 走 aios-long-running-harness skill 按需加载',
  'clients/agent-routing.md': 'documentation-only: subagent 分派细则的 live 面是角色卡契约 + Dispatch Brief，见下方一致性断言',
  'clients/browser-mcp.md': 'documentation-only: 浏览器约束走 skill-constraints；此 partial 的唯一引用函数无调用者',
  'clients/client-capabilities.md': 'documentation-only: 能力门事实来自 config/host-capabilities.json + aios status，不靠散文复述',
  'clients/team-provider.md': 'documentation-only: team provider 由 rex Command 选择，不由投影文字决定',
  'ops/model-router.md': 'documentation-only: 模型路由由 model-router skill 按需加载',
  'ops/token-discipline.md': 'documentation-only: 压缩面由 RTK/Caveman + aios init 承担，见 AGENTS.md Token Optimization 段',
});

async function listPartials(rootDir) {
  const base = path.join(rootDir, PARTIALS_REL_DIR);
  const out = [];
  const walk = async (dir) => {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(p); continue; }
      if (!entry.name.endsWith('.md')) continue;
      out.push(path.relative(base, p).split(path.sep).join('/'));
    }
  };
  await walk(base);
  return out.sort();
}

function firstHeading(text) {
  return text.split('\n').map((line) => line.trim()).find((line) => line.startsWith('## ')) || '';
}

test('every shared native partial has an explicit delivery disposition', async () => {
  const partials = await listPartials(process.cwd());
  assert.ok(partials.length > 0, 'partials inventory must not be empty');
  const unknown = partials.filter((rel) => !Object.hasOwn(PARTIAL_DISPOSITIONS, rel));
  assert.deepEqual(unknown, [], `new partial without disposition (declare composed or documentation-only): ${unknown.join(', ')}`);
  const stale = Object.keys(PARTIAL_DISPOSITIONS).filter((rel) => !partials.includes(rel));
  assert.deepEqual(stale, [], `disposition names a partial that no longer exists: ${stale.join(', ')}`);
});

test('the delivery gate runs the real projection and trusts behavior over grep', async () => {
  const { composeNativeMarkdown } = await import('../../../lib/clients/native/distribution/emitters/compose.mjs');
  const { ALL_CLIENTS, getClientInstructionFileName } = await import('../../../lib/foundation/clients/registry.mjs');

  const partialsDir = path.join(process.cwd(), PARTIALS_REL_DIR);
  const readFiles = new Set();
  const realReadFileSync = fs.readFileSync;
  fs.readFileSync = function patched(target, ...rest) {
    const value = realReadFileSync.call(fs, target, ...rest);
    try {
      const abs = path.resolve(String(typeof target === 'object' && target?.path ? target.path : target));
      if (abs.startsWith(partialsDir)) readFiles.add(path.relative(partialsDir, abs).split(path.sep).join('/'));
    } catch {
      // 观测不得影响被观测的投影
    }
    return value;
  };

  const clients = ALL_CLIENTS.filter((id) => typeof id === 'string' && getClientInstructionFileName(id));
  const emitted = new Map();
  try {
    for (const client of clients) {
      if (!getClientInstructionFileName(client)) continue;
      emitted.set(client, composeNativeMarkdown({ rootDir: process.cwd(), client }));
    }
  } finally {
    fs.readFileSync = realReadFileSync;
  }

  assert.ok(emitted.size >= 6, `projection must run for the registered clients, got ${emitted.size}`);
  for (const [rel, disposition] of Object.entries(PARTIAL_DISPOSITIONS)) {
    const wasRead = readFiles.has(rel);
    if (disposition === 'composed') {
      assert.ok(wasRead, `${rel} is declared composed but no loader read it during real projection`);
      const marker = firstHeading(realReadFileSync.call(fs, path.join(partialsDir, rel), 'utf8'));
      assert.ok(marker, `${rel} has no H2 heading to verify delivery against`);
      const landed = [...emitted.values()].filter((text) => text.includes(marker));
      assert.ok(landed.length > 0, `${rel} was read but its heading never reached any emitted instruction`);
      continue;
    }
    // documentation-only：它就不该被投递。若哪天被投递了，说明有人改了投递面而没改这份声明。
    assert.ok(!wasRead, `${rel} is dispositioned documentation-only but a loader read it — update the disposition`);
  }
});

test('documentation-only routing text must not contradict the surfaces that actually deliver rules', async () => {
  // 中文注释：agent-routing.md 到不了 dispatcher。真正生效的是两处 AIOS 拥有的文字：
  // 角色卡里的 worker 契约、和 Dispatch Brief 的隔离边界。文档必须与它们一致，否则就是误导。
  const { SUBAGENT_CONTEXT_CONTRACT_LINES } = await import('../../../lib/foundation/agents/emitters/shared.mjs');
  const { renderDispatchBriefMarkdown } = await import('../../../lib/foundation/agents/brief/render.mjs');
  const partialPath = path.join(process.cwd(), PARTIALS_REL_DIR, 'clients', 'agent-routing.md');
  const partial = await fsp.readFile(partialPath, 'utf8');

  const briefText = renderDispatchBriefMarkdown({
    schemaVersion: 1,
    objective: 'pin the delivery gate',
    outputSchema: 'scripts/lib/tooling/specs/registry/dispatch-brief.schema.v1.json',
    ownedPathPrefixes: ['scripts/lib/'],
    acceptance: ['gate runs'],
    upstreamRefs: [],
    forbidden: ['editing files outside owned paths'],
  });

  const isolationLines = [...SUBAGENT_CONTEXT_CONTRACT_LINES, briefText]
    .join('\n')
    .toLowerCase();

  assert.match(partial, /self-contained brief/u, 'routing doc must keep requiring a self-contained brief');
  assert.match(briefText, /do not rely on inheriting the parent conversation/iu, 'the brief must not depend on inherited context');
  assert.match(briefText, /return `blocked` naming the missing item/iu, 'missing facts must resolve to blocked, not guessing');
  // 文档里承诺的三件事，live 面必须逐条真的说到（卡片与 Brief 合并后的文字里）。
  const promises = [
    ['no inherited-context dependency', /do not rely on inheriting the parent conversation/iu],
    ['blocked on missing fact', /\breturn\b[^\n]*\bblocked\b/iu],
    ['no transcript asking', /paste its transcript/iu],
  ];
  for (const [label, pattern] of promises) {
    assert.match(isolationLines, pattern, `live surfaces never state: ${label}`);
  }
});
