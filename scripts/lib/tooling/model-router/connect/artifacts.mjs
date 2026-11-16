// 中文注释：一键接入的「配置工件」纯函数——为每个客户端生成指向本地网关的可逆配置内容。
// 不写盘、不持密钥：claude/pi 用占位 token，codex 用 env_key 引用；真实上游密钥由网关注入。
// 机制均已零扣费实测：claude --settings 合并覆盖；codex CODEX_HOME 隔离配置；pi HOME 隔离 models.json。
import path from 'node:path';

const PLACEHOLDER_TOKEN = 'aios-gateway';

function trimSlash(url) {
  return String(url || '').replace(/\/+$/u, '');
}

// claude：--settings 叠加覆盖 ANTHROPIC_BASE_URL（实测压过用户 ~/.claude/settings.json，且保留其余配置）。
export function claudeSettings(gatewayUrl) {
  const document = { env: { ANTHROPIC_BASE_URL: trimSlash(gatewayUrl), ANTHROPIC_AUTH_TOKEN: PLACEHOLDER_TOKEN } };
  return { relPath: 'claude-settings.json', content: `${JSON.stringify(document, null, 2)}\n` };
}

// codex：CODEX_HOME 隔离配置。base_url 指到网关 /v1，codex 自行追加 /responses；http_headers 注入 x-gateway-client
// 让网关按 clientDefaults.codex 选 openai-response 模型（同协议直通）。omit disable_response_storage（0.169 忽略）。
export function codexConfig(gatewayUrl, modelId) {
  const base = `${trimSlash(gatewayUrl)}/v1`;
  const content = `model_provider = "aios-gateway"
model = "${modelId}"

[model_providers.aios-gateway]
name = "aios-gateway"
wire_api = "responses"
base_url = "${base}"
env_key = "OPENAI_API_KEY"
requires_openai_auth = false

[model_providers.aios-gateway.http_headers]
x-gateway-client = "codex"
`;
  return { relPath: path.join('codex-home', 'config.toml'), content };
}

// pi：HOME 隔离 models.json。anthropic-messages 模式 → 网关 /v1/messages（claude 入口），同协议直通。
export function piModels(gatewayUrl, modelId) {
  const document = {
    providers: {
      'aios-gateway': {
        api: 'anthropic-messages',
        apiKey: PLACEHOLDER_TOKEN,
        baseUrl: trimSlash(gatewayUrl),
        models: [
          {
            id: modelId,
            name: 'AIOS Gateway',
            api: 'anthropic-messages',
            contextWindow: 200000,
            maxTokens: 8192,
            input: ['text'],
            reasoning: false,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    },
  };
  return { relPath: path.join('pi-home', '.pi', 'agent', 'models.json'), content: `${JSON.stringify(document, null, 2)}\n` };
}

// 中文注释：每个客户端「接入后怎么启动」的命令——单一事实源。connect 写 connect.sh 别名用它，
// 网关状态面（lifecycle）展示可复制步骤也用它，避免两处各抄一份命令字符串而漂移。
export function connectLaunchCommand(client, stateDir, { piModel = 'gateway-default' } = {}) {
  if (client === 'claude') return `claude --settings ${path.join(stateDir, 'claude-settings.json')}`;
  if (client === 'codex') return `OPENAI_API_KEY=aios-gateway CODEX_HOME=${path.join(stateDir, 'codex-home')} codex`;
  if (client === 'pi') return `HOME=${path.join(stateDir, 'pi-home')} pi --provider aios-gateway --model ${piModel}`;
  return '';
}