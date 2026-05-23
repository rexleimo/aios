import fs from 'node:fs';
import path from 'node:path';

import { collectUnexpectedSkillRootFindings } from '../../platform/fs.mjs';
import { resolveClientSelection } from '../../clients/registry.mjs';

import { loadSkillsCatalog, resolveCatalogEntries, resolveTargetRoot, tryLoadSkillsSyncManifest } from './catalog.mjs';
import {
  INSTALLED_SKILL_META_FILE,
  isLegacyManagedLinkInstall,
  isManagedLinkInstall,
  matchesManagedInstall,
  materializeCatalogEntry,
  snapshotDirectory,
  snapshotsEqual,
} from './install-targets.mjs';
import { normalizeScope, resolveHomeMap } from './normalizers.mjs';
import { assertProjectScopeAllowed, isSourceRepoProjectRoot } from './safety.mjs';

// 纯函数：把诊断输出中的路径统一成 POSIX 风格，避免 Windows 终端断言和文档示例漂移。
function formatDisplayPath(inputPath) {
  return String(inputPath || '').split(path.sep).join('/');
}

export function collectOverrideWarnings({ rootDir, projectRoot, catalog, clientName, selectedSkills, homes, io, manifest }) {
  if (isSourceRepoProjectRoot(rootDir, projectRoot)) {
    return 0;
  }

  const globalRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: 'global', homes });
  const projectScopeRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: 'project', homes });
  const entries = resolveCatalogEntries({
    rootDir,
    catalog,
    clientName,
    scope: 'global',
    selectedSkills,
    manifest,
  }).filter((entry) => entry.scopes.includes('project'));

  let warnings = 0;
  for (const entry of entries) {
    const globalPath = path.join(globalRoot, entry.name);
    const projectPath = path.join(projectScopeRoot, entry.name);
    if (fs.existsSync(globalPath) && fs.existsSync(projectPath)) {
      io.log(`[warn] ${clientName}: ${entry.name} project install overrides global install`);
      warnings += 1;
    }
  }

  return warnings;
}

export async function doctorContextDbSkills({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  scope = 'global',
  selectedSkills = [],
  homeMap = {},
  io = console,
} = {}) {
  const homes = resolveHomeMap(homeMap);
  const normalizedScope = normalizeScope(scope);
  if (normalizedScope === 'project') {
    assertProjectScopeAllowed(rootDir, projectRoot, normalizedScope);
  }

  const catalog = loadSkillsCatalog(rootDir);
  const manifest = tryLoadSkillsSyncManifest(rootDir);
  let warnings = 0;

  io.log('ContextDB Skills Doctor');
  io.log('-----------------------');
  io.log(`Scope: ${normalizedScope}`);

  const unexpectedRoots = collectUnexpectedSkillRootFindings(rootDir);
  for (const finding of unexpectedRoots) {
    io.log(`[warn] repo: non-discoverable skill root ${finding.root} contains SKILL.md files`);
    for (const file of finding.files) {
      io.log(`       move or convert: ${file}`);
    }
    io.log('       repo-local discoverable skills must live under .codex/skills or .claude/skills');
    warnings += 1;
  }

  for (const clientName of resolveClientSelection(client)) {
    const targetRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: normalizedScope, homes });
    const entries = resolveCatalogEntries({ rootDir, catalog, clientName, scope: normalizedScope, selectedSkills, manifest });
    io.log(`${clientName} target root: ${formatDisplayPath(targetRoot)}`);
    if (entries.length === 0) {
      io.log(`[warn] ${clientName} no catalog skills matched scope=${normalizedScope}.`);
      warnings += 1;
      continue;
    }

    let okCount = 0;
    let warnCount = 0;
    for (const entry of entries) {
      const targetPath = path.join(targetRoot, entry.name);
      if (matchesManagedInstall(targetPath, entry, clientName, normalizedScope)) {
        const materialized = materializeCatalogEntry({ rootDir, entry, clientName });
        try {
          const currentSnapshot = snapshotDirectory(targetPath, targetPath, new Map(), new Set([INSTALLED_SKILL_META_FILE]));
          const expectedSnapshot = snapshotDirectory(materialized.directoryPath, materialized.directoryPath, new Map());
          if (snapshotsEqual(currentSnapshot, expectedSnapshot)) {
            io.log(`[ok] ${clientName}: ${entry.name} managed copy install`);
            okCount += 1;
          } else {
            io.log(`[warn] ${clientName}: ${entry.name} managed copy install drifted from catalog source`);
            warnCount += 1;
            warnings += 1;
          }
        } finally {
          materialized.cleanup();
        }
        continue;
      }
      if (isManagedLinkInstall(targetPath, entry)) {
        io.log(`[ok] ${clientName}: ${entry.name} managed link install`);
        okCount += 1;
        continue;
      }
      if (isLegacyManagedLinkInstall(targetPath, entry)) {
        io.log(`[warn] ${clientName}: ${entry.name} legacy managed link install (run update --force to migrate to copy mode)`);
        warnCount += 1;
        warnings += 1;
        continue;
      }
      if (fs.existsSync(targetPath)) {
        io.log(`[warn] ${clientName}: ${entry.name} exists but is not managed by this repo`);
        warnCount += 1;
        warnings += 1;
        continue;
      }
      io.log(`[warn] ${clientName}: ${entry.name} not installed`);
      warnCount += 1;
      warnings += 1;
    }
    io.log(`[summary] ${clientName} ok=${okCount} warn=${warnCount}`);
    warnings += collectOverrideWarnings({ rootDir, projectRoot, catalog, clientName, selectedSkills, homes, io, manifest });
  }

  return { warnings, effectiveWarnings: warnings, errors: 0 };
}
