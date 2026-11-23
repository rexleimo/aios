import { t } from '../../i18n/t.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, resolveCapabilityCli } from './capability.mjs';

// Resolve alongside the chosen runtime, not the selected project's source tree.
export function searchMcpPreset({ rootDir = repoRoot(), env = process.env, exists = fs.existsSync, node = process.execPath } = {}) {
  const runtime = resolveCapabilityCli(rootDir, env, exists);
  if (!runtime.ok) return { ok: false, error: runtime.error };
  const script = path.join(path.dirname(runtime.script), 'aios-search-mcp.mjs');
  if (!exists(script)) return { ok: false, error: t("当前 AIOS 运行时没有安装 DeepSeek Search MCP 入口。") };
  return {
    ok: true,
    preset: {
      name: 'aios-search',
      entry: { type: 'stdio', command: node, args: [script] },
      requiredEnv: ['DEEPSEEK_API_KEY'],
      description: t("本机 MCP 提供 DeepSeek Search / Fetch，不依赖生成模型，也不会替换客户端所有原生搜索。"),
      costNotice: t("DeepSeek 文档价：成功且非空的 Search / Fetch 每千次各人民币 5 元（英文站美元 0.75）；count 不影响单次价格，生成模型 token 另计，以官方现价为准。预览和安装不调用付费接口。"),
    },
  };
}
