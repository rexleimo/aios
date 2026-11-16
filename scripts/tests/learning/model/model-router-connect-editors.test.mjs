import test from 'node:test';
import assert from 'node:assert/strict';

import {
  editClaude, restoreClaude,
  editCodex, restoreCodex,
  editPiSettings, restorePiSettings,
  editPiModels, restorePiModels,
  clientConfigPaths,
} from '../../../lib/tooling/model-router/connect/editors.mjs';

const GW = 'http://127.0.0.1:8686';

test('claude：只改 env 两个 key，保留其它 env/model/permissions 与原值备份，restore 还原', () => {
  const original = `{
  "model": "claude-sonnet-5",
  "env": {
    "ANTHROPIC_BASE_URL": "https://user-relay.example",
    "OTHER_VAR": "keep-me"
  },
  "permissions": { "allow": ["Bash"] }
}
`;
  const { text, backup } = editClaude(original, GW);
  const doc = JSON.parse(text);
  assert.equal(doc.env.ANTHROPIC_BASE_URL, GW);
  assert.equal(doc.env.ANTHROPIC_AUTH_TOKEN, 'aios-gateway');
  assert.equal(doc.env.OTHER_VAR, 'keep-me', '其它 env 变量不动');
  assert.equal(doc.model, 'claude-sonnet-5', 'model 不动（网关服务端路由）');
  assert.deepEqual(doc.permissions, { allow: ['Bash'] }, '其它顶层 key 不动');
  assert.equal(backup.baseUrl, 'https://user-relay.example');
  assert.equal(backup.authToken, null, '原本没有 AUTH_TOKEN → 备份 null');

  const restored = JSON.parse(restoreClaude(text, backup));
  assert.equal(restored.env.ANTHROPIC_BASE_URL, 'https://user-relay.example', '还原原 base url');
  assert.ok(!('ANTHROPIC_AUTH_TOKEN' in restored.env), '原本没有的 key 还原时删除');
  assert.equal(restored.env.OTHER_VAR, 'keep-me');
  assert.equal(restored.model, 'claude-sonnet-5');
});

test('claude：空配置接入再还原 → env 整块移除，回到空对象', () => {
  const { text, backup } = editClaude('{}\n', GW);
  assert.equal(backup.hadEnv, false);
  assert.equal(JSON.parse(text).env.ANTHROPIC_BASE_URL, GW);
  const restored = JSON.parse(restoreClaude(text, backup));
  assert.ok(!('env' in restored), '原本无 env → 还原后不留空 env');
});

test('claude：沿用原缩进（4 空格不被压成 2）', () => {
  const original = '{\n    "env": {\n        "ANTHROPIC_BASE_URL": "https://x"\n    }\n}\n';
  const { text } = editClaude(original, GW);
  assert.match(text, /\n {4}"env"/u, '保留 4 空格缩进');
});

const CODEX_ORIGINAL = `# 用户自己的 codex 配置
model_provider = "custom"
model = "gpt-6-astra"

[model_providers.custom]
name = "custom"
base_url = "https://user-relay.example/v1"
wire_api = "responses"
env_key = "USER_KEY"
`;

test('codex：只改 model_provider + 追加带标记块，保留注释/其它 provider/model，restore 还原', () => {
  const { text, backup } = editCodex(CODEX_ORIGINAL, GW);
  assert.match(text, /^model_provider = "aios-gateway"$/mu);
  assert.match(text, /# 用户自己的 codex 配置/u, '注释保留');
  assert.match(text, /\[model_providers\.custom\]/u, '用户 provider 保留');
  assert.match(text, /base_url = "https:\/\/user-relay\.example\/v1"/u, '用户 provider 内容不动');
  assert.match(text, /^model = "gpt-6-astra"$/mu, 'model 不动');
  assert.match(text, /\[model_providers\.aios-gateway\]/u);
  assert.match(text, /experimental_bearer_token = "aios-gateway"/u, '内联占位 token，免 env');
  assert.match(text, /requires_openai_auth = false/u);
  assert.equal((text.match(/# aios-gateway:begin/gu) || []).length, 1, '只有一个标记块');
  assert.equal(backup.modelProvider, '"custom"');

  const restored = restoreCodex(text, backup);
  assert.match(restored, /^model_provider = "custom"$/mu, '还原原 provider');
  assert.ok(!restored.includes('aios-gateway'), '我们的块被移除');
  assert.match(restored, /\[model_providers\.custom\]/u, '用户 provider 仍在');
  assert.match(restored, /# 用户自己的 codex 配置/u);
});

test('codex：重复接入幂等（不堆叠标记块）', () => {
  const once = editCodex(CODEX_ORIGINAL, GW).text;
  const twice = editCodex(once, GW).text;
  assert.equal((twice.match(/# aios-gateway:begin/gu) || []).length, 1);
  assert.equal((twice.match(/\[model_providers\.aios-gateway\]/gu) || []).length, 1);
});

test('codex：原本没有 model_provider → 插入；restore 移除插入的行', () => {
  const original = 'model = "x"\n\n[model_providers.custom]\nname = "c"\n';
  const { text, backup } = editCodex(original, GW);
  assert.equal(backup.modelProvider, null);
  assert.match(text, /^model_provider = "aios-gateway"$/mu);
  const restored = restoreCodex(text, backup);
  assert.ok(!/^\s*model_provider\s*=/mu.test(restored), '原本没有 → 还原后不留该行');
});

test('pi：settings 设 defaultProvider/defaultModel，models 加 provider，保留其它内容，restore 还原', () => {
  const settings = `{
  "defaultModel": "grok/grok-4.7",
  "defaultProvider": "magpie",
  "theme": "dark"
}
`;
  const models = `{
  "providers": {
    "grok": { "api": "openai-chat", "baseUrl": "https://x.ai", "models": [] }
  }
}
`;
  const s = editPiSettings(settings, 'gateway-default');
  const sd = JSON.parse(s.text);
  assert.equal(sd.defaultProvider, 'aios-gateway');
  assert.equal(sd.defaultModel, 'aios-gateway/gateway-default');
  assert.equal(sd.theme, 'dark', '其它 settings 不动');
  assert.equal(s.backup.defaultProvider, 'magpie');

  const m = editPiModels(models, GW, 'gateway-default');
  const md = JSON.parse(m.text);
  assert.equal(md.providers['aios-gateway'].baseUrl, GW);
  assert.equal(md.providers['aios-gateway'].apiKey, 'aios-gateway');
  assert.ok(md.providers.grok, '用户 provider 保留');

  const sr = JSON.parse(restorePiSettings(s.text, s.backup));
  assert.equal(sr.defaultProvider, 'magpie', '还原原 provider');
  assert.equal(sr.defaultModel, 'grok/grok-4.7');
  const mr = JSON.parse(restorePiModels(m.text, m.backup));
  assert.ok(!('aios-gateway' in mr.providers), '我们的 provider 移除');
  assert.ok(mr.providers.grok, '用户 provider 仍在');
});

test('clientConfigPaths：每客户端真实文件路径单一事实源', () => {
  const paths = clientConfigPaths('/home/u');
  assert.deepEqual(paths.claude, ['/home/u/.claude/settings.json']);
  assert.deepEqual(paths.codex, ['/home/u/.codex/config.toml']);
  assert.deepEqual(paths.pi, ['/home/u/.pi/agent/settings.json', '/home/u/.pi/agent/models.json']);
});