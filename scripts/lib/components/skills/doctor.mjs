import fs from 'node:fs';
import path from 'node:path';

import { collectUnexpectedSkillRootFindings } from '../../platform/fs.mjs';
import { getAgentsHome } from '../../platform/paths.mjs';
import { resolveClientSelection } from '../../clients/registry.mjs';

import { analyzeCatalogEntries, loadSkillsCatalog, resolveTargetRoot, tryLoadSkillsSyncManifest } from './catalog.mjs';
import { GENERATED_SKILL_META_FILE } from '../../skills/install-metadata.mjs';
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

// 纯函数：旧版布局曾把 AIOS 托管 skill 写进共享 agents home（~/.agents/skills），
// 现行布局只写各客户端 home；带 AIOS metadata 的目录是升级残留，会让 Pi 等客户端
// 在共享根扫描时产生同名冲突告警。仅收集 AIOS 托管项，无 metadata 的视为用户自有。
export function collectLegacySharedRootInstalls(agentsHome) {
  const skillsDir = path.join(String(agentsHome || ''), 'skills');
  let entries = [];
  try {
    entries = fs.readdirSync(skillsDir);
  } catch {
    return [];
  }
  const findings = [];
  for (const name of entries) {
    const metadataPath = path.join(skillsDir, name, INSTALLED_SKILL_META_FILE);
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata?.managedBy !== 'aios') continue;
      findings.push({ name, client: String(metadata.client || '') });
    } catch {
      // 无 metadata 或不可读：用户自有 skill，不参与清理提示。
    }
  }
  return findings;
}

// 与 collectLegacySharedRootInstalls 配对的清理：只删除带 AIOS 托管
// metadata（managedBy=aios）的条目；用户自有 skill（无 metadata）永远不动。
// dryRun 只预览。返回 { removed, kept, missing } 三个名字数组。
export function removeLegacySharedRootInstalls(agentsHome, { dryRun = false, io = null } = {}) {
  const targets = collectLegacySharedRootInstalls(agentsHome).map((item) => item.name);
  const removed = [];
  const missing = [];
  for (const name of targets) {
    const targetPath = path.join(String(agentsHome || ''), 'skills', name);
    if (dryRun) {
      io?.log?.(`[plan] would remove legacy shared-root skill: ${name}`);
      removed.push(name);
      continue;
    }
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      removed.push(name);
    } catch (error) {
      io?.log?.(`[warn] cannot remove legacy shared-root skill ${name}: ${error.message}`);
      missing.push(name);
    }
  }
  return { removed, kept: [], missing };
}

// 纯函数：旧版布局曾把 Pi 的项目级 skill 投影到 .pi/skills。Pi 会同时扫描共享根
// 与 .pi/skills，两处同名时报告“已加载”并跳过共享路径副本。现行布局只写共享根
// （.agents/skills），凡带 AIOS 托管 metadata（install 或 sync 任一标记）的
// .pi/skills 目录视为升级残留；无 metadata 的视为用户自有。
function isAiosManagedSkillDir(skillsDir, name) {
  for (const marker of [INSTALLED_SKILL_META_FILE, GENERATED_SKILL_META_FILE]) {
    try {
      const metadata = JSON.parse(fs.readFileSync(path.join(skillsDir, name, marker), 'utf8'));
      if (metadata?.managedBy === 'aios') return true;
    } catch {
      // 缺文件或不可读：尝试下一个标记。
    }
  }
  return false;
}

export function collectLegacyPiSkillRootInstalls(projectRoot) {
  const skillsDir = path.join(String(projectRoot || ''), '.pi', 'skills');
  let entries = [];
  try {
    entries = fs.readdirSync(skillsDir);
  } catch {
    return [];
  }
  const findings = [];
  for (const name of entries) {
    if (isAiosManagedSkillDir(skillsDir, name)) {
      findings.push({ name });
    }
  }
  return findings;
}

// 与 collectLegacyPiSkillRootInstalls 配对的清理：只删 AIOS 托管目录，
// 用户自有 skill 永远不动；dryRun 只预览。返回 { removed, missing }。
export function removeLegacyPiSkillRootInstalls(projectRoot, { dryRun = false, io = null } = {}) {
  const targets = collectLegacyPiSkillRootInstalls(projectRoot).map((item) => item.name);
  const removed = [];
  const missing = [];
  for (const name of targets) {
    const targetPath = path.join(String(projectRoot || ''), '.pi', 'skills', name);
    if (dryRun) {
      io?.log?.(`[plan] would remove legacy .pi/skills skill: ${name}`);
      removed.push(name);
      continue;
    }
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      removed.push(name);
    } catch (error) {
      io?.log?.(`[warn] cannot remove legacy .pi/skills skill ${name}: ${error.message}`);
      missing.push(name);
    }
  }
  return { removed, missing };
}

