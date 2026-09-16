import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildAiosAgentsPluginContents,
  convertAiosRoleCardToZcodeAgent,
  installAiosZcodeAgentsPlugin,
  resolveZcodeAgentsPluginDir,
  resolveZcodeUserConfigPath,
  ZCODE_AGENTS_PLUGIN_NAME,
} from '../lib/components/zcode/agents-plugin.mjs';
import { doctorZcodeAgents } from '../lib/components/zcode/doctor.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ROLE_CARD = `---
schemaVersion: 1
id: "rex-implementer"
role: "implementer"
name: "rex-implementer"
description: "Implementer role card for AIOS orchestrations (code changes + verification)."
tools: ["Read", "Grep", "Glob", "Bash", "Edit"]
model: "sonnet"
recommendedModel: ""
activationHints: ["implementer"]
---

You are the rex implementer. Ship the change with verification evidence.
`;

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('convertAiosRoleCardToZcodeAgent keeps executable fields and drops AIOS-only fields', () => {
  const agent = convertAiosRoleCardToZcodeAgent(ROLE_CARD);

  assert.equal(agent.name, 'rex-implementer');
  assert.ok(agent.content.startsWith('---\nname: rex-implementer\n'), 'frontmatter starts with name');
  assert.match(agent.content, /description: "Implementer role card/u);
  assert.match(agent.content, /tools: \["Read","Grep","Glob","Bash","Edit"\]/u);
  for (const dropped of ['schemaVersion', 'id: ', 'role: ', 'model: sonnet', 'activationHints']) {
    assert.ok(!agent.content.includes(dropped), `AIOS-only field must be dropped: ${dropped}`);
  }
  assert.ok(agent.content.includes('You are the rex implementer.'), 'system prompt body preserved');
});

test('convertAiosRoleCardToZcodeAgent rejects cards without a name', () => {
  assert.throws(() => convertAiosRoleCardToZcodeAgent('---\ndescription: "x"\n---\nbody\n'), /missing a name/u);
});

test('buildAiosAgentsPluginContents materializes one agent per AIOS role card', async () => {
  const { manifest, agents } = buildAiosAgentsPluginContents({ aiosRoot: REPO_ROOT });

  assert.equal(manifest.name, ZCODE_AGENTS_PLUGIN_NAME);
  assert.match(manifest.name, /^[a-z0-9][a-z0-9._-]{0,127}$/u, 'plugin name must satisfy the ZCode manifest pattern');
  assert.equal(manifest.agents, 'agents');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);

  const rolesDir = path.join(REPO_ROOT, 'agent-sources', 'roles');
  const roleFiles = await readdir(rolesDir);
  const roleCount = roleFiles.filter((name) => name.endsWith('.md')).length;
  assert.equal(agents.length, roleCount);
  for (const agent of agents) {
    assert.match(agent.name, /^rex-/u);
    assert.ok(agent.content.startsWith('---\nname: '), `${agent.name} frontmatter`);
  }
});

test('installAiosZcodeAgentsPlugin materializes the plugin and registers plugins.dirs idempotently', async () => {
  const tmp = await makeTemp('aios-zcode-agents-');
  const pluginDir = path.join(tmp, 'plugin');
  const zcodeHome = path.join(tmp, 'zcode');
  const configPath = resolveZcodeUserConfigPath(zcodeHome);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ mcp: { servers: {} }, plugins: { dirs: ['/pre/existing'] } }, null, 2)}\n`, 'utf8');

  const first = installAiosZcodeAgentsPlugin({
    aiosRoot: REPO_ROOT,
    pluginDir,
    zcodeHome,
    io: { log: () => {} },
  });
  assert.equal(first.status, 'created');
  assert.ok(first.agentsCount > 0);
  assert.ok(existsSync(path.join(pluginDir, '.zcode-plugin', 'plugin.json')));
  assert.ok(existsSync(path.join(pluginDir, 'agents', `${first.agentNames[0]}.md`)));

  let parsed = JSON.parse(await readFile(configPath, 'utf8'));
  assert.deepEqual(parsed.plugins.dirs, ['/pre/existing', pluginDir], 'existing dirs preserved, plugin appended');
  assert.ok(parsed.mcp, 'unrelated config keys survive');

  const second = installAiosZcodeAgentsPlugin({
    aiosRoot: REPO_ROOT,
    pluginDir,
    zcodeHome,
    io: { log: () => {} },
  });
  assert.equal(second.status, 'unchanged');
  assert.equal(second.configAction, 'unchanged');

  await rm(tmp, { recursive: true, force: true });
});

