import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { materializeSkillTree } from '../../lib/skills/source-tree.mjs';

/**
 * Read exactly what the sync/installer projects for a client surface, without
 * depending on a developer's already-synced working tree.
 *
 * Every generated root (`.codex/skills`, `.claude/skills`, `.agents/skills`,
 * `.grok/skills`, ...) is gitignored, so a clean checkout — which is what CI
 * and every release build uses — contains none of them. Tests that read those
 * paths directly only ever pass in a worktree where `aios init`/`sync-skills`
 * already ran, which is why they went red the moment they were wired into the
 * regression suite (found 2026-09-21, fixed in v6.0.5).
 *
 * `materializeSkillTree` is the same primitive the installer and the sync use,
 * so the assertion still covers the real projection contract (including the
 * `clients/<client>` overlay and AIOS-frontmatter stripping) instead of the
 * canonical source alone.
 */
export async function readProjectedSkill(rootDir, relativeSkillPath, client) {
  const materialized = materializeSkillTree({ rootDir, relativeSkillPath, client });
  try {
    return await readFile(path.join(materialized.directoryPath, 'SKILL.md'), 'utf8');
  } finally {
    materialized.cleanup();
  }
}
