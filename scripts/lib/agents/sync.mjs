import { mkdtemp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderCompatibilityExport } from './compat-export.mjs';
import { renderClaudeAgent } from './emitters/claude.mjs';
import { writeFileAtomic } from '../fs/atomic-write.mjs';
import {
  ORCHESTRATOR_AGENT_MARKER,
  ORCHESTRATOR_AGENT_MARKER_END,
} from './emitters/shared.mjs';
import { renderCodexAgent } from './emitters/codex.mjs';
import { renderGrokAgent } from './emitters/grok.mjs';
import { renderOpencodeAgent } from './emitters/opencode.mjs';
import { loadCanonicalAgents } from './source-tree.mjs';
import { resolveClientAgentTargets } from '../clients/capabilities/index.mjs';
import { getClientAgentTargetRoot } from '../clients/paths/index.mjs';

const TARGET_ROOTS = Object.fromEntries(
  resolveClientAgentTargets('all').map((target) => [target, getClientAgentTargetRoot(target)])
);

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeNewlines(content) {
  return String(content ?? '').replace(/\r\n/g, '\n');
}

function hasManagedMarker(content) {
  return String(content || '').includes(ORCHESTRATOR_AGENT_MARKER)
    || String(content || '').includes(ORCHESTRATOR_AGENT_MARKER_END);
}

function slugifyPath(relativePath) {
  return relativePath.replace(/[\\/]/g, '__');
}

function joinRelativePath(...parts) {
  return parts
    .map((part) => String(part || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

async function readOptional(absPath) {
  try {
    return {
      exists: true,
      content: await readFile(absPath, 'utf8'),
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        exists: false,
        content: '',
      };
    }
    throw error;
  }
}

async function listAgentRoleFiles(absDir) {
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    return entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const lowerName = entry.name.toLowerCase();
        return lowerName.endsWith('.md') || lowerName.endsWith('.toml');
      })
      .map((entry) => entry.name);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function removeOptional(absPath) {
  await rm(absPath, { force: true });
}

function buildEmitterMap(emitters = {}) {
  return {
    claude: emitters.claude || renderClaudeAgent,
    codex: emitters.codex || renderCodexAgent,
    opencode: emitters.opencode || renderOpencodeAgent,
    grok: emitters.grok || renderGrokAgent,
  };
}

export function resolveAgentTargets(client = 'all') {
  return resolveClientAgentTargets(client);
}

export function isManagedAgentMarkdown(content, expectedId) {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith('---\n')) return false;

  const frontmatterEnd = normalized.indexOf('\n---\n', 4);
  if (frontmatterEnd < 0) return false;

  const frontmatter = normalized.slice(4, frontmatterEnd).split('\n');
  const nameLine = frontmatter.find((line) => line.startsWith('name: '));
  if (nameLine !== `name: ${expectedId}`) return false;

  const body = normalized.slice(frontmatterEnd + '\n---\n'.length);
  const bodyLines = body.split('\n');
  const nonEmptyLines = bodyLines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return false;

  return nonEmptyLines[0] === ORCHESTRATOR_AGENT_MARKER
    && nonEmptyLines[nonEmptyLines.length - 1] === ORCHESTRATOR_AGENT_MARKER_END;
}

export function isManagedAgentToml(content, expectedId) {
  const normalized = normalizeNewlines(content);
  const lines = normalized.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return false;
  if (nonEmptyLines[0] !== `# ${ORCHESTRATOR_AGENT_MARKER}`) return false;
  if (nonEmptyLines[nonEmptyLines.length - 1] !== `# ${ORCHESTRATOR_AGENT_MARKER_END}`) return false;

  const nameLine = lines.find((line) => line.trim().startsWith('name = '));
  const match = nameLine?.trim().match(/^name\s*=\s*"([^"]+)"\s*$/u);
  return Boolean(match && match[1] === expectedId);
}

export function isManagedAgentFile(content, expectedId, relPath = '') {
  if (String(relPath || '').toLowerCase().endsWith('.toml')) {
    return isManagedAgentToml(content, expectedId);
  }
  return isManagedAgentMarkdown(content, expectedId);
}

function buildExpectedFiles({ source, targets, mode, emitters }) {
  const emitterMap = buildEmitterMap(emitters);
  const byTarget = new Map(targets.map((target) => [target, new Map()]));
  const allPaths = new Set();

  if (mode === 'uninstall') {
    return byTarget;
  }

  for (const target of targets) {
    const render = emitterMap[target];
    assertCondition(typeof render === 'function', `missing emitter for target: ${target}`);

    for (const agentId of Object.keys(source.agentsById)) {
      const rendered = render(source.agentsById[agentId]);
      assertCondition(rendered && typeof rendered.targetRelPath === 'string', `emitter ${target} must return targetRelPath`);
      assertCondition(typeof rendered.content === 'string', `emitter ${target} must return content`);
      assertCondition(!allPaths.has(rendered.targetRelPath), `collision detected for ${rendered.targetRelPath}`);
      allPaths.add(rendered.targetRelPath);
      byTarget.get(target).set(rendered.targetRelPath, rendered.content);
    }
  }

  return byTarget;
}