export function collectOverrideWarnings({ rootDir, projectRoot, catalog, clientName, selectedSkills, homes, io, manifest }) {
  if (isSourceRepoProjectRoot(rootDir, projectRoot)) {
    return 0;
  }

  const globalRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: 'global', homes });
  const projectScopeRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: 'project', homes });
  const analysis = analyzeCatalogEntries({
    rootDir,
    catalog,
    clientName,
    scope: 'global',
    selectedSkills,
    manifest,
  });
  const conflictingNames = new Set(analysis.conflicts.map((conflict) => conflict.name));
  const entries = analysis.entries
    .filter((entry) => entry.scopes.includes('project'))
    .filter((entry) => !conflictingNames.has(entry.name));

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
  agentsHome = getAgentsHome(),
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
  let errors = 0;

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

  const legacySharedInstalls = collectLegacySharedRootInstalls(agentsHome);
  if (legacySharedInstalls.length > 0) {
    io.log(`[warn] agents home: ${legacySharedInstalls.length} legacy shared-root skill install(s) under ${formatDisplayPath(path.join(String(agentsHome || ''), 'skills'))}`);
    for (const item of legacySharedInstalls) {
      io.log(`       ${item.name} (client=${item.client || 'unknown'}); current layout installs per-client homes — remove this copy and re-run skills install`);
    }
    warnings += 1;
  }

  const legacyPiSkillInstalls = collectLegacyPiSkillRootInstalls(projectRoot || rootDir);
  if (legacyPiSkillInstalls.length > 0) {
    io.log(`[warn] project: ${legacyPiSkillInstalls.length} legacy .pi/skills skill install(s) under ${formatDisplayPath(path.join(String(projectRoot || rootDir), '.pi', 'skills'))}`);
    for (const item of legacyPiSkillInstalls) {
      io.log(`       ${item.name}; Pi loads project skills from the shared .agents/skills root — a .pi/skills copy is reported as already loaded and makes Pi skip the shared one; remove it and re-run skills sync`);
    }
    warnings += 1;
  }

  for (const clientName of resolveClientSelection(client)) {
    const targetRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: normalizedScope, homes });
    io.log(`${clientName} target root: ${formatDisplayPath(targetRoot)}`);
    const analysis = analyzeCatalogEntries({ rootDir, catalog, clientName, scope: normalizedScope, selectedSkills, manifest });
    if (analysis.conflicts.length > 0) {
      for (const conflict of analysis.conflicts) {
        const sources = conflict.sources.map(formatDisplayPath).join(', ');
        io.log(`[error] ${clientName}: ambiguous skill ${conflict.name} scope=${normalizedScope}; canonical sources: ${sources}; remove or rename one source`);
        errors += 1;
      }
      continue;
    }
    const entries = analysis.entries;
    if (entries.length === 0) {
      io.log(`[warn] ${clientName} no catalog skills matched scope=${normalizedScope}.`);
      warnings += 1;
      continue;
    }

    let okCount = 0;
    let warnCount = 0;
    for (const entry of entries) {
      const targetPath = path.join(targetRoot, entry.name);
      // broken symlink / empty skill tree (stale install)
      try {
        const lst = fs.lstatSync(targetPath);
        if (lst.isSymbolicLink()) {
          let resolvedOk = false;
          try {
            resolvedOk = fs.existsSync(fs.realpathSync(targetPath));
          } catch {
            resolvedOk = false;
          }
          if (!resolvedOk) {
            io.log(`[warn] ${clientName}: ${entry.name} broken symlink (stale); run update --force`);
            warnCount += 1;
            warnings += 1;
            continue;
          }
          const skillMd = path.join(targetPath, 'SKILL.md');
          if (!fs.existsSync(skillMd)) {
            io.log(`[warn] ${clientName}: ${entry.name} link target missing SKILL.md`);
            warnCount += 1;
            warnings += 1;
            continue;
          }
        }
      } catch {
        // path missing — handled below
      }
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

  return { warnings, effectiveWarnings: warnings + errors, errors };
}
