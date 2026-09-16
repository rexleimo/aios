import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_CLIENTS,
  CLIENT_DEFINITIONS,
  clientSupportsModelProtocol,
  getClientModelProtocols,
  getClientModelRouting,
} from '../lib/clients/registry.mjs';
import {
  MODEL_PROTOCOLS,
  applyClientContract,
  buildClientModelArgs,
  clientModelCompatibility,
  defaultModelRegistry,
  getModelConfig,
  modelProtocolSet,
  resolveModelForTask,
} from '../lib/model-router.mjs';
import { resolveExecutionClientId } from '../lib/harness/subagent-runtime/client-args.mjs';

// 中文注释：这份用例锁住 provider 与 protocol 的分工。历史上 provider 既当“上游厂商”
// 又当“可启动客户端”，于是 `aios team --provider pi` 会把 provider=claude 的模型
// （glm-5.1）派给 pi worker，pi 用自己的端点去要一个它没有的模型 -> 401。
// 现在契约先行：模型只有在 worker 客户端 speak 得了、且通道没被判死时才可派发。

const ENV = {};

function route(taskType, clientId, extra = {}) {
  // resolveModelForTask 内部已经套用客户端契约，这里不再二次折叠，避免 skipped 被重算掉。
  return resolveModelForTask(taskType, defaultModelRegistry(), ENV, { clientId, ...extra });
}

test('model routing contract is declared for every supported client', () => {
  const relay = ALL_CLIENTS.filter((client) => getClientModelRouting(client) === 'relay');
  const own = ALL_CLIENTS.filter((client) => getClientModelRouting(client) === 'own');

  assert.deepEqual(relay.sort(), ['claude', 'codex', 'hermes', 'opencode', 'pi'],
    'endpoint-injection evidence exists only for these clients (see definitions.mjs per-client note)');
  assert.deepEqual(own.sort(), ['gemini', 'grok', 'workbuddy', 'zcode'],
    'account-bound / no --model flag / unverified endpoint override must keep their own default model');

  for (const client of relay) {
    const protocols = getClientModelProtocols(client);
    assert.ok(protocols.length > 0, `${client} is relay-capable but declares no protocol`);
    assert.deepEqual(protocols, Array.from(new Set(protocols)), `${client} declares duplicate protocols`);
    for (const protocol of protocols) assert.ok(MODEL_PROTOCOLS.includes(protocol), `${client}/${protocol}`);
    assert.ok(String(CLIENT_DEFINITIONS[client].modelArgFlag || '').length > 0, `${client} relay mode needs a model flag`);
  }
  for (const client of own) {
    assert.deepEqual(getClientModelProtocols(client), [], `${client} must not claim protocols while own-default`);
  }
  assert.equal(clientSupportsModelProtocol('zcode-cli', 'claude'), false, 'unknown runtime ids default to own');
  assert.equal(clientSupportsModelProtocol('pi-coding-agent', 'claude'), true);
  assert.equal(clientSupportsModelProtocol('codex-cli', 'claude'), false);
});

test('registry models declare known protocols and capability mapping stays routable', () => {
  const registry = defaultModelRegistry();
  const ids = Object.keys(registry.models);
  assert.ok(ids.length >= 20, 'the relay catalogue slice should be represented');
  for (const id of ids) {
    const protocols = modelProtocolSet(registry.models[id]);
    if (!protocols.length) continue;
    for (const protocol of protocols) assert.ok(MODEL_PROTOCOLS.includes(protocol), `${id} uses unknown protocol ${protocol}`);
  }

  // 每个任务类型至少要有一个 relay 客户端能真正拿到模型，否则那条路由是空头支票。
  for (const rule of registry.routingRules) {
    const chain = [rule.primary, ...(rule.fallback || [])];
    const served = chain.filter((id) => modelProtocolSet(getModelConfig(id, registry) || {}).length > 0);
    assert.ok(served.length > 0, `taskType=${rule.taskType} has no protocol-declared model`);
    const reachableClients = new Set(ALL_CLIENTS.filter((client) => getClientModelRouting(client) === 'relay'));
    for (const id of served) {
      const protocols = modelProtocolSet(getModelConfig(id, registry));
      const ok = [...reachableClients].some((client) => protocols.some((protocol) => clientSupportsModelProtocol(client, protocol)));
      assert.equal(ok, true, `model ${id} is routable by no client`);
    }
  }
  assert.ok(ids.includes('gpt-6-astra') && ids.includes('claude-opus-5'), 'newest verified flagship models must be routable targets');
});

