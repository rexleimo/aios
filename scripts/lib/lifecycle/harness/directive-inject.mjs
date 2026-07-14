/**
 * Runtime directive injection — 从 .aios/config.json 读取 default_mode，
 * 返回对应的 systemPromptAdditions + skills 列表，注入到 harness iteration prompt。
 *
 * 这是原创的 runtime directive 体系，不抄 oh-my-openagent 的 ULTRAWORK 关键词检测。
 * 核心价值: 让 agent pipeline 在启动时就能读到一致的 directive 配置，
 * 避免每轮 prompt 上下文不一致。
 *
 * 配置文件: .aios/config.json
 *   {
 *     "default_mode": "strict-primary" | "harness-runner" | "team-worker" | <custom>,
 *     "mode_presets": { ... }
 *   }
 *
 * 参考: scripts/lib/lifecycle/options/default-mode.mjs (已有的 preset 定义)
 */

import { readFileSync, existsSync } from 'node:fs';
import { getModePreset, resolveDefaultModeInjections } from '../options/default-mode.mjs';
import { join } from 'node:path';

/**
 * 同步版本: 从 rootDir 读取 .aios/config.json，返回 active mode 的 injections。
 * 如果没有配置 default_mode 或文件不存在，返回 null。
 *
 * @param {string} rootDir - workspace 根目录
 * @returns {{ modeName: string, label: string, skills: string[], systemPromptAdditions: string[] } | null}
 */
export function resolveRuntimeDirectiveInjections(rootDir) {
  if (!rootDir) return null;

  // 同步读取 .aios/config.json
  let config = null;
  try {
    const configPath = join(rootDir, '.aios', 'config.json');
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf8');
      if (content.trim() === '') {
        return null;
      }
      config = JSON.parse(content);
    }
  } catch {
    return null;
  }

  if (!config || !config.default_mode) return null;

  const modeName = config.default_mode;

  const preset = getModePreset(modeName, config);
  if (!preset) return null;
  return {
    modeName,
    label: preset.label,
    skills: preset.skills || [],
    systemPromptAdditions: preset.systemPromptAdditions || [],
  };
}

/**
 * Async 版本，复用 default-mode.mjs 的 resolveDefaultModeInjections。
 * 用于非 hot-path 场景（如 CLI 初始化时检查 directive 状态）。
 */
export async function resolveRuntimeDirectiveInjectionsAsync(rootDir) {
  return resolveDefaultModeInjections(rootDir);
}
