import fs from 'node:fs';
import path from 'node:path';

function normalizeForCompare(inputPath) {
  let output = path.resolve(inputPath);
  try {
    output = fs.realpathSync(output);
  } catch {
    // keep resolved absolute path
  }

  return process.platform === 'win32' ? output.toLowerCase() : output;
}

export function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function ensureFile(filePath) {
  ensureParentDir(filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf8');
  }
}

export function copyDirRecursive(sourcePath, targetPath, { excludeNames = [] } = {}) {
  const ignored = new Set(Array.isArray(excludeNames) ? excludeNames : []);
  fs.rmSync(targetPath, { recursive: true, force: true });
  ensureParentDir(targetPath);
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    filter: (currentSource) => {
      const relPath = path.relative(sourcePath, currentSource);
      if (!relPath) {
        return true;
      }
      const segments = relPath.split(path.sep);
      return segments.every((segment) => !ignored.has(segment));
    },
  });
}

export function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

export function writeText(filePath, content) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

export function stripManagedBlock(content, beginMark, endMark) {
  const lines = content.split(/\r?\n/);
  const output = [];
  let skip = false;

  const normalizeMarkerLine = (line) => line.replace(/^\uFEFF/u, '').trim();

  for (const line of lines) {
    const normalizedLine = normalizeMarkerLine(line);
    if (normalizedLine === beginMark) {
      skip = true;
      continue;
    }
    if (normalizedLine === endMark) {
      skip = false;
      continue;
    }
    if (!skip) {
      output.push(line);
    }
  }

  return output.join('\n').replace(/\n+$/g, '\n');
}

export function stripMatchingLines(content, patterns) {
  return content
    .split(/\r?\n/)
    .filter((line) => patterns.every((pattern) => !pattern.test(line)))
    .join('\n')
    .replace(/\n+$/g, '\n');
}

export function isManagedLink(targetPath, sourcePath) {
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    const targetReal = normalizeForCompare(fs.realpathSync(targetPath));
    const sourceReal = normalizeForCompare(fs.realpathSync(sourcePath));
    return targetReal === sourceReal;
  } catch {
    return false;
  }
}

export function ensureManagedLink(targetPath, sourcePath, { force = false } = {}) {
  if (fs.existsSync(targetPath)) {
    if (isManagedLink(targetPath, sourcePath)) {
      return 'reused';
    }

    if (!force) {
      return 'skipped';
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
    ensureParentDir(targetPath);
    fs.symlinkSync(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
    return 'replaced';
  }

  ensureParentDir(targetPath);
  fs.symlinkSync(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
  return 'installed';
}

export function removeManagedLink(targetPath, sourcePath) {
  if (!isManagedLink(targetPath, sourcePath)) {
    return false;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

export function removeManagedDirectory(targetPath, predicate = null) {
  if (!fs.existsSync(targetPath)) {
    return false;
  }
  if (typeof predicate === 'function' && !predicate(targetPath)) {
    return false;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

export function isLegacyManagedSkillLink(targetPath, { sourcePath = '' } = {}) {
  if (!sourcePath) {
    return false;
  }
  return isManagedLink(targetPath, sourcePath);
}

export function collectSkillEntries(sourceRoots) {
  const entries = [];
  const seen = new Set();

  for (const root of sourceRoots) {
    if (!root || !fs.existsSync(root)) {
      continue;
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const skillDir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue;
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      entries.push({
        name: entry.name,
        sourcePath: fs.realpathSync(skillDir),
      });
    }
  }

  return entries;
}


const REPO_DISCOVERABLE_SKILL_ROOTS = new Set([
  '.codex/skills',
  '.claude/skills',
  '.agents/skills',
  '.gemini/skills',
  '.opencode/skills',
]);

const REPO_CANONICAL_SKILL_SOURCE_ROOTS = new Set([
  'skill-sources',
]);

const SKILL_SCAN_EXCLUDED_TOP_LEVEL = new Set([
  '.git',
  '.worktrees',
  'node_modules',
  'dist',
  'site',
  'docs-site',
  'temp',
]);

function collectSkillMarkdownFiles(baseDir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(baseDir)) {
    return [];
  }

  const output = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const entryPath = path.join(baseDir, entry.name);
    if (entry.isFile() && entry.name === 'SKILL.md') {
      output.push(entryPath);
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    output.push(...collectSkillMarkdownFiles(entryPath, maxDepth, currentDepth + 1));
  }
  return output;
}

export function collectUnexpectedSkillRootFindings(rootDir) {
  const findings = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKILL_SCAN_EXCLUDED_TOP_LEVEL.has(entry.name)) continue;

    const relName = entry.name;
    const normalizedAllowed = [
      ...Array.from(REPO_DISCOVERABLE_SKILL_ROOTS),
      ...Array.from(REPO_CANONICAL_SKILL_SOURCE_ROOTS),
    ];
    if (normalizedAllowed.includes(relName) || normalizedAllowed.some((allowed) => allowed.startsWith(`${relName}/`))) {
      continue;
    }

    const looksSkillLike = /skill/i.test(relName) || relName === '.baoyu-skills';
    if (!looksSkillLike) continue;

    const skillFiles = collectSkillMarkdownFiles(path.join(rootDir, relName));
    if (skillFiles.length === 0) continue;

    findings.push({
      root: relName.replace(/\\/g, '/'),
      files: skillFiles.map((filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/')),
    });
  }
  return findings;
}
