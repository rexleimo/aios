/**
 * B3 — repair stale/broken planning skill links, then re-project.
 */

import fs from 'node:fs';
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../clients/core/definitions.mjs';
import { resolveClientCapabilitySelection } from '../clients/registry.mjs';
import { getClientHomes } from '../platform/paths.mjs';

import { PLANNING_CORE_SKILLS } from './contract.mjs';
import { projectPlanningSkills } from './project-skills.mjs';

function isBrokenSymlink(targetPath) {
  try {
    const st = fs.lstatSync(targetPath);
    if (!st.isSymbolicLink()) return false;
    try {
      return !fs.existsSync(fs.realpathSync(targetPath));
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Remove broken planning skill symlinks under project + home roots, then re-project.
 */
export function repairStalePlanningSkills({
  rootDir = process.cwd(),
  client = 'all',
  env = process.env,
  force = true,
  io = console,
} = {}) {
  const selection = resolveClientCapabilitySelection('superpowers', client);
  const homes = getClientHomes(env);
  const removed = [];

  for (const clientId of selection.supported) {
    const def = CLIENT_DEFINITIONS[clientId];
    if (!def) continue;
    const roots = [
      rootDir ? path.join(rootDir, def.projectSkillRoot) : null,
      path.join(homes[clientId] || '', 'skills'),
    ].filter(Boolean);

    for (const skillRoot of roots) {
      for (const name of PLANNING_CORE_SKILLS) {
        const target = path.join(skillRoot, name);
        if (!isBrokenSymlink(target)) continue;
        try {
          fs.rmSync(target, { recursive: true, force: true });
          removed.push(target);
          io.log?.(`[repair] removed broken skill link: ${target}`);
        } catch (error) {
          io.log?.(`[warn] failed to remove ${target}: ${error.message}`);
        }
      }
    }
  }

  const projection = projectPlanningSkills({
    rootDir,
    client,
    force,
    env,
    io,
  });

  return {
    ok: Boolean(projection.ok),
    removed,
    projection,
  };
}
