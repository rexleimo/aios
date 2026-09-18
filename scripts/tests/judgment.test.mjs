// scripts/tests/judgment.test.mjs — opt-in 判定闸门的行为契约测试。
//
// 重点不是"能跑通"，而是把"默认关闭 + fail closed"钉死：
// 未开启 / 无凭据 / 超预算 时，网络调用次数必须为 0。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_VENDOR_CONFIG,
  applyVendorOverride,
  defaultJudgmentConfig,
  readJudgmentConfig,
  resolveJudgmentConfigPath,
  resolveVendorConfig,
  validateVendorConfig,
  writeJudgmentConfig,
} from '../lib/judgment/config.mjs';
import {
  askJudgment,
  createJudgmentSession,
  validateAnswer,
  validateQuestions,
} from '../lib/judgment/jev-client.mjs';
import { judgeVerdict, resolveFloors } from '../lib/judgment/verdict.mjs';
import { runJudgmentCommand } from '../lib/judgment/cli.mjs';
import {
  JUDGMENT_TOOL_NAME,
  handleJudgmentTool,
  withJudgmentTool,
} from '../lib/judgment/mcp-tool.mjs';
import {
  STAGE_GATE_QUESTION_ID,
  buildStageGateQuestions,
  evaluateStageAdvanceGate,
  precheckStageEvidence,
} from '../lib/judgment/stage-gate.mjs';
import { handleMessage } from '../aios-mcp-server.mjs';

function tempConfigPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-judgment-'));
  return path.join(dir, 'config.json');
}

function collectedStdout() {
  const chunks = [];
  return {
    write(chunk) { chunks.push(String(chunk)); return true; },
    text() { return chunks.join(''); },
    json() { return JSON.parse(chunks.join('')); },
  };
}

// 可控传输层：记录每次调用，并按脚本返回响应。测试里绝不允许真实网络。
function scriptedTransport(scripts) {
  const queue = Array.isArray(scripts) ? [...scripts] : [scripts];
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const script = queue.length > 1 ? queue.shift() : queue[0];
    if (script instanceof Error) throw script;
    const { status = 200, body = {}, requestId = 'req_test_0001' } = script;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => (name.toLowerCase() === 'x-typesafe-request-id' ? requestId : null) },
      json: async () => body,
    };
  };
  transport.calls = calls;
  return transport;
}

function enabledConfig(overrides = {}) {
  const config = defaultJudgmentConfig();
  config.vendors.typesafe = { ...DEFAULT_VENDOR_CONFIG, enabled: true, ...overrides };
  return config;
}

const NOUL_QUESTION = { reachable: { type: 'noul', instructions: 'Is this request reaching the endpoint?' } };

// ---------------------------------------------------------------- config ----

test('judgment config defaults to disabled and is created nowhere on read', () => {
  const configPath = tempConfigPath();
  const loaded = readJudgmentConfig({ configPath });
  assert.equal(loaded.exists, false);
  assert.equal(loaded.config.vendors.typesafe.enabled, false);
  assert.equal(fs.existsSync(configPath), false, 'reading must not create the config file');
});

test('judgment config falls back to disabled when the file is not valid JSON', () => {
  const configPath = tempConfigPath();
  fs.writeFileSync(configPath, '{ this is not json');
  const loaded = readJudgmentConfig({ configPath });
  assert.equal(loaded.exists, true);
  assert.equal(loaded.config.vendors.typesafe.enabled, false);
  assert.equal(loaded.warnings.length, 1);
});

test('judgment config ignores an invalid vendor entry instead of trusting it', () => {
  const configPath = tempConfigPath();
  fs.writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    vendors: { typesafe: { enabled: true, model: 'jev-latest', actFloor: 0.4, confirmFloor: 0.9, maxCallsPerSession: 1, maxInputChars: 10, timeoutMs: 1000 } },
  }));
  const loaded = readJudgmentConfig({ configPath });
  assert.equal(loaded.config.vendors.typesafe.enabled, false);
  assert.match(loaded.warnings.join('\n'), /confirmFloor must be <= actFloor/);
});

test('judgment config path honors AIOS_JUDGMENT_CONFIG', () => {
  const custom = tempConfigPath();
  assert.equal(resolveJudgmentConfigPath({ env: { AIOS_JUDGMENT_CONFIG: custom } }), path.resolve(custom));
});

