// scripts/lib/skills/sync/targets.mjs — 技能目标收集与管理函数
// 从 sync.mjs 拆分出的独立模块

import fs from 'node:fs';
import path from 'node:path';

import { GENERATED_SKILL_META_FILE } from '../install-metadata.mjs';
import { isManagedTomlCommand } from '../emitters/toml-command.mjs';

/** 递归扫描目录，收集所有包含 generated skill metadata 的子目录 */
export function collectManagedGeneratedTargets(rootDir) {
  const results = [];
  function walk(absDir) {
    if (!fs.existsSync(absDir)) {
      return;
    }
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      const metaPath = path.join(absPath, GENERATED_SKILL_META_FILE);
      if (fs.existsSync(metaPath)) {
        results.push(absPath);
      }
      walk(absPath);
    }
  }
  walk(rootDir);
  return results;
}

/** 将目标路径格式化为相对路径（用于日志输出） */
export function formatTargetPath(targetRootDir, targetPath) {
  return (path.relative(targetRootDir, targetPath) || '.').replace(/\\\\/g, '/');
}

/** 扫描目录中的 stale AIOS-managed TOML 文件并删除，返回删除数量 */
export function collectStaleTomlTargets(rootAbs, expected) {
  let removed = 0;
  if (!fs.existsSync(rootAbs)) return removed;
  for (const entry of fs.readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const absPath = path.join(rootAbs, entry.name);
    if (expected.has(absPath)) continue;
    if (!isManagedTomlCommand(absPath)) continue;
    fs.rmSync(absPath, { force: true });
    // Also clean up companion metadata
    const metaPath = absPath + '.meta.json';
    if (fs.existsSync(metaPath)) fs.rmSync(metaPath, { force: true });
    removed += 1;
  }
  return removed;
}

/** 收集目录中所有 AIOS-managed TOML 文件的绝对路径（check 模式，非破坏性） */
export function collectTomlManagedPaths(rootAbs) {
  const paths = [];
  if (!fs.existsSync(rootAbs)) return paths;
  for (const entry of fs.readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const absPath = path.join(rootAbs, entry.name);
    if (isManagedTomlCommand(absPath)) paths.push(absPath);
  }
  return paths;
}
