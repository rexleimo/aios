// scripts/lib/tooling/components/skills/external/install.mjs — 外部技能安装编排
// 职责：`aios skill add <source>` 的执行层。来源（本地目录 / git URL）→ canonical 注册处
// （~/.aios/skills/external/）→ 各客户端用户级技能根（homes[client]/skills，同 catalog 全局 scope）。
// 幂等：注册处与每个客户端副本都带 .aios-skill-install.json 归属元数据，重装即刷新，不产生重复副本。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { copyDirRecursive } from '../../../../foundation/platform/fs.mjs';
import {
  GENERATED_SKILL_META_FILE,
  INSTALLED_SKILL_META_FILE,
  buildInstalledSkillMetadata,
  isManagedInstalledSkill,
  writeInstalledSkillMetadata,
} from '../../../../tooling/skills/install/install-metadata.mjs';
import { snapshotDirectory, snapshotsEqual } from '../../../../tooling/skills/install/directory-snapshot.mjs';
import { resolveClientSelection } from '../../../../foundation/clients/registry.mjs';
import { normalizeSelectedSkills, resolveHomeMap } from '../normalizers.mjs';

import { createRefusalError, resolveExternalSkillSource } from './external-source.mjs';
import {
  buildRegistryInstallMetadata,
  isManagedRegistryInstall,
  resolveExternalSkillRegistry,
} from './external-registry.mjs';
import { promptSkillSelection } from './select.mjs';

// 目录快照时忽略的归属元数据文件：比较的是技能内容，不是我们的记账文件。
const META_IGNORE_NAMES = new Set([GENERATED_SKILL_META_FILE, INSTALLED_SKILL_META_FILE]);

function directoryDiffers(sourceDir, targetPath) {
  const targetSnapshot = snapshotDirectory(targetPath, targetPath, new Map(), META_IGNORE_NAMES);
  const sourceSnapshot = snapshotDirectory(sourceDir, sourceDir, new Map(), META_IGNORE_NAMES);
  return !snapshotsEqual(targetSnapshot, sourceSnapshot);
}

// 第一步：把来源技能暂存进 canonical 注册处；注册处是所有客户端副本的同一来源。
function stageIntoRegistry({ skill, registryRoot, originalSource, force, dryRun }) {
  const registryPath = path.join(registryRoot, skill.name);
  const managed = isManagedRegistryInstall(registryPath, skill.name);
  const exists = fs.existsSync(registryPath);

  if (exists && !managed && !force) {
    return { status: 'skipped', registryPath, reason: 'unmanaged' };
  }

  if (managed && exists && !directoryDiffers(skill.dir, registryPath)) {
    return { status: 'reused', registryPath };
  }

  if (dryRun) return { status: exists && managed ? 'replaced' : 'installed', registryPath };
  copyDirRecursive(skill.dir, registryPath, { excludeNames: [GENERATED_SKILL_META_FILE, INSTALLED_SKILL_META_FILE] });
  writeInstalledSkillMetadata(registryPath, buildRegistryInstallMetadata({ skillName: skill.name, source: originalSource }));
  return { status: exists && managed ? 'replaced' : 'installed', registryPath };
}

// 第二步：从注册处分发到单个客户端的用户级技能根（homes[client]/skills）。
function distributeToClient({ skill, registryPath, clientName, clientRoot, force, dryRun }) {
  const targetPath = path.join(clientRoot, skill.name);
  // 防自毁：目标就是来源目录本身（首次收编时常见）时绝不 rm/cp；copyDirRecursive 会先删目标。
  if (path.resolve(targetPath) === path.resolve(skill.dir)) {
    return 'source';
  }
  const expectedMetadata = buildInstalledSkillMetadata({
    skillName: skill.name,
    relativeSkillPath: skill.name,
    client: clientName,
    scope: 'global',
    installMode: 'copy',
    catalogSource: registryPath,
  });
  const managed = isManagedInstalledSkill(targetPath, { skillName: skill.name, client: clientName, scope: 'global' });
  const exists = fs.existsSync(targetPath);

  if (exists && !managed && !force) {
    return 'skipped';
  }
  if (managed && exists && !directoryDiffers(registryPath, targetPath)) {
    return 'reused';
  }

  if (dryRun) return exists ? 'replaced' : 'installed';
  copyDirRecursive(registryPath, targetPath, { excludeNames: [GENERATED_SKILL_META_FILE, INSTALLED_SKILL_META_FILE] });
  writeInstalledSkillMetadata(targetPath, expectedMetadata);
  // 目录已存在（无论是被接管的 unmanaged 还是内容过期的 managed）都算 replaced。
  return exists ? 'replaced' : 'installed';
}

function formatSummary({ clientName, counts }) {
  return `[done] ${clientName} external skills -> installed=${counts.installed} reused=${counts.reused} replaced=${counts.replaced} skipped=${counts.skipped}`;
}

