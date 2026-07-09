/**
 * Project AIOS planning core skills into each client skill root so hosts can discover them.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../clients/core/definitions.mjs';
import { resolveClientCapabilitySelection } from '../clients/registry.mjs';
import { ensureManagedLink } from '../platform/fs.mjs';
import { getAgentsHome, getClientHomes } from '../platform/paths.mjs';

import { PLANNING_CORE_SKILLS } from './contract.mjs';

export function resolveSuperpowersSkillsSource({ env = process.env, homeDir = os.homedir() } = {}) {
  const homes = getClientHomes(env, homeDir);
  const agentsHome = getAgentsHome(env, homeDir);
  const candidates = [
    path.join(homes.codex, 'superpowers', 'skills'),
    path.join(agentsHome, 'skills', 'superpowers'),
    // Flat install under ~/.agents/skills (each skill is a sibling) — rare
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'writing-plans', 'SKILL.md'))) {
      return candidate;
    }
  }
  // Flat layout: skills live directly under ~/.agents/skills/<name>
  const flatRoot = path.join(agentsHome, 'skills');
  if (fs.existsSync(path.join(flatRoot, 'writing-plans', 'SKILL.md'))) {
    return flatRoot;
  }
  return candidates[0];
}

function linkSkillSet({
  sourceRoot,
  targetRoot,
  skillNames = PLANNING_CORE_SKILLS,
  force = false,
  io = console,
  label = '',
}) {
  if (!sourceRoot || !fs.existsSync(sourceRoot)) {
    return { linked: 0, reused: 0, skipped: 0, missingSource: true, targetRoot };
  }
  fs.mkdirSync(targetRoot, { recursive: true });
  let linked = 0;
  let reused = 0;
  let skipped = 0;
  const missing = [];

  for (const name of skillNames) {
    const src = path.join(sourceRoot, name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
      missing.push(name);
      continue;
    }
    const dest = path.join(targetRoot, name);
    const status = ensureManagedLink(dest, src, { force });
    if (status === 'reused') reused += 1;
    else if (status === 'skipped') {
      skipped += 1;
      io.log?.(`[warn] planning skill not linked (${label}): ${dest}`);
    } else {
      linked += 1;
      io.log?.(`[link] planning skill (${label}): ${name}`);
    }
  }

  return { linked, reused, skipped, missing, missingSource: false, targetRoot };
}

/**
 * Project planning skills into project + home skill roots for selected clients.
 */
export function projectPlanningSkills({
  rootDir = process.cwd(),
  client = 'all',
  force = false,
  env = process.env,
  homeDir = os.homedir(),
  io = console,
  skillNames = PLANNING_CORE_SKILLS,
} = {}) {
  const selection = resolveClientCapabilitySelection('superpowers', client);
  const sourceRoot = resolveSuperpowersSkillsSource({ env, homeDir });
  const homes = getClientHomes(env, homeDir);
  const results = [];

  if (!fs.existsSync(path.join(sourceRoot, 'writing-plans', 'SKILL.md'))) {
    io.log?.(`[err] superpowers skills source not found (need writing-plans): ${sourceRoot}`);
    io.log?.('       Run: node scripts/aios.mjs setup --components superpowers --force');
    return {
      ok: false,
      sourceRoot,
      results: [],
      error: 'superpowers-skills-source-missing',
    };
  }

  for (const clientId of selection.supported) {
    const def = CLIENT_DEFINITIONS[clientId];
    if (!def) continue;

    const projectTarget = rootDir ? path.join(rootDir, def.projectSkillRoot) : null;
    const homeTarget = path.join(homes[clientId] || path.join(homeDir, `.${clientId}`), 'skills');

    const project = projectTarget
      ? linkSkillSet({
        sourceRoot,
        targetRoot: projectTarget,
        skillNames,
        force,
        io,
        label: `${clientId}:project`,
      })
      : null;

    const home = linkSkillSet({
      sourceRoot,
      targetRoot: homeTarget,
      skillNames,
      force,
      io,
      label: `${clientId}:home`,
    });

    results.push({
      clientId,
      project,
      home,
      ok: Boolean((project && project.missing?.length === 0 && !project.missingSource)
        || (home && home.missing?.length === 0 && !home.missingSource)),
    });
  }

  // Shared agents home is used by OpenCode / multi-client scanners
  const agentsHome = getAgentsHome(env, homeDir);
  const sharedFlat = linkSkillSet({
    sourceRoot,
    targetRoot: path.join(agentsHome, 'skills'),
    skillNames,
    force,
    io,
    label: 'agents-home',
  });

  const ok = results.every((r) => r.ok);
  return {
    ok,
    sourceRoot,
    results,
    sharedFlat,
    supportedClients: selection.supported,
  };
}
