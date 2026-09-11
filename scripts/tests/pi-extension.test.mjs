import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AIOS_SYSTEM_PROMPT_ADDITION,
  buildBeforeAgentStartMessage,
  checkBashCommand,
  checkWritePath,
  decideToolCall,
} from '../../packages/aios-pi/lib/gates.mjs';
import {
  AiosCliError,
  memoRecallArgs,
  memoUsefulArgs,
  memoWriteArgs,
  resolveAiosRoot,
  runAios,
  runAiosJson,
  skillSearchArgs,
} from '../../packages/aios-pi/lib/aios-cli.mjs';
import { buildToolDefs } from '../../packages/aios-pi/lib/tools.mjs';
import aiosExtension from '../../packages/aios-pi/extensions/aios.ts';

test('gates block destructive bash and terminate the turn', () => {
  assert.deepEqual(checkBashCommand('rm -rf /tmp/x'), { blocked: true, reason: 'rm -rf is blocked by the AIOS safety gate' });
  assert.deepEqual(checkBashCommand('ls -la'), { blocked: false });
  assert.deepEqual(checkBashCommand('mkfs.ext4 /dev/sda1').blocked, true);
  const verdict = decideToolCall({ toolName: 'bash', input: { command: 'rm -rf ~' } });
  assert.equal(verdict.block, true);
  assert.equal(verdict.terminate, true);
  assert.equal(decideToolCall({ toolName: 'bash', input: { command: 'git status --short' } }), undefined);
  assert.equal(decideToolCall({ toolName: 'powershell', input: { command: 'rm -rf C:\\temp' } }).block, true);
});

test('gates block protected writes without terminating', () => {
  assert.equal(checkWritePath('.env').blocked, true);
  assert.equal(checkWritePath('.env.local').blocked, true);
  assert.equal(checkWritePath('node_modules/foo/index.js').blocked, true);
  assert.equal(checkWritePath('.git/config').blocked, true);
  assert.deepEqual(checkWritePath('src/index.ts'), { blocked: false });
  const verdict = decideToolCall({ toolName: 'write', input: { path: '.env' } });
  assert.equal(verdict.block, true);
  assert.equal(verdict.terminate, false);
  assert.equal(decideToolCall({ toolName: 'read', input: { path: '.env' } }), undefined);
});

test('before_agent_start message carries policy and optional digest', () => {
  assert.match(AIOS_SYSTEM_PROMPT_ADDITION, /direct.*guarded.*planned/is);
  const bare = buildBeforeAgentStartMessage();
  assert.equal(bare.display, false);
  assert.match(bare.content, /AIOS control plane is active/iu);
  assert.doesNotMatch(bare.content, /Memory digest/iu);
  const withDigest = buildBeforeAgentStartMessage({ memoryDigest: 'pi client done' });
  assert.match(withDigest.content, /Memory digest/iu);
  assert.match(withDigest.content, /pi client done/iu);
});

test('resolveAiosRoot prefers env, then walks up, then empty', () => {
  assert.equal(resolveAiosRoot({ env: { AIOS_ROOT_DIR: '/env/aios' }, startDir: '/x' }), '/env/aios');
  assert.equal(resolveAiosRoot({ env: { ROOTPATH: '/legacy' }, startDir: '/x' }), '/legacy');
  const existsSync = (p) => String(p).replace(/\\/g, '/').endsWith('/repo/scripts/aios.mjs');
  const walked = String(resolveAiosRoot({ env: {}, startDir: '/repo/packages/aios-pi/extensions', existsSync })).replace(/\\/g, '/');
  assert.ok(walked.endsWith('/repo'), `walk-up root ${walked}`);
  assert.equal(resolveAiosRoot({ env: {}, startDir: '/nowhere', existsSync: () => false }), '');
});

