import test from 'node:test';
import assert from 'node:assert/strict';

import { createGatewayClient } from '../../../lib/tooling/model-router/gateway/client.mjs';
import { createGatewayPhaseExecutor, GATEWAY_PHASE_EXECUTOR } from '../../../lib/tooling/model-router/gateway/phase-executor.mjs';
import { createRoutingGatewayApp } from '../../../lib/tooling/model-router/gateway/proxy.mjs';
import { resolvePhaseExecutorSelection } from '../../../lib/execution/harness/orchestration/orchestrator/planning/plan.mjs';
import { createLocalDispatchExecutorRegistry } from '../../../lib/execution/harness/orchestration/orchestrator-executors.mjs';

const registry = {
  activeModel: 'claude-opus-5',
  models: { 'claude-opus-5': { protocols: ['claude'] }, 'qwen3.8-flash': { protocols: ['openai-chat'] } },
  providers: { myopenai: { baseUrl: 'https://api.example.com', apiKeyEnv: 'env:MY_KEY', protocols: ['openai-chat'], models: ['qwen3.8-flash'] } },
  roleDefaults: { implementer: { taskType: 'implementation' }, planner: { taskType: 'planning' } },
  routingRules: [
    { taskType: 'implementation', primary: 'qwen3.8-flash', fallback: [] },
    { taskType: 'planning', primary: 'claude-opus-5', fallback: [] },
    { taskType: 'general', primary: 'claude-opus-5', fallback: [] },
  ],
  clientRoleMatrix: { default: { implementer: 'qwen3.8-flash', planner: 'claude-opus-5' }, clients: {} },
};

test('gateway phase executor drives the client by role and returns a structured result (no spawn)', async () => {
  const calls = [];
  const client = { runPhase: async (args) => { calls.push(args); return { ok: true, outputText: 'done', modelId: 'qwen3.8-flash', status: 200, elapsedMs: 5 }; } };
  const executor = createGatewayPhaseExecutor({ client });
  const result = await executor.execute({ phase: { role: 'implementer' }, job: { launchSpec: { task: 'build it' } } });
  assert.equal(result.executor, GATEWAY_PHASE_EXECUTOR);
  assert.equal(result.status, 'completed');
  assert.equal(result.role, 'implementer');
  assert.equal(result.outputText, 'done');
  assert.equal(calls[0].role, 'implementer');
  assert.equal(calls[0].userPrompt, 'build it');
});

test('resolvePhaseExecutorSelection selects gateway-phase; registry wires it and fails closed when unconfigured', async () => {
  const selection = resolvePhaseExecutorSelection('gateway-phase');
  assert.equal(selection.applied_executor, 'gateway-phase');
  assert.equal(selection.fallback_applied, false);

  const noop = async () => ({});
  const executor = createGatewayPhaseExecutor({ client: { runPhase: async () => ({ ok: true, outputText: 'x', modelId: 'm', status: 200, elapsedMs: 1 }) } });
  const withGateway = createLocalDispatchExecutorRegistry({ executePhaseJob: noop, executeMergeGateJob: noop, gatewayPhaseExecutor: executor });
  const ok = await withGateway['gateway-phase'].execute({ phase: { role: 'planner' }, job: { title: 't' } });
  assert.equal(ok.status, 'completed');

  const withoutGateway = createLocalDispatchExecutorRegistry({ executePhaseJob: noop, executeMergeGateJob: noop });
  const failed = await withoutGateway['gateway-phase'].execute({ phase: { role: 'planner' }, job: {} });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'gateway-executor-not-configured');
});

test('end-to-end: executor → client → routing gateway routes implementer to openai model and translates back', async () => {
  const upstreamFetch = async () => new Response(JSON.stringify({
    id: '1', model: 'qwen3.8-flash',
    choices: [{ message: { role: 'assistant', content: 'implemented' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  const { app } = createRoutingGatewayApp({ registry, clientId: 'claude', env: { MY_KEY: 'k' }, clientProtocol: 'claude', fetchImpl: upstreamFetch });
  // 中文注释：把客户端的 fetch 桥到 Hono app.request，零网络、零扣费跑通整条 P3 链。
  const bridgeFetch = (url, init) => app.request(new URL(url).pathname, { method: init.method, headers: init.headers, body: init.body });
  const client = createGatewayClient({ baseUrl: 'http://gateway.local', fetchImpl: bridgeFetch });
  const executor = createGatewayPhaseExecutor({ client, clientId: 'claude' });

  const result = await executor.execute({ phase: { role: 'implementer' }, job: { launchSpec: { task: 'build feature' } } });
  assert.equal(result.status, 'completed');
  assert.equal(result.outputText, 'implemented');
  assert.equal(result.modelId, 'qwen3.8-flash', 'implementer routed to the cheap openai-chat model via matrix');
});