test('writeJudgmentConfig round-trips and applyVendorOverride rejects invalid floors', () => {
  const configPath = tempConfigPath();
  const next = applyVendorOverride(defaultJudgmentConfig(), 'typesafe', { enabled: true, actFloor: 0.9, confirmFloor: 0.6 });
  writeJudgmentConfig(next, { configPath });
  const loaded = readJudgmentConfig({ configPath });
  assert.equal(loaded.config.vendors.typesafe.enabled, true);
  assert.equal(loaded.config.vendors.typesafe.actFloor, 0.9);
  assert.throws(
    () => applyVendorOverride(defaultJudgmentConfig(), 'typesafe', { actFloor: 0.2, confirmFloor: 0.7 }),
    /invalid judgment config/,
  );
});

test('validateVendorConfig requires every field to be well typed', () => {
  const ok = validateVendorConfig({ ...DEFAULT_VENDOR_CONFIG });
  assert.equal(ok.ok, true);
  assert.equal(validateVendorConfig({ ...DEFAULT_VENDOR_CONFIG, maxCallsPerSession: 0 }).ok, false);
  assert.equal(validateVendorConfig({ ...DEFAULT_VENDOR_CONFIG, actFloor: 1.5 }).ok, false);
  assert.equal(validateVendorConfig({ ...DEFAULT_VENDOR_CONFIG, enabled: 'yes' }).ok, false);
});

// ---------------------------------------------------------------- client ----

