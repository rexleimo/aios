import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildModelSummaryTable,
  buildRoutingTableMarkdown,
  defaultModelRegistry,
  resolveModelForTaskDescription,
  resolveModelRoutingForTask,
  scoreTaskSignals,
  classifyTaskIntent,
} from '../lib/model-router.mjs';

const registry = defaultModelRegistry();

function route(taskDescription, extra = {}) {
  return resolveModelRoutingForTask({ taskDescription, registry, env: {}, ...extra });
}

test('no explicit task type falls back to general instead of guessing intent', () => {
  // 北极星原则：程序不猜"这个任务是什么类型"，无显式声明时回退 deterministic 默认。
  const result = route('用浏览器打开小红书发布页面，上传图片并填写标题');
  assert.equal(result.taskType, 'general');
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.matchedSignals, []);
  assert.equal(result.why.some((line) => line.includes('no keyword guessing')), true);
});

test('explicit task type routes precisely to its configured model', () => {
  const result = route('', { taskType: 'browser-automation' });
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'browser-automation');
  assert.equal(result.modelId, 'gpt-5.5');
  assert.equal(result.clientId, 'codex-cli');
  assert.equal(result.confidence, 1);
});

test('explicit frontend task type routes to Kimi', () => {
  const result = route('', { taskType: 'frontend' });
  assert.equal(result.taskType, 'frontend');
  assert.equal(result.modelId, 'kimi-k2.6');
});

test('explicit self-healing task type routes to minimax', () => {
  const result = route('', { taskType: 'self-healing' });
  assert.equal(result.taskType, 'self-healing');
  assert.equal(result.modelId, 'minimax-m2.7');
});

test('explicit research task type routes to Gemini', () => {
  const result = route('', { taskType: 'research' });
  assert.equal(result.taskType, 'research');
  assert.equal(result.modelId, 'gemini-3-pro');
});

test('explicit implementation task type routes to DeepSeek', () => {
  const result = route('', { taskType: 'implementation' });
  assert.equal(result.taskType, 'implementation');
  assert.equal(result.modelId, 'deepseek-v4');
});

test('route metadata preserves fallback model ids for explicit task type', () => {
  const result = route('', { taskType: 'browser-automation' });
  assert.deepEqual(result.fallback, ['kimi-k2.6', 'claude-sonnet']);
});

test('route metadata shows unattended launch flags for explicit task types', () => {
  const codex = route('', { taskType: 'browser-automation' });
  assert.match(codex.cliCommand, /codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5\.5/u);

  const claude = route('', { taskType: 'code-review' });
  assert.match(claude.cliCommand, /claude --model claude-opus-4-7 --dangerously-skip-permissions -p/u);

  const gemini = route('', { taskType: 'research' });
  assert.match(gemini.cliCommand, /gemini -m gemini-3-pro --yolo -p/u);
});

test('scoreTaskSignals never guesses signals from free text', () => {
  const scored = scoreTaskSignals('打开页面并填写标题', registry, { profile: 'balanced' });
  assert.deepEqual(scored.matchedSignals, []);
  assert.equal(scored.primaryType, 'general');
  assert.equal(scored.confidence, 0);
});

test('classifyTaskIntent returns deterministic default without explicit intent', () => {
  const gate = classifyTaskIntent('设计 model-router 的优化方案');
  assert.equal(gate.intent, 'implement');
  assert.equal(gate.confidence, 0);
  assert.deepEqual(gate.matchedKeywords, []);
});

test('classifyTaskIntent honors an explicitly declared intent', () => {
  const gate = classifyTaskIntent('', 'review');
  assert.equal(gate.intent, 'review');
  assert.equal(gate.confidence, 1);
  assert.equal(gate.preferredTaskType, 'code-review');
});

test('legacy task description resolver falls back to general without guessing', () => {
  const result = resolveModelForTaskDescription('build a beautiful landing page component', registry, {});
  assert.equal(result.taskType, 'general');
});

test('profile can be overridden by CLI-style option or env', () => {
  const premium = route('', { taskType: 'architecture', profile: 'premium' });
  assert.equal(premium.profile, 'premium');
  assert.equal(['gpt-5.5', 'claude-opus'].includes(premium.modelId), true);

  const budget = resolveModelRoutingForTask({
    taskType: 'frontend',
    registry,
    env: { AIOS_MODEL_ROUTER_PROFILE: 'budget' },
  });
  assert.equal(budget.profile, 'budget');
  assert.equal(budget.taskType, 'frontend');
});

test('model-router reports render Chinese headers without mojibake', () => {
  const summary = buildModelSummaryTable(registry);
  const routing = buildRoutingTableMarkdown(registry);
  const combined = `${summary}\n${routing}`;

  assert.match(summary, /\| 模型 \| 定位 \| 最擅长 \| 成本 \| 速度 \|/u);
  assert.match(routing, /\| 任务类型 \| 首选模型 \| 降级链 \|/u);
  assert.match(routing, / → /u);
  assert.doesNotMatch(combined, /[\u59af\u7037\u7039\u93c8\u93bf\u95ab\u922b]\??/u);
});

test('model-router entrypoint stays a thin facade over focused modules', async () => {
  const root = path.resolve('scripts', 'lib');
  const entry = await readFile(path.join(root, 'model-router.mjs'), 'utf8');
  const entryLines = entry.split(/\r?\n/u).length;
  assert.equal(entryLines <= 180, true, `model-router.mjs is ${entryLines} lines; split responsibilities into scripts/lib/model-router/*`);

  for (const moduleName of [
    'shared.mjs',
    'registry.mjs',
    'profile.mjs',
    'signals.mjs',
    'selection.mjs',
    'client-cli.mjs',
    'routing.mjs',
    'reporting.mjs',
    'history.mjs',
    'command.mjs',
  ]) {
    const source = await readFile(path.join(root, 'model-router', moduleName), 'utf8');
    assert.match(source, /export/u, `${moduleName} should expose focused model-router APIs`);
  }
});
