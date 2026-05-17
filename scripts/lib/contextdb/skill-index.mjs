import { promises as fs } from 'node:fs';
import path from 'node:path';
import { workspaceDir } from './workspace.mjs';

const DISCOVERABLE_SKILL_ROOTS = [
  ['.codex', 'skills'],
  ['.claude', 'skills'],
  ['.agents', 'skills'],
];

const LEGACY_SKILL_ROOT_SEGMENTS = ['memory', 'skills'];

function toPosixRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function parseFrontmatter(content) {
  const match = String(content || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1];
    const raw = pair[2].trim();
    data[key] = raw.replace(/^['"]|['"]$/g, '');
  }
  return data;
}

function extractTriggerKeywords(description = '') {
  const match = String(description || '').match(/\bTRIGGER:\s*(.+)$/i);
  if (!match) return [];
  return match[1]
    .split(/[,，、]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readMarkdownSkill(root, skillDir, sourceRank) {
  const skillPath = path.join(skillDir, 'SKILL.md');
  const content = await fs.readFile(skillPath, 'utf8');
  const frontmatter = parseFrontmatter(content);
  const id = path.basename(skillDir);
  const name = frontmatter.name || id;
  const description = frontmatter.description || '';
  return {
    id: String(name),
    skill: {
      name: String(name),
      file: toPosixRelative(root, skillPath),
      keywords: extractTriggerKeywords(description),
      taskTypes: [],
      version: frontmatter.version || '1.0.0',
      lastUsed: null,
      source: 'skill',
      description,
    },
    sourceRank,
  };
}

async function discoverMarkdownSkills(root) {
  const discovered = [];
  for (let sourceRank = 0; sourceRank < DISCOVERABLE_SKILL_ROOTS.length; sourceRank += 1) {
    const skillsDir = path.join(root, ...DISCOVERABLE_SKILL_ROOTS[sourceRank]);
    let entries = [];
    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(skillsDir, entry.name);
      try {
        discovered.push(await readMarkdownSkill(root, skillDir, sourceRank));
      } catch {
        // Skip incomplete or unreadable skill directories.
      }
    }
  }
  return discovered;
}

async function discoverLegacyJsonSkills(root) {
  const skillsDir = path.join(root, ...LEGACY_SKILL_ROOT_SEGMENTS);
  const skills = [];

  try {
    const files = await fs.readdir(skillsDir);

    for (const file of files.sort((a, b) => a.localeCompare(b))) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(skillsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);

        const skill = {
          name: data.name || data.skill_name || file.replace('.json', ''),
          file: toPosixRelative(root, filePath),
          keywords: data.trigger_keywords || [],
          taskTypes: extractTaskTypes(data),
          version: data.version || '1.0.0',
          lastUsed: null,
          source: 'legacy-json',
        };

        skills.push({ id: String(skill.name), skill, sourceRank: DISCOVERABLE_SKILL_ROOTS.length });
      } catch (err) {
        // Skip malformed files.
      }
    }
  } catch (err) {
    // Legacy skills directory does not exist.
  }

  return skills;
}

export async function buildSkillIndex(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const discovered = [
    ...await discoverMarkdownSkills(root),
    ...await discoverLegacyJsonSkills(root),
  ];

  const byName = new Map();
  for (const item of discovered) {
    const key = item.id.toLowerCase();
    const existing = byName.get(key);
    if (!existing || item.sourceRank < existing.sourceRank) {
      byName.set(key, item);
    }
  }

  const skills = Array.from(byName.values())
    .sort((a, b) => a.skill.name.localeCompare(b.skill.name))
    .map((item) => item.skill);

  return { skills };
}

function extractTaskTypes(skillData) {
  if (skillData.taskTypes && Array.isArray(skillData.taskTypes)) {
    return skillData.taskTypes;
  }

  const types = new Set();

  if (skillData.platforms && typeof skillData.platforms === 'object') {
    Object.keys(skillData.platforms).forEach(key => types.add(key));
  }

  if (skillData.mcp_servers && Array.isArray(skillData.mcp_servers)) {
    skillData.mcp_servers.forEach(server => {
      if (server.id) types.add(server.id);
    });
  }

  return Array.from(types);
}

export async function writeSkillIndex(workspaceRoot, index) {
  const dir = workspaceDir(workspaceRoot);
  const filePath = path.join(dir, 'active-skills.json');

  await fs.mkdir(dir, { recursive: true });

  const tmpPath = path.join(
    dir,
    `.active-skills.json.tmp.${process.pid}.${Math.random().toString(36).slice(2, 8)}`
  );

  const content = JSON.stringify(index, null, 2) + '\n';
  await fs.writeFile(tmpPath, content, 'utf8');

  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

export async function readSkillIndex(workspaceRoot) {
  const dir = workspaceDir(workspaceRoot);
  const filePath = path.join(dir, 'active-skills.json');

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return { skills: [] };
  }
}

export function findSkillsByKeywords(index, keywords) {
  if (!keywords || keywords.length === 0) return [];

  const searchTerms = keywords.map(k => k.toLowerCase());

  return index.skills.filter(skill => {
    const skillKeywords = (skill.keywords || []).map(k => k.toLowerCase());
    const skillName = (skill.name || '').toLowerCase();

    return searchTerms.some(term =>
      skillKeywords.some(kw => kw.includes(term) || term.includes(kw)) ||
      skillName.includes(term)
    );
  });
}

export function findSkillsByTaskType(index, taskType) {
  if (!taskType) return [];

  const searchType = taskType.toLowerCase();

  return index.skills.filter(skill =>
    (skill.taskTypes || []).some(t => t.toLowerCase() === searchType)
  );
}
