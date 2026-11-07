// scripts/lib/tooling/components/skills/external/external-source.mjs — 外部技能来源解析
// 职责：把 `aios skill add <source>` 的 source（本地目录 / git URL）解析成待安装技能清单。
// 判定规则：目录根有 SKILL.md → 单技能；子目录各带 SKILL.md → 多技能；都没有 → 报错。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { readSkillFrontmatter } from '../../../../tooling/skills/frontmatter.mjs';

const SKILL_ENTRY_FILE = 'SKILL.md';
// 技能名约束：目录名安全的单段名字，拒绝路径分隔符与遍历片段。
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

// 预检/用法错误是用户可操作的结论，不是崩溃：refusal=true 让入口层不刷堆栈。
export function createRefusalError(message) {
  const error = new Error(message);
  error.refusal = true;
  return error;
}

// 纯函数：判定 source 是否需要 git clone（http(s) URL、.git 结尾、owner/repo 简写）。
export function isGitSource(source) {
  const value = String(source || '').trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.endsWith('.git')) return true;
  return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isDirectoryWithSkill(dirPath) {
  return fs.existsSync(dirPath)
    && fs.statSync(dirPath).isDirectory()
    && fs.existsSync(path.join(dirPath, SKILL_ENTRY_FILE));
}

// 纯函数：从 SKILL.md frontmatter 或目录名解析安全技能名；非法名直接报错而不是截断。
export function resolveSkillName(skillDir) {
  const frontmatter = readSkillFrontmatter(path.join(skillDir, SKILL_ENTRY_FILE)) || {};
  const candidate = String(frontmatter.name || '').trim() || path.basename(skillDir);
  const normalized = candidate.replaceAll(' ', '-');
  if (!SKILL_NAME_PATTERN.test(normalized) || normalized === '.' || normalized === '..') {
    throw createRefusalError(`[err] external skill has an unsafe name "${candidate}" (from ${skillDir})`);
  }
  return normalized;
}

// 纯函数：把来源目录分类为单技能 / 多技能 / 无技能；多技能时按名字稳定排序。
export function classifyExternalSource(resolvedDir) {
  if (isDirectoryWithSkill(resolvedDir)) {
    return { kind: 'single', skills: [{ dir: resolvedDir, name: resolveSkillName(resolvedDir) }] };
  }

  const skills = fs.existsSync(resolvedDir) && fs.statSync(resolvedDir).isDirectory()
    ? fs.readdirSync(resolvedDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isDirectoryWithSkill(path.join(resolvedDir, entry.name)))
      .map((entry) => ({ dir: path.join(resolvedDir, entry.name), name: resolveSkillName(path.join(resolvedDir, entry.name)) }))
      .sort((left, right) => (left.name < right.name ? -1 : 1))
    : [];

  if (skills.length === 0) {
    return { kind: 'none', skills: [] };
  }
  return { kind: 'multi', skills };
}

// 把 git 来源浅克隆到一次性临时目录；调用方负责在安装结束后 cleanup。
function cloneGitSource(source, { env }) {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-skill-add-'));
  const url = /^https?:\/\//i.test(source) || source.endsWith('.git')
    ? source
    : `https://github.com/${source}.git`;
  execFileSync('git', ['clone', '--depth', '1', url, targetDir], {
    windowsHide: true,
    stdio: 'pipe',
    env: { ...env, GIT_TERMINAL_PROMPT: '0' },
  });
  return targetDir;
}

// 入口：解析 source 为绝对目录 + 技能清单；git 来源返回 cleanup 供调用方回收临时目录。
export function resolveExternalSkillSource(source, { env = process.env, homeDir = os.homedir() } = {}) {
  const value = String(source || '').trim();
  if (!value) {
    throw new Error('[err] skill add requires a source path or git URL');
  }

  const expanded = value === '~' || value.startsWith('~/')
    ? path.join(homeDir, value.slice(2))
    : value;

  if (fs.existsSync(expanded)) {
    const resolvedDir = fs.realpathSync(path.resolve(expanded));
    const classified = classifyExternalSource(resolvedDir);
    if (classified.kind === 'none') {
      throw createRefusalError(
        `[err] ${resolvedDir} contains no SKILL.md (looked at the root and immediate subdirectories)`,
      );
    }
    return { ...classified, originalSource: value, cleanupPath: '' };
  }

  if (isGitSource(value)) {
    const clonedDir = cloneGitSource(value, { env });
    const classified = classifyExternalSource(clonedDir);
    if (classified.kind === 'none') {
      fs.rmSync(clonedDir, { recursive: true, force: true });
      throw createRefusalError(`[err] cloned ${value} but found no SKILL.md at the root or in immediate subdirectories`);
    }
    return { ...classified, originalSource: value, cleanupPath: clonedDir };
  }

  throw createRefusalError(`[err] source not found and not a git URL: ${value}`);
}
