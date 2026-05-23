import os from 'node:os';
import path from 'node:path';

import { getClientHomes } from '../../platform/paths.mjs';

import { EXTRA_CLAUDE_REQUIRED_SKILLS } from './constants.mjs';
import { listSkillNames, skillNameToPermission, sortUniqueStrings } from './skills.mjs';

export function buildRequiredClaudeSkillPermissions({ fs, skillsSource, extraSkills = [] } = {}) {
  const discoveredSkills = listSkillNames(fs, skillsSource);
  const allSkills = sortUniqueStrings([...discoveredSkills, ...extraSkills]);
  return sortUniqueStrings(allSkills.map((skillName) => skillNameToPermission(skillName)));
}

// 纯函数：按全局/项目开关生成 Claude settings 文件列表。
export function resolveClaudeSettingsPaths({
  claudeHome,
  rootDir = '',
  includeGlobal = true,
  includeProject = true,
} = {}) {
  const output = [];
  if (includeGlobal) {
    output.push(path.resolve(path.join(claudeHome, 'settings.local.json')));
  }
  if (includeProject && rootDir) {
    output.push(path.resolve(path.join(rootDir, '.claude', 'settings.local.json')));
  }
  return [...new Set(output)];
}

export function readJsonObject(fs, filePath) {
  if (!fs.existsSync(filePath)) {
    return { payload: {}, exists: false };
  }

  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) {
    return { payload: {}, exists: true };
  }

  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected top-level JSON object');
  }

  return { payload: parsed, exists: true };
}

export function syncClaudeSkillPermissionsInFile({
  fs,
  settingsPath,
  requiredPermissions,
}) {
  const { payload, exists } = readJsonObject(fs, settingsPath);
  const nextPayload = { ...payload };
  const nextPermissions = (
    payload.permissions
    && typeof payload.permissions === 'object'
    && !Array.isArray(payload.permissions)
  ) ? { ...payload.permissions } : {};

  const allowRaw = Array.isArray(nextPermissions.allow) ? nextPermissions.allow : [];
  const existingAllow = sortUniqueStrings(allowRaw);
  const existingSet = new Set(existingAllow);
  const missing = requiredPermissions.filter((permission) => !existingSet.has(permission));

  if (missing.length === 0 && Array.isArray(nextPermissions.allow) && sortUniqueStrings(nextPermissions.allow).length === nextPermissions.allow.length) {
    return {
      status: 'reused',
      added: 0,
      total: existingAllow.length,
      path: settingsPath,
    };
  }

  nextPermissions.allow = [...existingAllow, ...missing];
  nextPayload.permissions = nextPermissions;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');

  return {
    status: exists ? 'updated' : 'installed',
    added: missing.length,
    total: nextPermissions.allow.length,
    path: settingsPath,
  };
}

export async function syncClaudeSkillPermissions({
  rootDir = '',
  env = process.env,
  io = console,
  includeGlobal = true,
  includeProject = true,
  extraSkills = EXTRA_CLAUDE_REQUIRED_SKILLS,
} = {}) {
  const homeDir = os.homedir();
  const homes = getClientHomes(env, homeDir);
  const codexHome = homes.codex;
  const claudeHome = homes.claude;
  const skillsSource = path.join(codexHome, 'superpowers', 'skills');
  const fs = (await import('node:fs')).default;

  if (!fs.existsSync(skillsSource)) {
    io.log(`[warn] superpowers skills source not found for permission sync: ${skillsSource}`);
    return {
      installed: 0,
      updated: 0,
      reused: 0,
      skipped: 0,
      errors: 1,
      paths: [],
      requiredPermissions: [],
    };
  }

  const requiredPermissions = buildRequiredClaudeSkillPermissions({
    fs,
    skillsSource,
    extraSkills,
  });
  const settingsPaths = resolveClaudeSettingsPaths({
    claudeHome,
    rootDir,
    includeGlobal,
    includeProject,
  });

  let installed = 0;
  let updated = 0;
  let reused = 0;
  let skipped = 0;
  let errors = 0;

  for (const settingsPath of settingsPaths) {
    try {
      const result = syncClaudeSkillPermissionsInFile({
        fs,
        settingsPath,
        requiredPermissions,
      });
      if (result.status === 'installed') installed += 1;
      else if (result.status === 'updated') updated += 1;
      else reused += 1;
      io.log(`[ok] Claude skill permissions synced: ${settingsPath} (+${result.added}, total=${result.total})`);
    } catch (error) {
      errors += 1;
      io.log(`[warn] Claude skill permissions sync failed: ${settingsPath}`);
      io.log(`       ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (settingsPaths.length === 0) {
    skipped = 1;
    io.log('[info] Claude skill permissions sync skipped (no target settings paths resolved).');
  }

  io.log(`[done] Claude skill permissions sync: installed=${installed} updated=${updated} reused=${reused} skipped=${skipped} errors=${errors}`);
  return {
    installed,
    updated,
    reused,
    skipped,
    errors,
    paths: settingsPaths,
    requiredPermissions,
  };
}
