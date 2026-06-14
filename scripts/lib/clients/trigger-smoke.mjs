import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CLIENT_DEFINITIONS, isKnownClient } from './registry.mjs';

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return { __invalid: error.message };
  }
}

function check(ok, detail = '') {
  return { ok: Boolean(ok), detail };
}

async function inspectOpenCodeConfig(rootDir) {
  const configPath = path.join(rootDir, 'opencode.json');
  const parsed = await readJsonIfExists(configPath);
  if (!parsed) return check(false, 'missing opencode.json');
  if (parsed.__invalid) return check(false, `invalid opencode.json: ${parsed.__invalid}`);
  const instructions = Array.isArray(parsed.instructions) ? parsed.instructions : [];
  const skillPaths = Array.isArray(parsed.skills?.paths) ? parsed.skills.paths : [];
  const ok = parsed.default_agent === 'aios-build'
    && instructions.includes('AGENTS.md')
    && instructions.includes('.opencode/agent/aios-build.md')
    && skillPaths.includes('.opencode/skills')
    && parsed.command?.verify?.agent === 'aios-build'
    && parsed.command?.['skill-comply']?.agent === 'aios-build'
    && parsed.command?.['skill-health']?.agent === 'aios-build';
  return check(ok, ok ? 'opencode.json links AIOS instructions, primary agent, skills, and commands' : 'opencode.json missing one or more AIOS trigger surfaces');
}

export async function runClientTriggerSmoke(clientId, { rootDir = process.cwd() } = {}) {
  if (!isKnownClient(clientId)) {
    return {
      clientId,
      status: 'fail',
      checks: {
        knownClient: check(false, 'unknown client'),
      },
    };
  }
  const definition = CLIENT_DEFINITIONS[clientId];
  const instructionPath = path.join(rootDir, definition.instructionFileName);
  const skillRoot = path.join(rootDir, definition.projectSkillRoot);
  const checks = {
    instructionFile: check(await fileExists(instructionPath), definition.instructionFileName),
    skillRoot: check(await dirExists(skillRoot), definition.projectSkillRoot),
  };
  if (clientId === 'opencode') {
    checks.primaryAgent = check(await fileExists(path.join(rootDir, '.opencode', 'agent', 'aios-build.md')), '.opencode/agent/aios-build.md');
    checks.opencodeConfig = await inspectOpenCodeConfig(rootDir);
  }
  const status = Object.values(checks).every((item) => item.ok) ? 'pass' : 'fail';
  return {
    schemaVersion: 1,
    kind: 'client.trigger-smoke',
    clientId,
    status,
    checks,
  };
}
