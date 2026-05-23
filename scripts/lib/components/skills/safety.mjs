import { normalizeScope } from './normalizers.mjs';
import { arePathsEqual } from './path-utils.mjs';

// 纯函数：阻止 project scope 写回源仓库，避免覆盖 repo-managed skills。
export function isSourceRepoProjectRoot(rootDir, projectRoot = rootDir) {
  return arePathsEqual(rootDir, projectRoot || rootDir);
}

export function assertProjectScopeAllowed(rootDir, projectRoot = rootDir, scope = 'global') {
  if (normalizeScope(scope) !== 'project') {
    return;
  }
  if (isSourceRepoProjectRoot(rootDir, projectRoot)) {
    throw new Error('[err] project installs into the source repo are owned by sync-skills; run: node scripts/sync-skills.mjs');
  }
}
