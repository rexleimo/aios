import fs from 'node:fs';
import path from 'node:path';

import { normalizeScope } from './normalizers.mjs';
import { arePathsEqual } from './path-utils.mjs';

// AIOS 源仓库检出（或其安装副本）自带的标记：包名 + 由 sync-skills 拥有项目内安装的脚本。
// 两个标记同时命中才算源仓库，避免把普通用户项目误判成豁免对象。
const SOURCE_REPO_PACKAGE_NAME = 'aios-scripts';
const SOURCE_REPO_MARKER_FILES = Object.freeze([['scripts', 'sync-skills.mjs']]);
const sourceCheckoutProbeCache = new Map();

// 带缓存的磁盘探测：同一目录只 stat 一次；任何读取失败都判为“非源仓库”。
export function isAiosSourceCheckout(candidateRoot) {
  if (!candidateRoot) return false;
  let resolved;
  try {
    resolved = path.resolve(String(candidateRoot));
  } catch {
    return false;
  }
  if (sourceCheckoutProbeCache.has(resolved)) return sourceCheckoutProbeCache.get(resolved);
  let verdict = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf8'));
    if (pkg?.name === SOURCE_REPO_PACKAGE_NAME) {
      verdict = SOURCE_REPO_MARKER_FILES.every((segments) => fs.existsSync(path.join(resolved, ...segments)));
    }
  } catch {
    verdict = false;
  }
  sourceCheckoutProbeCache.set(resolved, verdict);
  return verdict;
}

// 判定 projectRoot 的 skill 安装是否由源仓库自己拥有：既包含 rootDir 与 projectRoot
// 同一个目录的老情形，也包含“安装在别处、但项目本身就是 AIOS 检出”的情形——后者此前
// 漏判，导致在 AIOS 仓库里跑 doctor 时逐条刷出 project overrides global 告警。
export function isSourceRepoProjectRoot(rootDir, projectRoot = rootDir) {
  const target = projectRoot || rootDir;
  return arePathsEqual(rootDir, target) || isAiosSourceCheckout(target);
}

export function assertProjectScopeAllowed(rootDir, projectRoot = rootDir, scope = 'global') {
  if (normalizeScope(scope) !== 'project') {
    return;
  }
  if (isSourceRepoProjectRoot(rootDir, projectRoot)) {
    throw new Error('[err] project installs into the source repo are owned by sync-skills; run: node scripts/sync-skills.mjs');
  }
}
