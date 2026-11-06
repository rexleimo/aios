// scripts/tests/clients/adapters/headroom-mcp-registration.test.mjs — headroom MCP 注册（w5c：AIOS 自写）。
//
// 这一份在 w5c 之后测的东西换了性质：**不再有 spawn**。注册 = AIOS 自己写客户端配置文件，
// 走与 CLI/codemap/browser/pi 同一条通用写路径。于是原来的两个断言对象消失了：
//   · `buildHeadroomMcpAddInvocation` / `Remove`（厂商 CLI 方言）——已删除，留着就是第二套“怎么注册”的说法；
//   · `runImpl` / `missing-runner`——生产从来没注入过 runner，那条路径的真实归宿是永久 failed。
// 换成四个仍能客观验证的事实：
//   ① 三个 runtime 的落点都真的被写出来（gemini JSON / grok TOML 的 env 子表 / hermes YAML 的 enabled+tools）；
//   ② 归属判定仍然 fail-closed：external / conflict 一个字节都不覆盖；
//   ③ 默认 probe 不再假装成功（`pending-smoke`），真探针没接入前不得报 verified；
//   ④ 回滚把文件带回“没装过的样子”（连新建的桶一起收）。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildDesiredHeadroomEntry } from '../../../lib/environment/aios-init/headroom-mcp/commands.mjs';
import {
  ensureHeadroomMcpRegistration,
  removeOwnedHeadroomMcp,
} from '../../../lib/environment/aios-init/headroom-mcp/lifecycle.mjs';
import {
  classifyHeadroomOwnership,
  fingerprintHeadroomEntry,
  readHeadroomLedger,
  resolveHeadroomLedgerPath,
  writeHeadroomLedger,
} from '../../../lib/environment/aios-init/headroom-mcp/ownership.mjs';

const HOME = {
  'gemini-cli': ['.gemini', 'settings.json'],
  'grok-build': ['.grok', 'config.toml'],
  'hermes-agent': ['.hermes', 'config.yaml'],
};

/** 一个隔离 home：配置文件还没写、ledger 在 `<home>/.aios/...`。 */
async function sandbox(prefix) {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    homeDir,
    env: {},
    options(runtimeId) {
      return { runtimeId, headroomPath: path.join(homeDir, 'bin', 'headroom'), homeDir, env: {}, projectRoot: '' };
    },
    configPath(runtimeId) {
      return path.join(homeDir, ...HOME[runtimeId]);
    },
    async read(runtimeId) {
      try {
        return await fs.readFile(this.configPath(runtimeId), 'utf8');
      } catch {
        return '';
      }
    },
  };
}

test('ownership is fail-closed and never adopts an external matching entry', () => {
  const desired = buildDesiredHeadroomEntry('gemini-cli', '/opt/headroom');
  const fingerprint = fingerprintHeadroomEntry(desired);
  assert.equal(classifyHeadroomOwnership({ actual: null, desired, ledgerEntry: null }).status, 'absent');
  assert.equal(classifyHeadroomOwnership({ actual: desired, desired, ledgerEntry: null }).status, 'external');
  assert.equal(classifyHeadroomOwnership({ actual: desired, desired, ledgerEntry: { fingerprint } }).status, 'owned');
  assert.equal(classifyHeadroomOwnership({ actual: { ...desired, command: '/user/headroom' }, desired, ledgerEntry: { fingerprint } }).status, 'conflict');
});

test('ledger path is under AIOS home and redacts unrelated fields', async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'headroom-ledger-home-'));
  const desired = buildDesiredHeadroomEntry('grok-build', '/opt/headroom');
  const ledger = {
    schemaVersion: 1,
    entries: {
      'grok-build': {
        runtimeId: 'grok-build',
        profile: '',
        configPath: '/home/u/.grok/config.toml',
        command: desired.command,
        args: desired.args,
        env: { ...desired.env, SECRET: 'nope' },
        fingerprint: fingerprintHeadroomEntry(desired),
        createdAt: '2026-07-10T00:00:00.000Z',
        lastVerifiedAt: '2026-07-10T00:00:00.000Z',
      },
    },
  };

  await writeHeadroomLedger(ledger, { homeDir, env: {} });
  const ledgerPath = resolveHeadroomLedgerPath({ homeDir, env: {} });
  assert.equal(ledgerPath, path.join(homeDir, '.aios', 'integrations', 'headroom-mcp.json'));
  const raw = await fs.readFile(ledgerPath, 'utf8');
  assert.doesNotMatch(raw, /SECRET/u);

  const readBack = await readHeadroomLedger({ homeDir, env: {} });
  assert.equal(readBack.entries['grok-build'].env.HEADROOM_MCP_READ, 'off');
});

