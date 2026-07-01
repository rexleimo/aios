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

/**
 * Runtime directive injection — 从 .aios/config.json 读取 default_mode，
 * 返回对应的 systemPromptAdditions + skills 列表，注入到 harness iteration prompt。
    label: 'Strict AIOS Primary Agent',
    skills: ['superpowers:using-superpowers', 'pre-edit-safety-gate', 'verification-loop'],
    systemPromptAdditions: [
      'You must follow the superpowers workflow before any implementation action.',
      'Invoke verification-before-completion before claiming a task is done.',
    ],
  },
  'harness-runner': {
    label: 'Harness Solo Runner',
    skills: ['aios-long-running-harness', 'harness-init-runner'],
    systemPromptAdditions: [
      'You are running inside the AIOS solo harness.',
      'Record progress with aios memo add after each significant change.',
    ],
  },
  'team-worker': {
    label: 'AIOS Team Worker',
    skills: ['superpowers:using-superpowers'],
    systemPromptAdditions: [
      'You are running as an AIOS team worker subagent.',
      'Stay within assigned scope. Report a clear handoff note when done.',
    ],
  },
};

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
    const configPath = path.join(rootDir, '.aios', 'config.json');
    const { readFileSync, existsSync } = require('node:fs');
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    }
  } catch {
    return null;
  }

  if (!config || !config.default_mode) return null;

  const modeName = config.default_mode;

  // 先查内置 preset
  if (BUILTIN_PRESETS[modeName]) {
    return { modeName, ...BUILTIN_PRESETS[modeName] };
  }

  // 再查 config.mode_presets 中的自定义 preset
  if (config.mode_presets?.[modeName]) {
    return { modeName, ...config.mode_presets[modeName] };
  }

  return null;
}

/**
 * Async 版本，复用 default-mode.mjs 的 resolveDefaultModeInjections。
 * 用于非 hot-path 场景（如 CLI 初始化时检查 directive 状态）。
 */
export async function resolveRuntimeDirectiveInjectionsAsync(rootDir) {
  return resolveDefaultModeInjections(rootDir);
}
