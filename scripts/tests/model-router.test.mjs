import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultModelRegistry,
  resolveModelForTaskDescription,
  resolveModelRoutingForTask,
  scoreTaskSignals,
} from '../lib/model-router.mjs';

const registry = defaultModelRegistry();

function route(taskDescription, extra = {}) {
  return resolveModelRoutingForTask({ taskDescription, registry, env: {}, ...extra });
}

test('balanced routes Chinese browser publishing to GPT-5.5 browser automation', () => {
  const result = route('用浏览器打开小红书发布页面，上传图片并填写标题');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'browser-automation');
  assert.equal(result.modelId, 'gpt-5.5');
  assert.equal(result.clientId, 'codex-cli');
  assert.equal(result.confidence > 0.7, true);
  assert.equal(result.matchedSignals.some((signal) => signal.taskType === 'browser-automation'), true);
  assert.equal(result.why.some((line) => line.includes('browser')), true);
});

test('balanced routes landing page UI work to Kimi frontend', () => {
  const result = route('build a beautiful landing page component');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'frontend');
  assert.equal(result.modelId, 'kimi-k2.6');
});

test('balanced routes production incident logs to self-healing', () => {
  const result = route('修复线上登录故障并分析日志');
  assert.equal(result.profile, 'balanced');
  assert.equal(result.taskType, 'self-healing');
  assert.equal(result.modelId, 'minimax-m2.7');
});

test('balanced keeps long third-party API docs on Gemini research', () => {
  const result = route('阅读一份很长的第三方 API 文档，整理迁移策略');
  assert.equal(result.taskType, 'research');
  assert.equal(result.modelId, 'gemini-3-pro');
});

test('balanced keeps ordinary implementation on DeepSeek', () => {
  const result = route('实现一个新的登录接口，并补测试');
  assert.equal(result.taskType, 'implementation');
  assert.equal(result.modelId, 'deepseek-v4');
});

test('route metadata preserves fallback model ids', () => {
  const result = route('用浏览器打开小红书发布页面，上传图片并填写标题');
  assert.deepEqual(result.fallback, ['kimi-k2.6', 'claude-sonnet']);
});

test('CJK implementation signals avoid matching inside browser form verbs', () => {
  const scored = scoreTaskSignals('打开页面并填写标题', registry, { profile: 'balanced' });
  assert.equal(scored.matchedSignals.some((signal) => signal.taskType === 'implementation'), false);
  assert.equal(scored.matchedSignals.some((signal) => signal.taskType === 'frontend'), false);
});

test('legacy task description resolver uses balanced signal scoring', () => {
  const frontend = resolveModelForTaskDescription('build a beautiful landing page component', registry, {});
  assert.equal(frontend.taskType, 'frontend');
  assert.equal(frontend.modelId, 'kimi-k2.6');

  const review = resolveModelForTaskDescription('review this pull request for code quality', registry, {});
  assert.equal(review.taskType, 'code-review');
  assert.equal(review.modelId, 'claude-opus');
});

test('profile can be overridden by CLI-style option or env', () => {
  const premium = route('实现一个复杂的跨模块重构', { profile: 'premium' });
  assert.equal(premium.profile, 'premium');
  assert.equal(['gpt-5.5', 'claude-opus'].includes(premium.modelId), true);

  const budget = resolveModelRoutingForTask({
    taskDescription: 'build a beautiful landing page component',
    registry,
    env: { AIOS_MODEL_ROUTER_PROFILE: 'budget' },
  });
  assert.equal(budget.profile, 'budget');
  assert.equal(budget.taskType, 'frontend');
});

test('signal scoring exposes multiple matched signals', () => {
  const scored = scoreTaskSignals('设计 model-router 的优化方案并更新 skill 文档和博客', registry, { profile: 'balanced' });
  assert.equal(scored.profile, 'balanced');
  assert.equal(scored.recommendedPhases.length >= 2, true);
  assert.equal(scored.matchedSignals.some((signal) => signal.taskType === 'planning'), true);
  assert.equal(scored.matchedSignals.some((signal) => signal.taskType === 'docs'), true);
});