test('runAiosJson parses JSON and fails closed otherwise', async () => {
  const ok = await runAiosJson({
    aiosRoot: '/aios',
    argv: ['search', 'x', '--json'],
    execFileImpl: (_cmd, _args, _opts, cb) => cb(null, '{"hits":[]}', ''),
  });
  assert.deepEqual(ok, { hits: [] });
  await assert.rejects(
    runAiosJson({ aiosRoot: '/aios', argv: ['memo', 'search'], execFileImpl: (_c, _a, _o, cb) => cb(null, 'plain text', '') }),
    /non-JSON output/iu,
  );
  await assert.rejects(
    runAios({ argv: ['memo'] }),
    /AIOS root not resolved/iu,
  );
  try {
    await runAios({ aiosRoot: '/aios', argv: ['memo'], execFileImpl: (_c, _a, _o, cb) => cb(Object.assign(new Error('boom'), { code: 1 }), '', 'err text') });
    assert.fail('expected throw');
  } catch (error) {
    assert.ok(error instanceof AiosCliError);
    assert.match(error.message, /err text/iu);
  }
});

test('argv builders match the real aios CLI surface', () => {
  assert.deepEqual(memoRecallArgs({ query: 'pi client', limit: 3 }), ['memo', 'search', 'pi client', '--limit', '3']);
  assert.deepEqual(memoWriteArgs({ text: 'pi done' }), ['memo', 'add', 'pi done']);
  assert.deepEqual(memoUsefulArgs({ eventIds: ['a', 'b'] }), ['memo', 'useful', 'a,b']);
  assert.deepEqual(skillSearchArgs({ query: 'harness' }), ['search', 'harness', '--json']);
});

function stubTypeBox() {
  return {
    Object: (props) => ({ kind: 'object', props }),
    String: (opts) => ({ kind: 'string', opts }),
    Number: (opts) => ({ kind: 'number', opts }),
    Array: (items, opts) => ({ kind: 'array', items, opts }),
    Optional: (inner) => ({ kind: 'optional', inner }),
  };
}

function stubPi() {
  return {
    tools: [],
    events: {},
    commands: {},
    registerTool(tool) { this.tools.push(tool); },
    on(event, handler) { this.events[event] = handler; },
    registerCommand(name, def) { this.commands[name] = def; },
  };
}

test('tool defs expose four AIOS tools with real argv', async () => {
  assert.throws(() => buildToolDefs({}), /requires \{ Type, run \}/u);
  const seen = [];
  const defs = buildToolDefs({
    Type: stubTypeBox(),
    run: async ({ argv }) => {
      seen.push(argv);
      return { text: `OUT:${argv.join(' ')}` };
    },
  });
  assert.deepEqual(defs.map((d) => d.name), [
    'aios_memory_recall',
    'aios_memory_write',
    'aios_memory_useful',
    'aios_skill_search',
  ]);
  const out = await defs[0].execute('id-1', { query: 'pi', limit: 2 });
  assert.equal(out.content[0].text, 'OUT:memo search pi --limit 2');
  assert.deepEqual(seen[0], ['memo', 'search', 'pi', '--limit', '2']);
});

test('extension factory wires tools, gates, session status, and commands', async () => {
  const pi = stubPi();
  const { aiosRoot } = await aiosExtension(pi, {
    aiosRoot: '/fake-aios',
    loadTypeBox: async () => ({ Type: stubTypeBox() }),
    runAios: async ({ argv }) => ({ text: `RUN:${argv.join(' ')}` }),
  });
  assert.equal(aiosRoot, '/fake-aios');
  assert.equal(pi.tools.length, 4);
  assert.deepEqual(Object.keys(pi.events).sort(), ['before_agent_start', 'session_start', 'tool_call']);
  assert.deepEqual(Object.keys(pi.commands).sort(), ['aios-policy', 'aios-root']);

  assert.equal((await pi.events.tool_call({ toolName: 'bash', input: { command: 'rm -rf /' } })).block, true);
  assert.equal(await pi.events.tool_call({ toolName: 'read', input: { path: 'x' } }), undefined);

  const started = await pi.events.before_agent_start({});
  assert.equal(started.message.customType, 'aios-context');
  assert.match(started.message.content, /RUN:memo search session continuity --limit 3/iu);

  let status = '';
  await pi.events.session_start({}, { ui: { setStatus: (_k, v) => { status = v; } } });
  assert.match(status, /\/fake-aios/iu);
});