test('installAiosZcodeAgentsPlugin dry-run plans without writing', async () => {
  const tmp = await makeTemp('aios-zcode-agents-dry-');
  const pluginDir = path.join(tmp, 'plugin');
  const zcodeHome = path.join(tmp, 'zcode');

  const result = installAiosZcodeAgentsPlugin({
    aiosRoot: REPO_ROOT,
    pluginDir,
    zcodeHome,
    dryRun: true,
    io: { log: () => {} },
  });

  assert.equal(result.status, 'planned');
  assert.ok(result.agentsCount > 0);
  assert.ok(!existsSync(pluginDir), 'no plugin written on dry-run');
  assert.ok(!existsSync(resolveZcodeUserConfigPath(zcodeHome)), 'no config written on dry-run');

  await rm(tmp, { recursive: true, force: true });
});

test('doctorZcodeAgents reports fresh installs ok and drift or missing registration as warnings', async () => {
  const tmp = await makeTemp('aios-zcode-agents-doctor-');
  const pluginDir = path.join(tmp, 'plugin');
  const zcodeHome = path.join(tmp, 'zcode');
  const env = { ...process.env, AIOS_ZCODE_PLUGIN_DIR: pluginDir, ZCODE_HOME: zcodeHome };
  const io = { log: () => {} };

  // No ZCode home yet -> skipped
  const skipped = await doctorZcodeAgents({ aiosRoot: REPO_ROOT, env, io });
  assert.equal(skipped.skipped, true);

  await mkdir(zcodeHome, { recursive: true });
  const unregistered = await doctorZcodeAgents({ aiosRoot: REPO_ROOT, env, io });
  assert.equal(unregistered.skipped, false);
  assert.equal(unregistered.errors, 1, 'missing manifest is an error');
  assert.ok(unregistered.effectiveWarnings >= 1, 'missing registration is a warning');

  installAiosZcodeAgentsPlugin({
    aiosRoot: REPO_ROOT,
    pluginDir,
    zcodeHome,
    io,
  });
  const healthy = await doctorZcodeAgents({ aiosRoot: REPO_ROOT, env, io });
  assert.equal(healthy.errors, 0);
  assert.equal(healthy.effectiveWarnings, 0);
  assert.equal(healthy.registered, true);
  assert.equal(healthy.agentsInstalled, healthy.agentsExpected);

  // Drift: remove one agent file
  const agentsDir = path.join(pluginDir, 'agents');
  const firstAgent = (await readdir(agentsDir))[0];
  await rm(path.join(agentsDir, firstAgent));
  const drifted = await doctorZcodeAgents({ aiosRoot: REPO_ROOT, env, io });
  assert.equal(drifted.errors, 0);
  assert.ok(drifted.effectiveWarnings >= 1, 'agent drift is a warning');

  await rm(tmp, { recursive: true, force: true });
});

test('resolveZcodeAgentsPluginDir honors env override and defaults under ~/.aios', () => {
  assert.equal(
    resolveZcodeAgentsPluginDir({ AIOS_ZCODE_PLUGIN_DIR: '/custom/dir' }, '/home/u'),
    path.normalize('/custom/dir'),
  );
  assert.equal(
    resolveZcodeAgentsPluginDir({}, '/home/u'),
    path.join('/home/u', '.aios', 'zcode-plugin'),
  );
});