test('consent and ownership gate before any write: no consent or a conflicting entry leaves bytes alone', async () => {
  const box = await sandbox('headroom-gate-');
  const opts = box.options('gemini-cli');

  const pending = await ensureHeadroomMcpRegistration({ ...opts, mode: 'auto', consent: false });
  assert.equal(pending.status, 'pending-consent');
  assert.equal(await box.read('gemini-cli'), '', '没有 consent 不许建文件');

  // 用户自己写了一条同名但不同 command 的条目 → conflict，且一个字节都不许动。
  await fs.mkdir(path.dirname(box.configPath('gemini-cli')), { recursive: true });
  const userOwned = '{\n  "mcpServers": {\n    "headroom": { "command": "/user/headroom", "args": ["mcp", "serve"] }\n  }\n}\n';
  await fs.writeFile(box.configPath('gemini-cli'), userOwned, 'utf8');
  const conflict = await ensureHeadroomMcpRegistration({ ...opts, mode: 'on', consent: true });
  assert.equal(conflict.status, 'conflict');
  assert.equal(await box.read('gemini-cli'), userOwned, 'conflict 不许改盘');
});

test('self-write registers all three runtimes in their own dialect (grok keeps env as a sub-table)', async () => {
  const box = await sandbox('headroom-write-');
  const expected = {
    'gemini-cli': (raw) => {
      const parsed = JSON.parse(raw);
      assert.deepEqual(parsed.mcpServers.headroom, {
        command: path.join(box.homeDir, 'bin', 'headroom'),
        args: ['mcp', 'serve'],
        env: { HEADROOM_MCP_CLIENT: 'gemini-cli', HEADROOM_MCP_READ: 'off' },
      });
    },
    'grok-build': (raw) => {
      assert.match(raw, /\[mcp_servers\.headroom\]/u);
      // 真实 ~/.grok/config.toml 就是 env 子表；写成内联表会让用户的 env 换一种形状。
      assert.match(raw, /\[mcp_servers\.headroom\.env\]\nHEADROOM_MCP_CLIENT = "grok-build"/u);
      assert.doesNotMatch(raw, /env = \{/u);
    },
    'hermes-agent': (raw) => {
      // hermes 只认 enabled 且必须有那三个工具名（见 hermesEntryUsable）；自写必须复现同一形状。
      assert.match(raw, /headroom:/u);
      assert.match(raw, /enabled: true/u);
      assert.match(raw, /headroom_compress/u);
      assert.match(raw, /HEADROOM_MCP_CLIENT: hermes-agent/u);
    },
  };

  for (const runtimeId of Object.keys(HOME)) {
    const options = { ...box.options(runtimeId), mode: 'on', consent: true };
    const first = await ensureHeadroomMcpRegistration(options);
    // 默认 probe 是 pending-smoke：写进去了，但还没有“客户端真能连上”的证据。
    assert.equal(first.status, 'pending-smoke', `${runtimeId} 实得 ${first.status}/${first.reason || ''}`);
    expected[runtimeId](await box.read(runtimeId));

    // 第二次：账本 + 指纹都证明是我们写的 → registered，且不再重写。
    const before = await box.read(runtimeId);
    const second = await ensureHeadroomMcpRegistration(options);
    assert.equal(second.status, 'registered', `${runtimeId} 二次实得 ${second.status}/${second.reason || ''}`);
    assert.equal(await box.read(runtimeId), before, `${runtimeId} registered 不该动文件`);
  }

  const ledger = await readHeadroomLedger({ homeDir: box.homeDir, env: {} });
  assert.deepEqual(Object.keys(ledger.entries).sort(), ['gemini-cli', 'grok-build', 'hermes-agent']);
});

test('default probe never claims verified; an injected failing probe rolls back to the pre-install bytes', async () => {
  const box = await sandbox('headroom-rollback-');
  const options = { ...box.options('gemini-cli'), mode: 'on', consent: true };

  const failed = await ensureHeadroomMcpRegistration({
    ...options,
    probeImpl: async () => ({ status: 'failed', reason: 'handshake-failed' }),
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.reason, 'handshake-failed');
  assert.equal(failed.rolledBack, true);
  // 回滚 = 回到“没装过的样子”：本次新建的桶连壳一起收掉，文件回到空。
  assert.equal(await box.read('gemini-cli'), '', '回滚后不许留下半截配置');

  // 真探针（如果有）仍然可以报 verified——这是给未来接真握手的入口，不是现在的默认。
  const verified = await ensureHeadroomMcpRegistration({ ...options, probeImpl: async () => ({ status: 'verified' }) });
  assert.equal(verified.status, 'verified');
});

test('remove only touches an entry the ledger proves we wrote', async () => {
  const box = await sandbox('headroom-remove-');
  const options = { ...box.options('gemini-cli'), mode: 'on', consent: true };
  assert.equal((await ensureHeadroomMcpRegistration(options)).status, 'pending-smoke');
  const ledger = await readHeadroomLedger({ homeDir: box.homeDir, env: {} });
  const record = ledger.entries['gemini-cli'];
  const written = await box.read('gemini-cli');

  // 账本指纹对不上（用户在写完之后改过）→ 拒绝删除，文件不动。
  const stale = await removeOwnedHeadroomMcp({ ...options, ledgerEntry: { ...record, fingerprint: 'stale' } });
  assert.equal(stale.status, 'conflict');
  assert.equal(await box.read('gemini-cli'), written);

  // 指纹对得上 → 真删，且没有残留条目。
  const removed = await removeOwnedHeadroomMcp({ ...options, ledgerEntry: record });
  assert.equal(removed.status, 'removed', `${removed.status}/${removed.reason || ''}`);
  const parsed = JSON.parse(await box.read('gemini-cli'));
  assert.equal(parsed.mcpServers?.headroom, undefined);
});