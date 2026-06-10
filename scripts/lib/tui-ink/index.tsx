// scripts/lib/tui-ink/index.tsx

import { render } from 'ink';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { App } from './App';
import type { CatalogSkill, InstalledSkills, Client } from './types';

// ASCII art banner
const REX_CLI_BANNER = `
  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║   ██████╗ ██╗  ██╗██╗██████╗  ██████╗    ║
  ║   ██╔══██╗██║ ██╔╝██║██╔══██╗██╔════╝    ║
  ║   ██████╔╝█████╔╝ ██║██████╔╝██║         ║
  ║   ██╔══██╗██╔═██╗ ██║██╔══██╗██║         ║
  ║   ██║  ██║██║  ██╗██║██║  ██║╚██████╗    ║
  ║   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝    ║
  ║                                          ║
  ║          Hello, Rex CLI!                 ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
`;

function printBanner(): void {
  console.log('\x1b[36m' + REX_CLI_BANNER + '\x1b[0m'); // cyan color
}

// Import from existing modules
// Note: These paths work because tui-ink is under scripts/lib/
// and platform/paths.mjs is at scripts/lib/platform/paths.mjs

async function loadSkillsCatalog(rootDir: string): Promise<CatalogSkill[]> {
  const { scanSkillsSources } = await import('../skills/source-tree.mjs');
  const skills = scanSkillsSources(rootDir);
  return skills
    .filter((entry) => entry.installCatalogName !== null)
    .map((entry) => ({
      name: entry.installCatalogName || entry.relativeSkillPath,
      description: entry.description || '',
      clients: entry.clients || [],
      scopes: entry.scopes || [],
      defaultInstall: entry.defaultInstall || { global: false, project: false },
    }));
}

function normalizePathForCompare(inputPath: string): string {
  let output = path.resolve(inputPath);
  try {
    output = fs.realpathSync(output);
  } catch {
    // Keep resolved path when target doesn't exist
  }
  return process.platform === 'win32' ? output.toLowerCase() : output;
}

// Simplified client homes - matches existing logic in scripts/lib/platform/paths.mjs
// antigravity inherits Gemini's roots; crush uses its own .crush root.
function getClientHomes(): Record<Client, string> {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return {
    codex: path.join(home, '.codex'),
    claude: path.join(home, '.claude'),
    gemini: path.join(home, '.gemini'),
    antigravity: path.join(home, '.gemini'),
    opencode: path.join(home, '.opencode'),
    crush: path.join(home, '.crush'),
    all: home, // Not used for 'all'
  };
}

// Project-scope skill root per client. antigravity shares Gemini's .gemini/skills.
function getClientProjectSkillDir(projectRoot: string, client: Client): string {
  const subdir = client === 'antigravity' ? '.gemini/skills' : `.${client}/skills`;
  return path.join(projectRoot, subdir);
}

function collectInstalledSkills(
  rootDir: string,
  projectRoot: string,
  catalogSkills: CatalogSkill[]
): InstalledSkills {
  const homes = getClientHomes();
  const installedSkills: InstalledSkills = { global: {}, project: {} };
  const allowProjectInstallMarkers = normalizePathForCompare(projectRoot) !== normalizePathForCompare(rootDir);

  for (const skill of catalogSkills) {
    for (const client of Array.isArray(skill.clients) ? skill.clients : []) {
      const globalRoot = path.join(homes[client] || '', 'skills');
      const projectRootForClient = getClientProjectSkillDir(projectRoot, client);
      const globalPath = path.join(globalRoot, skill.name);
      const projectPath = path.join(projectRootForClient, skill.name);

      if (fs.existsSync(globalPath)) {
        installedSkills.global[client] = installedSkills.global[client] || [];
        installedSkills.global[client].push(skill.name);
      }
      if (allowProjectInstallMarkers && fs.existsSync(projectPath)) {
        installedSkills.project[client] = installedSkills.project[client] || [];
        installedSkills.project[client].push(skill.name);
      }
    }
  }

  return installedSkills;
}

export interface RunInteractiveSessionOptions {
  rootDir: string;
  onRun: (action: string, options: unknown) => Promise<void>;
}

export async function runInteractiveSession({
  rootDir,
  onRun,
}: RunInteractiveSessionOptions): Promise<void> {
  printBanner();

  const catalogSkills = await loadSkillsCatalog(rootDir);
  const cwd = process.cwd();

  const onRefreshInstalled = (): InstalledSkills => {
    return collectInstalledSkills(rootDir, cwd, catalogSkills);
  };

  const handleRun = async (
    action: string,
    options: unknown,
    hooks?: { onLog?: (line: string) => void }
  ) => {
    await onRun(action, options);
  };

  const { waitUntilExit } = render(
    React.createElement(App, {
      rootDir,
      catalogSkills,
      installedSkills: onRefreshInstalled(),
      onRefreshInstalled,
      onRun: handleRun,
    })
  );

  await waitUntilExit();
}