function createDefaultFsOps() {
  return {
    async moveStaleManagedFile(fromPath, toPath) {
      await mkdir(path.dirname(toPath), { recursive: true });
      await rename(fromPath, toPath);
    },
    async replaceTargetFile(absPath, content) {
      await writeFileAtomic(absPath, content);
    },
    async writeCompatibilityExport(absPath, content) {
      await writeFileAtomic(absPath, content);
    },
  };
}

export async function syncCanonicalAgents({
  rootDir,
  targetRootDir = rootDir,
  targets = resolveClientAgentTargets('all'),
  mode = 'install',
  writeCompatibilityExport = true,
  io = console,
  fsOps,
  emitters,
}) {
  const sourceRootDir = path.resolve(rootDir);
  const resolvedTargetRootDir = path.resolve(targetRootDir || rootDir);
  const selectedTargets = [...new Set((targets || []).map((target) => String(target).trim()).filter(Boolean))];
  const source = mode === 'uninstall' && writeCompatibilityExport === false
    ? null
    : await loadCanonicalAgents({ rootDir: sourceRootDir });
  const expectedFiles = buildExpectedFiles({
    source: source || { agentsById: {} },
    targets: selectedTargets,
    mode,
    emitters,
  });
  const exportText = writeCompatibilityExport ? renderCompatibilityExport(source) : null;
  const exportPath = path.join(resolvedTargetRootDir, 'scripts', 'lib', 'specs', 'orchestrator-agents.json');
  const ops = fsOps ? { ...createDefaultFsOps(), ...fsOps } : createDefaultFsOps();
  await mkdir(resolvedTargetRootDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(resolvedTargetRootDir, '.aios-agent-sync-'));
  const results = selectedTargets.map((target) => ({
    target,
    targetRel: TARGET_ROOTS[target],
    installed: 0,
    updated: 0,
    skipped: 0,
    removed: 0,
  }));
  const resultsByTarget = new Map(results.map((item) => [item.target, item]));
  const replaceOps = [];
  const staleOps = [];

  try {
    for (const target of selectedTargets) {
      const targetRoot = TARGET_ROOTS[target];
      assertCondition(targetRoot, `unsupported target: ${target}`);

      const absDir = path.join(resolvedTargetRootDir, targetRoot);
      const existingFiles = await listAgentRoleFiles(absDir);
      const expectedForTarget = expectedFiles.get(target) || new Map();

      for (const fileName of existingFiles) {
        const relPath = joinRelativePath(targetRoot, fileName);
        const absPath = path.join(resolvedTargetRootDir, relPath);
        const existing = await readFile(absPath, 'utf8');
        const expectedId = path.basename(fileName, path.extname(fileName));
        const managed = isManagedAgentFile(existing, expectedId, relPath);

        if (hasManagedMarker(existing) && !managed) {
          throw new Error(`malformed managed file: ${relPath}`);
        }

        if (expectedForTarget.has(relPath)) {
          if (!managed) {
            throw new Error(`unmanaged conflict: ${relPath}`);
          }

          const nextContent = expectedForTarget.get(relPath);
          if (existing !== nextContent) {
            replaceOps.push({
              target,
              absPath,
              relPath,
              existed: true,
              previousContent: existing,
              nextContent,
            });
          }
          expectedForTarget.delete(relPath);
          continue;
        }

        if (managed) {
          staleOps.push({ target, absPath, relPath });
        }
      }

      for (const [relPath, nextContent] of expectedForTarget.entries()) {
        replaceOps.push({
          target,
          absPath: path.join(resolvedTargetRootDir, relPath),
          relPath,
          existed: false,
          previousContent: '',
          nextContent,
        });
      }
    }

    const movedStale = [];
    const rollbackWrites = [];
    const previousExport = writeCompatibilityExport ? await readOptional(exportPath) : null;

    try {
      for (const stale of staleOps) {
        const backupPath = path.join(tempDir, slugifyPath(stale.relPath));
        await ops.moveStaleManagedFile(stale.absPath, backupPath);
        movedStale.push({ ...stale, backupPath });
        resultsByTarget.get(stale.target).removed += 1;
      }

      for (const replacement of replaceOps) {
        rollbackWrites.push(replacement.existed
          ? { type: 'restore', absPath: replacement.absPath, content: replacement.previousContent }
          : { type: 'remove', absPath: replacement.absPath });
        await ops.replaceTargetFile(replacement.absPath, replacement.nextContent);
        if (replacement.existed) {
          resultsByTarget.get(replacement.target).updated += 1;
        } else {
          resultsByTarget.get(replacement.target).installed += 1;
        }
      }

      if (writeCompatibilityExport) {
        await ops.writeCompatibilityExport(exportPath, exportText);
      }
    } catch (error) {
      for (const writeOp of rollbackWrites.reverse()) {
        if (writeOp.type === 'restore') {
          await writeFileAtomic(writeOp.absPath, writeOp.content);
        } else {
          await removeOptional(writeOp.absPath);
        }
      }

      if (writeCompatibilityExport && previousExport) {
        if (previousExport.exists) {
          await writeFileAtomic(exportPath, previousExport.content);
        } else {
          await removeOptional(exportPath);
        }
      }

      for (const stale of movedStale.reverse()) {
        await mkdir(path.dirname(stale.absPath), { recursive: true });
        await rename(stale.backupPath, stale.absPath);
      }

      throw error;
    }

    io?.log?.(`[agents] sync ok (${mode})`);
    return {
      ok: true,
      targets: selectedTargets,
      results,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
