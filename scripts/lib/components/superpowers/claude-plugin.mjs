import path from 'node:path';

import { CLAUDE_PLUGIN_NAME } from './constants.mjs';

// 纯函数：返回 Claude 插件根目录。
export function getClaudePluginsPath(claudeHome) {
  return path.join(claudeHome, 'plugins');
}

// 纯函数：返回 Claude 已安装插件清单路径。
export function getClaudeInstalledPluginsPath(claudeHome) {
  return path.join(getClaudePluginsPath(claudeHome), 'installed_plugins.json');
}

export async function isClaudePluginInstalled(claudeHome) {
  const fs = (await import('node:fs')).default;
  const pluginsPath = getClaudeInstalledPluginsPath(claudeHome);
  if (!fs.existsSync(pluginsPath)) {
    return false;
  }
  try {
    const content = fs.readFileSync(pluginsPath, 'utf8');
    const data = JSON.parse(content);
    return Boolean(data.plugins?.[CLAUDE_PLUGIN_NAME]);
  } catch {
    return false;
  }
}

export function resolveLatestClaudePluginSkillsPath(fs, claudeHome) {
  const pluginCacheBase = path.join(getClaudePluginsPath(claudeHome), 'cache', 'claude-plugins-official', 'superpowers');
  if (!fs.existsSync(pluginCacheBase)) {
    return { pluginCacheBase, pluginSkillsPath: '' };
  }

  const versions = fs.readdirSync(pluginCacheBase).sort().reverse();
  for (const version of versions) {
    const candidate = path.join(pluginCacheBase, version, 'skills');
    if (fs.existsSync(candidate)) {
      return { pluginCacheBase, pluginSkillsPath: candidate };
    }
  }

  return { pluginCacheBase, pluginSkillsPath: '' };
}

export function resolveClaudeSkillSource({ fs, claudeHome, repoSkillsSource, pluginInstalled }) {
  const { pluginCacheBase, pluginSkillsPath } = resolveLatestClaudePluginSkillsPath(fs, claudeHome);
  if (pluginInstalled && pluginSkillsPath) {
    return {
      sourceKind: 'plugin',
      sourcePath: pluginSkillsPath,
      pluginCacheBase,
    };
  }

  return {
    sourceKind: 'repo',
    sourcePath: repoSkillsSource,
    pluginCacheBase,
  };
}
