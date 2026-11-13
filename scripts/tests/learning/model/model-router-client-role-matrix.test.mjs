import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getClientRoleMatrix,
  resolveClientRoleModel,
  resolveModelForClientRole,
} from '../../../lib/tooling/model-router/routing/client-role-matrix.mjs';

const registry = {
  activeModel: 'claude-sonnet-5',
  models: {
    'claude-opus-5': { protocols: ['claude'], cost: 'highest' },
    'claude-sonnet-5': { protocols: ['claude'], cost: 'high' },
    'deepseek-v4-pro': { protocols: ['claude'], cost: 'lowest' },
  },
  roleDefaults: {
    planner: { taskType: 'planning' },
    implementer: { taskType: 'implementation' },
    reviewer: { taskType: 'code-review', preferredModel: 'claude-opus-5' },
  },
  routingRules: [
    { taskType: 'planning', primary: 'claude-opus-5', fallback: ['claude-sonnet-5'] },
    { taskType: 'implementation', primary: 'deepseek-v4-pro', fallback: [] },
    { taskType: 'code-review', primary: 'claude-opus-5', fallback: [] },
    { taskType: 'general', primary: 'claude-sonnet-5', fallback: [] },
  ],
  clientRoleMatrix: {
    default: { planner: 'claude-opus-5', implementer: 'deepseek-v4-pro', reviewer: 'claude-opus-5' },
    clients: { claude: { implementer: 'claude-sonnet-5' } },
  },
};

test('getClientRoleMatrix normalizes role/client/model ids to lowercase', () => {
  const matrix = getClientRoleMatrix({
    clientRoleMatrix: { default: { Planner: 'Claude-Opus-5' }, clients: { Claude: { Implementer: 'Deepseek-V4-Pro' } } },
  });
  assert.equal(matrix.default.planner, 'claude-opus-5');
  assert.equal(matrix.clients.claude.implementer, 'deepseek-v4-pro');
});

test('resolveClientRoleModel precedence: env > per-client > global default > null', () => {
  // global default
  assert.deepEqual(resolveClientRoleModel('codex', 'implementer', registry, {}), { modelId: 'deepseek-v4-pro', source: 'default' });
  // per-client override beats default
  assert.deepEqual(resolveClientRoleModel('claude', 'implementer', registry, {}), { modelId: 'claude-sonnet-5', source: 'client' });
  // env beats per-client
  assert.deepEqual(
    resolveClientRoleModel('claude', 'implementer', registry, { AIOS_MODEL_IMPLEMENTER: 'claude-opus-5' }),
    { modelId: 'claude-opus-5', source: 'env' },
  );
  // role not in matrix → null (caller falls back)
  assert.equal(resolveClientRoleModel('claude', 'unknown-role', registry, {}), null);
});

test('resolveModelForClientRole uses the matrix and applies the client contract', () => {
  const decision = resolveModelForClientRole('claude', 'implementer', registry, {});
  assert.equal(decision.modelId, 'claude-sonnet-5');
  assert.match(decision.reason, /client-role matrix \(client\)/u);
  const planner = resolveModelForClientRole('codex', 'planner', registry, {});
  assert.equal(planner.modelId, 'claude-opus-5');
});

test('resolveModelForClientRole falls back to roleDefaults when the matrix has no entry', () => {
  const noMatrix = { ...registry, clientRoleMatrix: undefined };
  const decision = resolveModelForClientRole('claude', 'reviewer', noMatrix, {});
  assert.equal(decision.modelId, 'claude-opus-5', 'reviewer preferredModel from roleDefaults');
});

test('env override is explicit: client contract cannot swap the model', () => {
  const decision = resolveModelForClientRole('claude', 'implementer', registry, { AIOS_MODEL_IMPLEMENTER: 'claude-opus-5' });
  assert.equal(decision.modelId, 'claude-opus-5');
  assert.equal(decision.explicit, true);
  assert.equal(decision.contractMode, 'explicit');
});

test('own-mode client keeps its own default model (not assignable)', () => {
  const decision = resolveModelForClientRole('gemini', 'implementer', registry, {});
  assert.equal(decision.ownDefaultModel, true);
});