test('askJudgment opens no socket while the gate is disabled', async () => {
  const transport = scriptedTransport({ body: {} });
  const result = await askJudgment({
    state: 'anything',
    questions: NOUL_QUESTION,
    config: defaultJudgmentConfig(),
    env: { TYPESAFE_API_KEY: 'key-present' },
    transport,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'judgment-disabled');
  assert.equal(transport.calls.length, 0, 'a disabled gate must not reach the network');
});

test('askJudgment refuses without the credential, even when enabled', async () => {
  const transport = scriptedTransport({ body: {} });
  const result = await askJudgment({
    state: 'anything',
    questions: NOUL_QUESTION,
    config: enabledConfig(),
    env: {},
    transport,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'credential-missing');
  assert.equal(transport.calls.length, 0);
});

test('askJudgment enforces the call budget before requesting', async () => {
  const transport = scriptedTransport({ body: { model: 'jev-1.13.0', answers: { reachable: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 1, output_tokens: 1 } } });
  const session = createJudgmentSession();
  const config = enabledConfig({ maxCallsPerSession: 1 });
  const first = await askJudgment({ state: 's', questions: NOUL_QUESTION, config, env: { TYPESAFE_API_KEY: 'k' }, transport, session });
  assert.equal(first.ok, true);
  const second = await askJudgment({ state: 's', questions: NOUL_QUESTION, config, env: { TYPESAFE_API_KEY: 'k' }, transport, session });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'budget-calls-exceeded');
  assert.equal(transport.calls.length, 1, 'the budget must be checked before the second request');
});

test('askJudgment enforces the input-size budget before requesting', async () => {
  const transport = scriptedTransport({ body: {} });
  const result = await askJudgment({
    state: 'x'.repeat(500),
    questions: NOUL_QUESTION,
    config: enabledConfig({ maxInputChars: 50 }),
    env: { TYPESAFE_API_KEY: 'k' },
    transport,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'budget-input-exceeded');
  assert.equal(transport.calls.length, 0);
});

test('askJudgment returns a validated answer with provenance on success', async () => {
  const transport = scriptedTransport({
    requestId: 'req_01a0b45e4b9d76d6b5346020c5df7aa9',
    body: {
      model: 'jev-1.13.0',
      answers: { reachable: { type: 'noul', noul: 0.93 } },
      usage: { input_tokens: 325, output_tokens: 17 },
    },
  });
  const result = await askJudgment({
    state: 'probe', questions: NOUL_QUESTION, config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport,
  });
  assert.equal(result.ok, true);
  assert.equal(result.model, 'jev-1.13.0');
  assert.equal(result.requestId, 'req_01a0b45e4b9d76d6b5346020c5df7aa9');
  assert.equal(result.usage.inputTokens, 325);
  assert.equal(result.answers.reachable.noul, 0.93);
  assert.equal(result.answers.reachable.confidence, null, 'noul carries no confidence and must not be fabricated');
  assert.equal(transport.calls[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(transport.calls[0].init.method, 'POST');
  assert.equal(transport.calls[0].init.headers.Authorization, 'Bearer k');
  assert.equal(transport.calls[0].body.model, 'jev-latest');
});

test('askJudgment rejects a response whose answer type does not match the question', async () => {
  const transport = scriptedTransport({
    body: { model: 'jev-1.13.0', answers: { reachable: { type: 'score', score: 1, confidence: 0.9 } }, usage: {} },
  });
  const result = await askJudgment({
    state: 's', questions: NOUL_QUESTION, config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-response');
  assert.match(result.message, /type mismatch/);
});

test('askJudgment rejects a choice answer outside the declared options', async () => {
  const transport = scriptedTransport({
    body: {
      model: 'jev-1.13.0',
      answers: { route: { type: 'choice', choice: 'invented', probabilities: { a: 0.5, b: 0.5 }, confidence: 0.9 } },
      usage: {},
    },
  });
  const result = await askJudgment({
    state: 's',
    questions: { route: { type: 'choice', instructions: 'Which route?', criteria: { a: 'first', b: 'second' } } },
    config: enabledConfig(),
    env: { TYPESAFE_API_KEY: 'k' },
    transport,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-response');
  assert.match(result.message, /not one of the declared options/);
});

test('askJudgment rejects an out-of-range noul and a missing answer id', async () => {
  const outOfRange = scriptedTransport({ body: { model: 'm', answers: { reachable: { type: 'noul', noul: 1.4 } }, usage: {} } });
  const first = await askJudgment({ state: 's', questions: NOUL_QUESTION, config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport: outOfRange });
  assert.equal(first.reason, 'invalid-response');

  const missing = scriptedTransport({ body: { model: 'm', answers: {}, usage: {} } });
  const second = await askJudgment({ state: 's', questions: NOUL_QUESTION, config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport: missing });
  assert.equal(second.reason, 'invalid-response');
  assert.match(second.message, /missing an answer for "reachable"/);
});

test('askJudgment retries 429 and 529 but not 401', async () => {
  const retried = scriptedTransport([
    { status: 429, body: {} },
    { status: 200, body: { model: 'jev-1.13.0', answers: { reachable: { type: 'noul', noul: 0.8 } }, usage: {} } },
  ]);
  const ok = await askJudgment({
    state: 's', questions: NOUL_QUESTION, config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport: retried, sleep: async () => {},
  });
  assert.equal(ok.ok, true);
  assert.equal(retried.calls.length, 2);
  assert.equal(ok.attempts, 2);

  const unauthorized = scriptedTransport({ status: 401, body: {} });
  const failed = await askJudgment({
    state: 's', questions: NOUL_QUESTION, config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport: unauthorized, sleep: async () => {},
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'http-401');
  assert.equal(unauthorized.calls.length, 1, '401 must not be retried');
});

test('validateQuestions rejects malformed criteria per type', () => {
  assert.equal(validateQuestions({}).ok, false);
  assert.match(validateQuestions({ q: { type: 'noul', instructions: 'x', criteria: { yes: 'y' } } }).errors.join(), /only accepts true\/false/);
  assert.match(validateQuestions({ q: { type: 'choice', instructions: 'x', criteria: { only: 'one' } } }).errors.join(), /at least two options/);
  assert.match(validateQuestions({ q: { type: 'score', instructions: 'x', criteria: ['only'] } }).errors.join(), /at least two level descriptions/);
  assert.equal(validateQuestions({ q: { type: 'noul', instructions: 'x' } }).ok, true);
});

test('validateAnswer never coerces a mismatched shape', () => {
  const checked = validateAnswer('q', { type: 'choice', criteria: { a: 'x', b: 'y' } }, { type: 'choice', choice: 'a', probabilities: { a: 0.6, b: 0.4 }, confidence: 0.75 });
  assert.equal(checked.ok, true);
  assert.equal(checked.value.choice, 'a');
  assert.equal(validateAnswer('q', { type: 'noul' }, { type: 'noul', noul: 'high' }).ok, false);
});

// --------------------------------------------------------------- verdict ----

test('resolveFloors only ever raises the action floor', () => {
  const readOnly = resolveFloors({ actFloor: 0.8, confirmFloor: 0.5, riskClass: 'read-only' });
  const guarded = resolveFloors({ actFloor: 0.8, confirmFloor: 0.5, riskClass: 'guarded' });
  const destructive = resolveFloors({ actFloor: 0.8, confirmFloor: 0.5, riskClass: 'destructive' });
  assert.equal(readOnly.effectiveActFloor, 0.8);
  assert.ok(guarded.effectiveActFloor >= readOnly.effectiveActFloor);
  assert.ok(destructive.effectiveActFloor >= guarded.effectiveActFloor);
  assert.ok(destructive.effectiveActFloor <= 1);
  assert.throws(() => resolveFloors({ actFloor: 0.8, confirmFloor: 0.5, riskClass: 'nope' }), /unknown risk class/);
});

test('judgeVerdict maps confidence into act / confirm / abort', () => {
  const base = { actFloor: 0.8, confirmFloor: 0.5, riskClass: 'read-only' };
  const answer = (confidence) => ({ type: 'score', score: 2, confidence, probabilities: { 0: 0.1, 1: 0.9 } });
  assert.equal(judgeVerdict({ ...base, answer: answer(0.95) }).verdict, 'act');
  assert.equal(judgeVerdict({ ...base, answer: answer(0.6) }).verdict, 'confirm');
  assert.equal(judgeVerdict({ ...base, answer: answer(0.2) }).verdict, 'abort');
});

test('judgeVerdict uses the probability for noul and labels it honestly', () => {
  const result = judgeVerdict({
    answer: { type: 'noul', noul: 0.9, confidence: null },
    actFloor: 0.8,
    confirmFloor: 0.5,
    riskClass: 'read-only',
  });
  assert.equal(result.verdict, 'act');
  assert.equal(result.signalKind, 'noul');
  assert.equal(result.signal, 0.9);
  assert.throws(() => judgeVerdict({ answer: { type: 'score' }, actFloor: 0.8, confirmFloor: 0.5 }), /no usable confidence/);
});

test('a destructive risk class can turn an act into a confirm', () => {
  const answer = { type: 'score', score: 3, confidence: 0.85, probabilities: { 0: 0.05, 1: 0.1, 2: 0.85 } };
  assert.equal(judgeVerdict({ answer, actFloor: 0.8, confirmFloor: 0.5, riskClass: 'read-only' }).verdict, 'act');
  assert.equal(judgeVerdict({ answer, actFloor: 0.8, confirmFloor: 0.5, riskClass: 'destructive' }).verdict, 'confirm');
});

// ------------------------------------------------------------------- CLI ----

test('aios judgment status reports disabled with no config, and creates nothing', async () => {
  const configPath = tempConfigPath();
  const stdout = collectedStdout();
  const result = await runJudgmentCommand({ subcommand: 'status', configPath }, { stdout, env: {} });
  assert.equal(result.exitCode, 0);
  assert.match(stdout.text(), /typesafe {2}disabled/);
  assert.match(stdout.text(), /TYPESAFE_API_KEY \(NOT SET\)/);
  assert.equal(fs.existsSync(configPath), false);
});

test('aios judgment ask refuses while disabled and never touches the network', async () => {
  const configPath = tempConfigPath();
  const stdout = collectedStdout();
  const transport = scriptedTransport({ body: {} });
  const result = await runJudgmentCommand(
    { subcommand: 'ask', vendor: 'typesafe', state: 's', questions: JSON.stringify(NOUL_QUESTION), configPath },
    { stdout, env: { TYPESAFE_API_KEY: 'k' }, transport },
  );
  assert.equal(result.exitCode, 3, 'disabled is a distinct exit code, not a crash');
  assert.match(stdout.text(), /judgment unavailable: judgment-disabled/);
  assert.match(stdout.text(), /aios judgment enable typesafe/);
  assert.equal(transport.calls.length, 0);
});

test('aios judgment enable then ask produces a verdict with provenance', async () => {
  const configPath = tempConfigPath();
  const enableOut = collectedStdout();
  const enableResult = await runJudgmentCommand(
    { subcommand: 'enable', vendor: 'typesafe', actFloor: 0.8, confirmFloor: 0.5, configPath },
    { stdout: enableOut, env: { TYPESAFE_API_KEY: 'k' } },
  );
  assert.equal(enableResult.exitCode, 0);
  assert.match(enableOut.text(), /ENABLED/);
  assert.match(enableOut.text(), /TYPESAFE_API_KEY \(present\)/);

  const transport = scriptedTransport({
    requestId: 'req_01a0b45e4b9d76d6b5346020c5df7aa9',
    body: {
      model: 'jev-1.13.0',
      answers: { severity: { type: 'score', score: 2.94, confidence: 0.94, probabilities: { '0': 0.0, '1': 0.01, '2': 0.05, '3': 0.94 } } },
      usage: { input_tokens: 325, output_tokens: 17 },
    },
  });
  const askOut = collectedStdout();
  const askResult = await runJudgmentCommand(
    {
      subcommand: 'ask',
      vendor: 'typesafe',
      state: 'a migration that drops a column',
      questions: JSON.stringify({ severity: { type: 'score', instructions: 'How risky?', criteria: ['Trivial', 'Routine', 'Risky', 'Data loss'] } }),
      risk: 'destructive',
      json: true,
      configPath,
    },
    { stdout: askOut, env: { TYPESAFE_API_KEY: 'k' }, transport },
  );
  assert.equal(askResult.exitCode, 0);
  const payload = askOut.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.provenance.requestId, 'req_01a0b45e4b9d76d6b5346020c5df7aa9');
  assert.equal(payload.provenance.model, 'jev-1.13.0');
  // confidence 0.94 在 destructive（floor 0.8+0.15=0.95）下必须降级为 confirm。
  assert.equal(payload.verdicts.severity.verdict, 'confirm');
  assert.equal(payload.answers.severity.score, 2.94);
});

test('aios judgment disable turns the gate back off', async () => {
  const configPath = tempConfigPath();
  await runJudgmentCommand({ subcommand: 'enable', vendor: 'typesafe', configPath }, { stdout: collectedStdout(), env: { TYPESAFE_API_KEY: 'k' } });
  await runJudgmentCommand({ subcommand: 'disable', vendor: 'typesafe', configPath }, { stdout: collectedStdout(), env: { TYPESAFE_API_KEY: 'k' } });

  const transport = scriptedTransport({ body: {} });
  const result = await runJudgmentCommand(
    { subcommand: 'ask', vendor: 'typesafe', state: 's', questions: JSON.stringify(NOUL_QUESTION), configPath },
    { stdout: collectedStdout(), env: { TYPESAFE_API_KEY: 'k' }, transport },
  );
  assert.equal(result.exitCode, 3);
  assert.equal(transport.calls.length, 0);
});

test('aios judgment enable --probe reports the metered probe result', async () => {
  const configPath = tempConfigPath();
  const stdout = collectedStdout();
  const transport = scriptedTransport({
    requestId: 'req_probe',
    body: { model: 'jev-1.13.0', answers: { reachable: { type: 'noul', noul: 0.97 } }, usage: { input_tokens: 120, output_tokens: 3 } },
  });
  const result = await runJudgmentCommand(
    { subcommand: 'enable', vendor: 'typesafe', probe: true, configPath },
    { stdout, env: { TYPESAFE_API_KEY: 'k' }, transport },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(transport.calls.length, 1, 'the probe is the only call, and only because the user asked for it');
  assert.match(stdout.text(), /probe {7}ok \(jev-1\.13\.0, request=req_probe, usage=120\/3\)/);
});

// ---------------------------------------------------------------------------
// t4 — MCP 工具面：关闭时 aios_judge 根本不在工具表里
// ---------------------------------------------------------------------------

test('withJudgmentTool appends aios_judge only when enabled AND credentialed', () => {
  const base = [{ name: 'aios_plan_status' }];

  const disabled = withJudgmentTool(base, { config: defaultJudgmentConfig(), env: {} });
  assert.equal(disabled, base, 'disabled must hand back the original array untouched');

  const uncredentialed = withJudgmentTool(base, { config: enabledConfig(), env: {} });
  assert.equal(uncredentialed.length, 1, 'enabled without a credential still hides the tool');

  const live = withJudgmentTool(base, { config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' } });
  assert.equal(live.length, 2);
  assert.equal(live[0], base[0], 'existing tools are passed through by reference');
  assert.equal(live[1].name, JUDGMENT_TOOL_NAME);
});

test('aios_judge refuses with zero network calls while the gate is disabled', async () => {
  const transport = scriptedTransport({ body: {} });
  const result = await handleJudgmentTool(
    { state: 'anything', questions: NOUL_QUESTION },
    { config: defaultJudgmentConfig(), env: {}, transport },
  );
  assert.equal(result.isError, true);
  assert.equal(transport.calls.length, 0);
  assert.match(result.content[0].text, /"reason": "judgment-disabled"/);
});

test('aios_judge refuses with zero network calls when the credential is absent', async () => {
  const transport = scriptedTransport({ body: {} });
  const result = await handleJudgmentTool(
    { state: 'anything', questions: NOUL_QUESTION },
    { config: enabledConfig(), env: {}, transport },
  );
  assert.equal(result.isError, true);
  assert.equal(transport.calls.length, 0);
  assert.match(result.content[0].text, /"reason": "credential-missing"/);
});

test('aios_judge maps every question type to a verdict and labels the answer a proposal', async () => {
  const transport = scriptedTransport({
    requestId: 'req_judge_1',
    body: {
      model: 'jev-1.13.0',
      answers: {
        reachable: { type: 'noul', noul: 0.97 },
        severity: { type: 'score', score: 2.94, confidence: 0.94, probabilities: { '0': 0.01, '1': 0.02, '2': 0.94, '3': 0.03 } },
        owner: { type: 'choice', choice: 'platform', confidence: 0.51, probabilities: { platform: 0.51, app: 0.49 } },
      },
      usage: { input_tokens: 300, output_tokens: 9 },
    },
  });

  const result = await handleJudgmentTool({
    state: 'a change is proposed',
    riskClass: 'guarded',
    questions: {
      ...NOUL_QUESTION,
      severity: { type: 'score', instructions: 'How severe is it?', criteria: ['none', 'annoying', 'blocking'] },
      owner: { type: 'choice', instructions: 'Which team owns this?', criteria: { platform: 'platform team', app: 'app team' } },
    },
  }, { config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport });

  assert.equal(result.isError, undefined);
  assert.equal(transport.calls.length, 1);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.ok, true);
  assert.equal(payload.disposition, 'proposal-not-fact', 'a judgment is never a repository fact');
  assert.equal(payload.requestId, 'req_judge_1');
  assert.equal(payload.model, 'jev-1.13.0');
  assert.deepEqual(payload.usage, { inputTokens: 300, outputTokens: 9 });
  assert.equal(payload.verdicts.reachable.verdict, 'act');
  assert.equal(payload.verdicts.reachable.signalKind, 'noul');
  assert.equal(payload.verdicts.severity.verdict, 'act');
  assert.equal(payload.verdicts.owner.verdict, 'confirm', '0.51 sits between the two floors');
  assert.equal(transport.calls[0].body.model, DEFAULT_VENDOR_CONFIG.model);
  assert.equal(transport.calls[0].body.questions.reachable.type, 'noul');
});

test('aios_judge rejects an unknown risk class without calling out', async () => {
  const transport = scriptedTransport({ body: {} });
  const result = await handleJudgmentTool(
    { state: 'x', questions: NOUL_QUESTION, riskClass: 'whatever' },
    { config: enabledConfig(), env: { TYPESAFE_API_KEY: 'k' }, transport },
  );
  assert.equal(result.isError, true);
  assert.equal(transport.calls.length, 0);
  assert.match(result.content[0].text, /invalid-risk-class/);
});

// 端到端：跑真实的 tools/list 与 tools/call 分发，而不是只测辅助函数。
test('the running MCP server hides aios_judge until enable and credential are both true', async () => {
  const configPath = tempConfigPath();
  writeJudgmentConfig(enabledConfig(), { configPath });
  const missing = path.join(path.dirname(configPath), 'missing.json');
  const savedConfig = process.env.AIOS_JUDGMENT_CONFIG;
  const savedKey = process.env.TYPESAFE_API_KEY;
  const listTools = async (id) => (await handleMessage({ jsonrpc: '2.0', id, method: 'tools/list' })).result.tools;
  const named = (tools) => tools.some((tool) => tool.name === JUDGMENT_TOOL_NAME);

  try {
    process.env.AIOS_JUDGMENT_CONFIG = missing;
    delete process.env.TYPESAFE_API_KEY;
    const off = await listTools(1);
    assert.equal(named(off), false, 'default off: the tool is simply absent from the list');

    process.env.AIOS_JUDGMENT_CONFIG = configPath;
    const uncredentialed = await listTools(2);
    assert.equal(named(uncredentialed), false, 'enabled but uncredentialed still hides it');
    assert.equal(uncredentialed.length, off.length);

    process.env.TYPESAFE_API_KEY = 'k';
    const on = await listTools(3);
    assert.equal(named(on), true);
    assert.equal(on.length, off.length + 1, 'exactly one tool is added');

    // 纵深防御：即使绕过 tools/list 直接 call，关闭状态下也必须被拒。
    process.env.AIOS_JUDGMENT_CONFIG = missing;
    const call = await handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: JUDGMENT_TOOL_NAME, arguments: { state: 'x', questions: NOUL_QUESTION } },
    });
    assert.equal(call.result.isError, true);
  } finally {
    if (savedConfig === undefined) delete process.env.AIOS_JUDGMENT_CONFIG;
    else process.env.AIOS_JUDGMENT_CONFIG = savedConfig;
    if (savedKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = savedKey;
  }
});

// ---------------------------------------------------------------------------
// t5 — rex 阶段闸门：只能收窄，且关闭时行为与引入前一致
// ---------------------------------------------------------------------------

const STAGE_COMMAND = Object.freeze({
  activationId: 'act-1',
  capabilityId: 'implement',
  stageId: 'stage-1',
  provider: Object.freeze({ id: 'agent' }),
});

function stageOutput(evidence) {
  return `provider finished\nAIOS_REX_EVIDENCE=${JSON.stringify({ schemaVersion: 1, activationId: 'act-1', evidence })}\n`;
}

const VERIFIABLE_OUTPUT = () => stageOutput([{ kind: 'tests-passed', refs: ['cmd:npm run test:scripts -> 0 fail'] }]);

test('the stage gate question ships an explicit true/false boundary', () => {
  const questions = buildStageGateQuestions();
  const question = questions[STAGE_GATE_QUESTION_ID];
  assert.equal(question.type, 'noul');
  assert.equal(typeof question.criteria.true, 'string');
  assert.equal(typeof question.criteria.false, 'string');
  assert.equal(validateQuestions(questions).ok, true);
});

test('precheckStageEvidence refuses evidence with no usable ref', () => {
  assert.equal(precheckStageEvidence({ evidence: [] }).ok, false);
  assert.equal(precheckStageEvidence({ evidence: [{ kind: 'a', refs: [] }] }).ok, false);
  assert.equal(precheckStageEvidence({ evidence: [{ kind: 'a', refs: ['  '] }] }).ok, false);
  assert.equal(precheckStageEvidence({ evidence: [{ kind: 'a', refs: ['cmd:x'] }] }).ok, true);
  assert.equal(precheckStageEvidence({ evidence: [{ kind: 'a', refs: [] }, { kind: 'b', refs: ['cmd:y'] }] }).ok, true);
});

test('while disabled the stage gate short-circuits before even parsing the output', async () => {
  const transport = scriptedTransport({ body: {} });
  const gate = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: 'provider said everything is fine (no envelope)',
    config: defaultJudgmentConfig(),
    env: {},
    transport,
  });
  assert.equal(gate.decision, 'advance');
  assert.equal(gate.gate, 'disabled', 'disabled must win before the no-envelope branch, proving the short-circuit');
  assert.equal(transport.calls.length, 0);
});

test('the stage gate advances only on a high-probability verifiable-evidence answer', async () => {
  const transport = scriptedTransport({
    requestId: 'req_gate_1',
    body: {
      model: 'jev-1.13.0',
      answers: { verifiable_evidence: { type: 'noul', noul: 0.95 } },
      usage: { input_tokens: 200, output_tokens: 5 },
    },
  });
  const gate = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: VERIFIABLE_OUTPUT(),
    config: enabledConfig(),
    env: { TYPESAFE_API_KEY: 'k' },
    transport,
  });

  assert.equal(gate.decision, 'advance');
  assert.equal(gate.gate, 'judgment');
  assert.equal(gate.judgment.verdict, 'act');
  assert.equal(gate.judgment.requestId, 'req_gate_1');
  assert.equal(gate.judgment.disposition, 'proposal-not-fact');
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0].body.questions.verifiable_evidence.type, 'noul');
  assert.match(transport.calls[0].body.questions.verifiable_evidence.criteria.true, /independently checkable/);
  // 判定方看到的是证据种类与引用，而不是被喂一份伪造的结论。
  assert.match(transport.calls[0].body.state, /tests-passed/);
  assert.match(transport.calls[0].body.state, /cmd:npm run test:scripts/);
});

test('the stage gate holds when the judgment is merely plausible', async () => {
  const transport = scriptedTransport({ body: { answers: { verifiable_evidence: { type: 'noul', noul: 0.6 } } } });
  const gate = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: VERIFIABLE_OUTPUT(),
    config: enabledConfig(),
    env: { TYPESAFE_API_KEY: 'k' },
    transport,
  });
  assert.equal(gate.decision, 'hold');
  assert.equal(gate.gate, 'judgment');
  assert.equal(gate.judgment.verdict, 'confirm');
});

