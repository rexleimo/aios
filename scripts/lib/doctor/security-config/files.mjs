import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function detectGitRoot(cwd) {
  try {
    const txt = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const value = txt.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function isFile(targetPath) {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

export function listFilesIfPresent(workspace, relPaths) {
  const out = [];
  for (const rel of relPaths) {
    const abs = path.join(workspace, rel);
    if (isFile(abs)) out.push(abs);
  }
  return out;
}

export function listAgentRoleFiles(workspace, relDir, extensions = ['.md']) {
  const absDir = path.join(workspace, relDir);
  let entries = [];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const lowerName = ent.name.toLowerCase();
    if (!extensions.some((extension) => lowerName.endsWith(extension))) continue;
    out.push(path.join(absDir, ent.name));
  }
  return out;
}

export function listAgentMdFiles(workspace, relDir) {
  return listAgentRoleFiles(workspace, relDir, ['.md']);
}

export function listFilesUnder(workspace, relDir, predicate) {
  const absDir = path.join(workspace, relDir);
  const out = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }
      if (entry.isFile() && predicate(entry.name, absPath)) {
        out.push(absPath);
      }
    }
  }

  walk(absDir);
  return out;
}

export function readTextSafe(filePath, maxBytes) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > maxBytes) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function relativeTo(workspace, filePath) {
  try {
    const rel = path.relative(workspace, filePath);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
  } catch {
    // ignore
  }
  return String(filePath).replace(/\\/g, '/');
}

export function pickGlobalConfigFiles(homeDir, env = process.env) {
  // 各客户端真实存在的全局(home 作用域)配置文件。
  // 注意：~/.claude/mcp.json 不是 Claude Code 的真实 MCP 位置（其 MCP 走项目 .mcp.json / ~/.claude.json），
  // 故不扫描；opencode 的真实配置是 ~/.config/opencode/opencode.json。
  const candidates = [
    path.join(homeDir, '.codex', 'config.toml'),
    path.join(homeDir, '.claude', 'settings.json'),
    path.join(homeDir, '.claude.json'),
    path.join(homeDir, '.gemini', 'settings.json'),
  ];

  const xdg = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME
    : path.join(homeDir, '.config');
  candidates.push(path.join(xdg, 'opencode', 'opencode.json'));

  return candidates.filter(isFile);
}