test('pi worker never receives a model it cannot speak (401 regression)', () => {
  const base = resolveModelForTask('browser-automation', defaultModelRegistry(), ENV);
  assert.equal(base.modelId, 'gpt-6-astra', 'without a worker context the flagship all-rounder wins');
  assert.equal(modelProtocolSet(base.model).join(','), 'openai-response');

  const pi = route('browser-automation', 'pi-coding-agent');
  assert.notEqual(pi.modelId, 'gpt-6-astra', 'pi speaks openai-chat/claude only, so the response-API flagship must be skipped');
  assert.equal(pi.requestedModelId, 'gpt-6-astra', 'intent is preserved for observability');
  assert.equal(modelProtocolSet(getModelConfig(pi.modelId, defaultModelRegistry())).includes('claude'), true);
  assert.deepEqual(pi.skipped.map((item) => item.modelId), ['gpt-6-astra', 'gpt-5.5']);
  assert.match(pi.skipped[0].reason, /^client-protocol-mismatch/u);
  assert.deepEqual(buildClientModelArgs('pi-coding-agent', pi), ['--model', pi.modelId]);

  const codex = route('code-review', 'codex-cli');
  assert.equal(codex.requestedModelId, 'claude-opus-5');
  assert.equal(codex.modelId, 'gpt-6-astra', 'codex speaks responses only, so it gets the GPT flagship');
  assert.deepEqual(buildClientModelArgs('codex-cli', codex), ['-m', 'gpt-6-astra']);

  assert.equal(resolveExecutionClientId('pi-coding-agent', base, ENV), 'pi-coding-agent',
    'a claude/codex launch hint must not silently replace the worker client');
  assert.equal(resolveExecutionClientId('pi-coding-agent', pi, ENV), 'pi-coding-agent');
});

test('own-default clients are launched without a model argument', () => {
  for (const client of ['zcode-cli', 'grok-build', 'workbuddy-agent', 'gemini-cli']) {
    const decision = route('implementation', client);
    assert.equal(decision.ownDefaultModel, true, `${client} should be flagged own-default`);
    assert.deepEqual(buildClientModelArgs(client, decision), [], `${client} must not receive --model`);
    assert.equal(clientModelCompatibility(client, decision.modelId, defaultModelRegistry()).ownDefault, true);
  }
});

test('down channels are skipped and reported, never retried blindly', () => {
  const now = 1_700_000_000_000;
  const availability = {
    models: {
      'gpt-6-astra@openai-response': { state: 'down', reason: 'channel-unavailable', updatedAt: now, lastFailureAt: now, consecutiveFailures: 2 },
      'claude-sonnet-5@claude': { state: 'degraded', reason: 'slow:42000ms', updatedAt: now, lastFailureAt: 0, consecutiveFailures: 0 },
    },
  };

  // 能 speak 该协议的 worker：通道死掉要留下 channel-unavailable 证据，并沿降级链走。
  const open = route('general', 'opencode-cli', { availability, now });
  assert.equal(open.requestedModelId, 'gpt-6-astra');
  assert.equal(open.modelId, 'claude-sonnet-5');
  assert.equal(open.skipped[0].modelId, 'gpt-6-astra');
  assert.match(open.skipped[0].reason, /^channel-unavailable:/u);
  assert.equal(open.degradedChannel, true, 'slow-but-usable beats nothing: degrade, do not exclude');
  assert.match(open.availabilityReason || '', /slow/u);
  assert.deepEqual(buildClientModelArgs('opencode-cli', open), ['-m', 'claude-sonnet-5']);

  // 协议不匹配与通道死掉是两种原因，理由要分别可观测。
  const claudeWorker = route('browser-automation', 'claude-code');
  assert.equal(claudeWorker.modelId, 'claude-sonnet-5');
  assert.match(claudeWorker.skipped[0].reason, /^client-protocol-mismatch/u);

  // 该客户端所有候选通道都判死：标记 channelDown，且不再传模型参数。
  const exhausted = route('general', 'codex-cli', {
    availability: {
      models: {
        'gpt-6-astra@openai-response': { state: 'down', reason: 'http-404', updatedAt: now, lastFailureAt: now },
      },
    },
    now,
  });
  assert.equal(exhausted.channelDown, true, 'when every channel for this client is down, say so instead of launching a doomed worker');
  assert.deepEqual(buildClientModelArgs('codex-cli', exhausted), [], 'channel-down routes must not pass a model');
});

test('applyClientContract is safe to reuse on an already-normalized route', () => {
  const registry = defaultModelRegistry();
  const base = route('implementation', 'claude-code');
  const asRoute = { modelId: base.modelId, fallback: registry.routingRules.find((r) => r.taskType === 'implementation').fallback, reason: base.reason };
  const again = applyClientContract(asRoute, registry, { clientId: 'codex-cli' });
  assert.equal(again.modelId, 'gpt-6-astra', 'normalized routes get filtered too, so callers cannot bypass the contract');
  assert.equal(again.requestedModelId, asRoute.modelId);
});