test('the stage gate leaves the missing-envelope decision to the existing rex path', async () => {
  const transport = scriptedTransport({ body: {} });
  const gate = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: 'provider finished with prose only',
    config: enabledConfig(),
    env: { TYPESAFE_API_KEY: 'k' },
    transport,
  });
  assert.equal(gate.decision, 'advance');
  assert.equal(gate.gate, 'no-envelope');
  assert.equal(transport.calls.length, 0, 'an already-rejected advance is not worth a paid call');
});

test('a stale evidence object is held by the precheck without spending a call', async () => {
  const transport = scriptedTransport({ body: {} });
  const gate = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: 'unused',
    envelope: { schemaVersion: 1, activationId: 'act-1', evidence: [{ kind: 'tests-passed', refs: [] }] },
    config: enabledConfig(),
    env: { TYPESAFE_API_KEY: 'k' },
    transport,
  });
  assert.equal(gate.decision, 'hold');
  assert.equal(gate.gate, 'precheck');
  assert.equal(transport.calls.length, 0);
});

test('a transient judgment failure holds by default and only relaxes when configured', async () => {
  const held = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: VERIFIABLE_OUTPUT(),
    config: enabledConfig(),
    env: { TYPESAFE_API_KEY: 'k' },
    transport: scriptedTransport({ status: 500, body: {} }),
  });
  assert.equal(held.decision, 'hold');
  assert.equal(held.gate, 'judgment-unavailable');
  assert.match(held.reason, /onJudgmentError=hold/);

  const relaxed = await evaluateStageAdvanceGate({
    command: STAGE_COMMAND,
    output: VERIFIABLE_OUTPUT(),
    config: enabledConfig({ onJudgmentError: 'allow' }),
    env: { TYPESAFE_API_KEY: 'k' },
    transport: scriptedTransport({ status: 500, body: {} }),
  });
  assert.equal(relaxed.decision, 'advance');
  assert.equal(relaxed.gate, 'judgment-unavailable');
});

// 升级安全：onJudgmentError 是后加的键，旧配置文件不能因此把已开启的闸门静默关掉。
test('a config written before onJudgmentError existed stays enabled', () => {
  const legacy = { ...DEFAULT_VENDOR_CONFIG, enabled: true };
  delete legacy.onJudgmentError;

  const validated = validateVendorConfig(legacy);
  assert.equal(validated.ok, true, 'a missing optional key must not invalidate the whole vendor entry');
  assert.equal(validated.value.enabled, true);
  assert.equal(validated.value.onJudgmentError, 'hold');

  assert.equal(validateVendorConfig({ ...legacy, onJudgmentError: 'maybe' }).ok, false);
});
