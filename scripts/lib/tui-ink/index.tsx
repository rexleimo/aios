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

function resolveCatalogPath(rootDir: string): string {
  return path.join(rootDir, 'config', 'skills-catalog.json');
}

function loadSkillsCatalog(rootDir: string): CatalogSkill[] {
  const catalogPath = resolveCatalogPath(rootDir);
  if (!fs.existsSync(catalogPath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(catalogPath, 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data?.skills) ? data.skills : [];
  } catch {
    return [];
  }
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
function getClientHomes(): Record<Client, string> {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return {
    codex: path.join(home, '.codex'),
    claude: path.join(home, '.claude'),
    gemini: path.join(home, '.gemini'),
    opencode: path.join(home, '.opencode'),
    kiro: path.join(home, '.kiro'),
    all: home, // Not used for 'all'
  };
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
      const projectRootForClient = path.join(
        projectRoot,
        client === 'opencode' ? '.opencode/skills' : `.${client}/skills`
      );
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
  // Print welcome banner
  printBanner();

  const catalogSkills = loadSkillsCatalog(rootDir);
  const installedSkills = collectInstalledSkills(rootDir, process.cwd(), catalogSkills);

  // Wrapper to match TuiSessionProps.onRun signature
  const handleRun = async (action: string, options: unknown) => {
    await onRun(action, options);
  };

  const { waitUntilExit } = render(
    React.createElement(App, {
      rootDir,
      catalogSkills,
      installedSkills,
      onRun: handleRun,
    })
  );

  await waitUntilExit();
}
