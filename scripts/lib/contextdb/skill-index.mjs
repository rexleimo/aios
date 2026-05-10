import { promises as fs } from 'node:fs';
import path from 'node:path';
import { workspaceDir } from './workspace.mjs';

export async function buildSkillIndex(workspaceRoot) {
  const skillsDir = path.join(path.resolve(workspaceRoot || process.cwd()), 'memory', 'skills');
  const skills = [];

  try {
    const files = await fs.readdir(skillsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(skillsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);

        const skill = {
          name: data.name || data.skill_name || file.replace('.json', ''),
          file: file,
          keywords: data.trigger_keywords || [],
          taskTypes: extractTaskTypes(data),
          version: data.version || '1.0.0',
          lastUsed: null
        };

        skills.push(skill);
      } catch (err) {
        // Skip malformed files
        continue;
      }
    }
  } catch (err) {
    // Skills directory doesn't exist yet
  }

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
