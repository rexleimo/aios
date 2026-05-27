import path from 'node:path';

import { ensureManagedLink } from '../../platform/fs.mjs';

// 纯函数：列出包含 SKILL.md 的技能目录名称。
export function listSkillNames(fs, skillsRoot) {
  if (!skillsRoot || !fs.existsSync(skillsRoot)) {
    return [];
  }
  return fs.readdirSync(skillsRoot).filter((entry) => {
    const skillPath = path.join(skillsRoot, entry);
    return fs.statSync(skillPath).isDirectory() && fs.existsSync(path.join(skillPath, 'SKILL.md'));
  }).sort((left, right) => left.localeCompare(right));
}

// 纯函数：把技能名转换为 Claude settings 的 Skill(...) 权限项。
export function skillNameToPermission(skillName) {
  return `Skill(${String(skillName || '').trim()})`;
}

// 纯函数：去空、去重并排序，保证权限写入稳定。
export function sortUniqueStrings(values = []) {
  const output = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
  output.sort((left, right) => left.localeCompare(right));
  return output;
}

export function linkClaudeSkills({
  fs,
  sourcePath,
  claudeSkillsRoot,
  allowedSkills = null,
  force = false,
  io = console,
} = {}) {
  const allSkillNames = listSkillNames(fs, sourcePath);
  const skillNames = allowedSkills
    ? allSkillNames.filter((name) => allowedSkills.has(name))
    : allSkillNames;
  const skippedByFilter = allowedSkills ? allSkillNames.length - skillNames.length : 0;
  let linked = 0;
  let reused = 0;
  let skipped = 0;

  for (const skillName of skillNames) {
    const skillSourcePath = path.join(sourcePath, skillName);
    const skillTargetPath = path.join(claudeSkillsRoot, skillName);
    const linkStatus = ensureManagedLink(skillTargetPath, skillSourcePath, { force });
    if (linkStatus === 'reused') {
      reused += 1;
      continue;
    }
    if (linkStatus === 'skipped') {
      skipped += 1;
      io.log(`[warn] Claude Code skill not linked (existing unmanaged path): ${skillTargetPath}`);
      continue;
    }
    linked += 1;
    io.log(`[link] Claude Code skill: ${skillName}`);
  }

  if (skippedByFilter > 0) {
    io.log(`[skip] ${skippedByFilter} skill(s) not in catalog for claude; filtered out`);
  }

  return {
    total: skillNames.length,
    linked,
    reused,
    skipped,
    filteredOut: skippedByFilter,
  };
}
