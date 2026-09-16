import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AVAILABILITY_DEFAULTS,
  applyProbeResult,
  availabilityForModel,
  classifyChannelEvidence,
  effectiveAvailability,
  loadModelAvailability,
  recordModelAvailability,
} from '../lib/model-router/availability.mjs';
import { classifyOneShotFailure } from '../lib/ctx-agent-core/one-shot.mjs';
import { MODEL_PROTOCOLS, modelProtocolSet, normalizeModelProtocol, protocolEndpoint } from '../lib/model-router/protocols.mjs';

// 中文注释：可用性是运行时事实，不是注册表里的静态勾。这些用例锁住状态机的判据：
// 一次 404 即定论、连败熔断、慢/静默换模型只降级、TTL 与冷却期回落到 unknown。

test('probe state machine: hard down, circuit breaker, degraded, substitution', () => {
  const now = 1_000_000;

  const notFound = applyProbeResult({}, { modelId: 'gpt-5.6-luna', ok: false, httpStatus: 404, errorClass: 'channel-unavailable' }, { now });
  assert.equal(notFound.state, 'down', 'unbound SKU goes down on the first sighting');
  assert.equal(notFound.consecutiveFailures, 1);

  const firstFlake = applyProbeResult({}, { modelId: 'gpt-5.6-terra', ok: false, httpStatus: 504, errorClass: 'network' }, { now });
  assert.equal(firstFlake.state, 'degraded', 'one transport failure is not yet a verdict');
  const secondFlake = applyProbeResult(firstFlake, { modelId: 'gpt-5.6-terra', ok: false, httpStatus: 504, errorClass: 'network' }, { now: now + 1000 });
  assert.equal(secondFlake.state, 'down');
  assert.equal(secondFlake.consecutiveFailures, AVAILABILITY_DEFAULTS.downAfterConsecutiveFailures);

  const silentSwap = applyProbeResult({}, { modelId: 'glm-5.3', protocol: 'claude', ok: true, servedModelId: 'glm-5.2', latencyMs: 900 }, { now });
  assert.equal(silentSwap.state, 'degraded');
  assert.equal(silentSwap.reason, 'substituted:glm-5.2', 'served id != requested id must be recorded, not celebrated');

  const slow = applyProbeResult({}, { modelId: 'gpt-5.6-sol', ok: true, latencyMs: 48_000 }, { now });
  assert.equal(slow.state, 'degraded');
  assert.match(slow.reason, /^slow:/u);

  const healthy = applyProbeResult(secondFlake, { modelId: 'gpt-5.6-terra', ok: true, latencyMs: 800 }, { now: now + 5000 });
  assert.equal(healthy.state, 'ok');
  assert.equal(healthy.consecutiveFailures, 0);
});

test('availability decays to unknown so a dead channel can be retried', () => {
  const base = 1_700_000_000_000;
  const record = applyProbeResult({}, { modelId: 'gpt-5.6-luna', ok: false, httpStatus: 404 }, { now: base });
  assert.equal(effectiveAvailability(record, { now: base + 1000 }).state, 'down');
  assert.equal(effectiveAvailability(record, { now: base + 1000 }).reason, 'http-404', 'reason keeps the concrete evidence token');
  assert.equal(effectiveAvailability(record, { now: base + AVAILABILITY_DEFAULTS.cooldownMs + 10_000 }).state, 'unknown',
    'down must expire into "no evidence", not stay a permanent verdict');
  assert.equal(effectiveAvailability(null, { now: base }).reason, 'no-evidence');
  assert.equal(effectiveAvailability({ state: 'ok' }, { now: base }).state, 'unknown', 'a record without a timestamp is not evidence');

  const okRecord = applyProbeResult({}, { modelId: 'gpt-6-astra', ok: true, latencyMs: 1500 }, { now: base });
  assert.equal(effectiveAvailability(okRecord, { now: base + AVAILABILITY_DEFAULTS.ttlMs + 1 }).state, 'unknown',
    'TTL expiry must erase stale confidence');
});

test('probe evidence is persisted per model@protocol and readable back', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-availability-'));
  try {
    const written = recordModelAvailability({ modelId: 'gpt-5.6-luna', protocol: 'openai-response', ok: false, httpStatus: 404, errorClass: 'channel-unavailable' }, { cwd, now: 5000 });
    assert.equal(written.ok, true);
    assert.equal(written.key, 'gpt-5.6-luna@openai-response');
    const raw = JSON.parse(fs.readFileSync(written.filePath, 'utf8'));
    assert.equal(raw.models['gpt-5.6-luna@openai-response'].state, 'down');

    const { cache } = loadModelAvailability({ cwd });
    assert.equal(availabilityForModel('gpt-5.6-luna', 'openai-response', { availability: cache, now: 5000 }).state, 'down');
    assert.equal(availabilityForModel('gpt-5.6-luna', 'claude', { availability: cache, now: 5000 }).state, 'unknown', 'a dead channel on one protocol must not poison another');
    assert.equal(fs.existsSync(path.join(cwd, 'memory', 'specs', 'model-availability.json')), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('failure taxonomy separates channel loss from agent misuse', () => {
  assert.equal(classifyChannelEvidence('{"error":{"code":"model_not_found"}}'), 'channel-unavailable');
  assert.equal(classifyChannelEvidence('No available channel under group claude kiro (distributor)'), 'channel-unavailable');
  assert.equal(classifyChannelEvidence('curl: (18) Transferred a partial file / response was truncated'), 'channel-unavailable');
  assert.equal(classifyChannelEvidence('502 Bad Gateway'), 'network');
  assert.equal(classifyChannelEvidence('tool input validation failed'), '');

  assert.equal(classifyOneShotFailure('HTTP 404 model_not_found for gpt-5.6-luna'), 'channel-unavailable');
  assert.equal(classifyOneShotFailure('503 Service Unavailable'), 'network');
  assert.equal(classifyOneShotFailure('Exit code: 1 Invalid arguments for tool read'), 'tool');
});

test('protocol vocabulary stays normalized and endpoint-addressable', () => {
  assert.deepEqual(MODEL_PROTOCOLS, ['openai-chat', 'openai-response', 'claude', 'gemini']);
  assert.equal(normalizeModelProtocol('anthropic-messages'), 'claude');
  assert.equal(normalizeModelProtocol('openai_completions'), 'openai-chat');
  assert.equal(normalizeModelProtocol('responses'), 'openai-response');
  assert.equal(normalizeModelProtocol('GEMINI'), 'gemini');
  assert.equal(normalizeModelProtocol('mystery-dialect'), '');
  assert.equal(protocolEndpoint('claude'), 'https://coding.rexai.top/claude/v1/messages');
  assert.equal(protocolEndpoint('gemini').endsWith('/gemini/v1beta/models'), true);
  assert.deepEqual(modelProtocolSet({ protocols: ['claude', 'claude', 'bogus'] }), ['claude']);
  assert.deepEqual(modelProtocolSet({ provider: 'claude' }), [], 'provider is not a protocol');
});
