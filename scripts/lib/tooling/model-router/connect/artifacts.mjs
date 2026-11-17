// 中文注释：一键接入的「配置工件」纯函数——为每个客户端生成指向本地网关的可逆配置内容。
// 不写盘、不持密钥：claude/pi 用占位 token，codex 用 env_key 引用；真实上游密钥由网关注入。
// 机制均已零扣费实测：claude --settings 合并覆盖；codex CODEX_HOME 隔离配置；pi HOME 隔离 models.json。
import path from 'node:path';
import { editClaude, editCodex, editPiModels } from './editors.mjs';

// claude：--settings 叠加覆盖 ANTHROPIC_BASE_URL（实测压过用户 ~/.claude/settings.json，且保留其余配置）。
export function claudeSettings(gatewayUrl, modelId = 'aios-auto', catalog = []) {
  return { relPath: 'claude-settings.json', content: editClaude('', gatewayUrl, modelId, catalog).text };
}

// codex：CODEX_HOME 隔离配置。base_url 指到网关 /v1，codex 自行追加 /responses；http_headers 注入 x-gateway-client
// Route via clientDefaults.codex; the gateway translates when the selected upstream is not Responses.
export function codexConfig(gatewayUrl, modelId = 'aios-auto') {
  return { relPath: path.join('codex-home', 'config.toml'), content: editCodex('', gatewayUrl, modelId).text };
}

// pi uses isolated HOME/models.json and the Messages intake; upstream translation stays in the gateway.
export function piModels(gatewayUrl, modelId = 'aios-auto', catalog = []) {
  return { relPath: path.join('pi-home', '.pi', 'agent', 'models.json'), content: editPiModels('', gatewayUrl, modelId, catalog).text };
}

// 中文注释：每个客户端「接入后怎么启动」的命令——单一事实源。connect 写 connect.sh 别名用它，
// 网关状态面（lifecycle）展示可复制步骤也用它，避免两处各抄一份命令字符串而漂移。
export const shellQuote = (value) => `'${String(value).replace(/'/gu, `'\"'\"'`)}'`;
export function connectLaunchCommand(client, stateDir, { piModel = 'aios-auto' } = {}) {
  if (client === 'claude') return `claude --settings ${shellQuote(path.join(stateDir, 'claude-settings.json'))}`;
  if (client === 'codex') return `CODEX_HOME=${shellQuote(path.join(stateDir, 'codex-home'))} codex`;
  if (client === 'pi') return `HOME=${shellQuote(path.join(stateDir, 'pi-home'))} pi --provider aios-gateway --model ${shellQuote(piModel)}`;
  return '';
}