// 入口：解析来源 → 选择技能 → 注册处暂存 → 全客户端分发。
export async function installExternalSkills({
  source,
  client = 'all',
  selectedSkills = [],
  force = false,
  yes = false,
  dryRun = false,
  json = false,
  homeMap = {},
  env = process.env,
  homeDir = os.homedir(),
  io = console,
  stdout,
} = {}) {
  const write = (line) => { if (stdout) stdout.write(String(line)); else io.log(String(line)); };
  const log = (line) => {
    // --json 模式下 stdout 只输出 JSON，人类可读日志进缓冲不外发，避免消费方 JSON.parse 失败。
    if (json) { jsonLogBuffer.push(String(line)); return; }
    write(`${String(line)}\n`);
  };
  const jsonLogBuffer = [];

  if (!source || !String(source).trim()) {
    throw createRefusalError('[err] skill add requires a source path or git URL');
  }

  const resolved = resolveExternalSkillSource(source, { env, homeDir });
  try {
    let picked = normalizeSelectedSkills(selectedSkills);
    if (resolved.kind === 'multi' && picked.length === 0 && yes) {
      // --yes 非交互全选：不问、不猜，直接装来源里发现的全部技能。
      picked = resolved.skills.map((skill) => skill.name);
    }
    if (resolved.kind === 'multi' && picked.length === 0 && !yes) {
      if (process.stdin.isTTY) {
        picked = await promptSkillSelection(resolved.skills, { log });
      } else {
        throw createRefusalError(
          `[err] source contains ${resolved.skills.length} skills (${resolved.skills.map((s) => s.name).join(', ')}); `
          + 'pass --skill <names> to pick some, or --yes to install all',
        );
      }
    }
    if (resolved.kind === 'single') {
      picked = [resolved.skills[0].name];
    }

    const byName = new Map(resolved.skills.map((skill) => [skill.name, skill]));
    const selected = picked
      .filter((name) => {
        if (byName.has(name)) return true;
        log(`[warn] selected skill not found in source: ${name}`);
        return false;
      })
      .map((name) => byName.get(name));

    if (selected.length === 0) {
      log('[skip] no external skills selected; nothing to install');
      return { exitCode: 0, installed: 0, reused: 0, replaced: 0, skipped: 0, skills: [] };
    }

    const homes = resolveHomeMap(homeMap, env);
    const registryRoot = resolveExternalSkillRegistry({ env, homeDir });
    // --client 接受逗号列表（integration add 的 UX 约定）；逐个校验并按声明顺序去重。
    const clients = [...new Set(String(client || 'all')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .flatMap((name) => resolveClientSelection(name)))];

    const totals = { installed: 0, reused: 0, replaced: 0, skipped: 0 };
    const results = [];

    for (const skill of selected) {
      const stage = stageIntoRegistry({ skill, registryRoot, originalSource: resolved.originalSource, force, dryRun });
      if (stage.status === 'skipped') {
        log(`[skip] registry entry exists but is unmanaged: ${skill.name} (${stage.registryPath}); pass --force to replace`);
        totals.skipped += 1;
        results.push({ name: skill.name, registryPath: stage.registryPath, stage: stage.status, clients: {} });
        continue;
      }
      log(`[${stage.status === 'reused' ? 'ok' : 'copy'}] registry skill ${stage.status}: ${skill.name}`);
      totals[stage.status === 'reused' ? 'reused' : stage.status === 'replaced' ? 'replaced' : 'installed'] += 1;

      const perClient = {};
      for (const clientName of clients) {
        const clientRoot = path.join(homes[clientName], 'skills');
        const status = distributeToClient({ skill, registryPath: dryRun ? skill.dir : stage.registryPath, clientName, clientRoot, force, dryRun });
        if (status === 'source') {
          perClient[clientName] = status;
          log(`[skip] ${clientName} target is the source directory itself; keeping the original untouched: ${skill.name}`);
          continue;
        }
        perClient[clientName] = status;
        totals[status] += 1;
        if (status !== 'reused') {
          log(`[copy] ${clientName} skill ${status} (global): ${skill.name}`);
        } else {
          log(`[ok] ${clientName} skill already installed (global): ${skill.name}`);
        }
      }
      results.push({ name: skill.name, registryPath: stage.registryPath, stage: stage.status, clients: perClient });
    }

    log(formatSummary({ clientName: clients.join(','), counts: totals }));
    if (json) {
      write(`${JSON.stringify({ ok: true, dryRun, registryRoot, ...totals, skills: results, log: jsonLogBuffer }, null, 2)}\n`);
    }
    return { exitCode: 0, registryRoot, ...totals, skills: results };
  } finally {
    if (resolved.cleanupPath) {
      fs.rmSync(resolved.cleanupPath, { recursive: true, force: true });
    }
  }
}
