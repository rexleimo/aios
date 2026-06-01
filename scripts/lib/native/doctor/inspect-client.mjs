import path from 'node:path';

import { supportsClientCapability } from '../../clients/registry.mjs';
import { checkGeneratedSkillsSync } from '../../skills/sync.mjs';
import { EMITTERS } from '../sync/constants.mjs';
import { AIOS_NATIVE_JSON_KEY, hasManagedMarkdownBlock, parseJsonObject } from '../emitters/shared.mjs';
import { readNativeSyncMetadata } from '../install-metadata.mjs';
import { buildNativeOutputPlan } from '../source-tree.mjs';
import { inspectOperation } from './inspect-operation.mjs';
import {
  buildFixCommand,
  buildIssue,
  formatOperationTarget,
  parseIssueTargetFromMessage,
  pathExists,
  readOptional,
  withIssueTarget,
} from './shared.mjs';

async function detectManagedFootprint({ rendered, plan, resolvedTargetRootDir }) {
  for (const operation of rendered.operations) {
    const targetPath = path.join(resolvedTargetRootDir, operation.targetPath);
    const current = await readOptional(targetPath);
    if (!current) {
      continue;
    }
    if (operation.kind === 'json-merge') {
      try {
        const parsed = parseJsonObject(current, targetPath);
        if (AIOS_NATIVE_JSON_KEY in parsed) {
          return true;
        }
      } catch {
        return true;
      }
      continue;
    }
    try {
      if (hasManagedMarkdownBlock(current)) {
        return true;
      }
    } catch {
      return true;
    }
  }

  for (const relativePath of plan.outputs) {
    if (relativePath === 'AGENTS.md' || relativePath === 'CLAUDE.md' || relativePath.endsWith('settings.local.json') || relativePath.endsWith('AIOS.md')) {
      continue;
    }
    if (await pathExists(path.join(resolvedTargetRootDir, relativePath))) {
      return true;
    }
  }

  return false;
}

export async function inspectClient({ rootDir, targetRootDir, manifest, client, selectedClients = [client] }) {
  const resolvedTargetRootDir = targetRootDir || rootDir;
  const plan = buildNativeOutputPlan({ rootDir: resolvedTargetRootDir, manifest, client });
  const metadataPathRelative = (path.relative(resolvedTargetRootDir, plan.metadataPath) || plan.metadataPath).replace(/\\/g, '/');
  const rendered = EMITTERS[client]({ rootDir, manifest, selectedClients });
  const operationTargets = rendered.operations.map((operation) => formatOperationTarget(operation));
  const fixCommand = buildFixCommand(client);
  const issues = [];
  const metadata = readNativeSyncMetadata(plan.metadataRoot);
  const hasManagedFootprint = await detectManagedFootprint({ rendered, plan, resolvedTargetRootDir });

  if (!metadata) {
    if (!hasManagedFootprint) {
      return {
        client,
        tier: plan.tier,
        issues,
        details: {
          metadataPath: metadataPathRelative,
          metadataPresent: false,
          metadataGeneratedAt: '',
          expectedManagedTargets: [...rendered.managedTargets],
          metadataManagedTargets: [],
          operationTargets,
        },
      };
    }
    issues.push(withIssueTarget(buildIssue({ client, message: `[missing] ${metadataPathRelative}`, fix: fixCommand }), metadataPathRelative));
  } else {
    if (metadata.client !== client) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${metadataPathRelative} client=${metadata.client}`, fix: fixCommand }), metadataPathRelative));
    }
    if (metadata.tier !== plan.tier) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${metadataPathRelative} tier=${metadata.tier}`, fix: fixCommand }), metadataPathRelative));
    }
    if (JSON.stringify(metadata.managedTargets || []) !== JSON.stringify(rendered.managedTargets)) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[drift] ${metadataPathRelative} managedTargets`, fix: fixCommand }), metadataPathRelative));
    }
  }

  for (const operation of rendered.operations) {
    await inspectOperation({ targetRootDir: resolvedTargetRootDir, client, operation, fixCommand, issues });
  }

  const skillsResult = await checkGeneratedSkillsSync({
    rootDir,
    targetRootDir: resolvedTargetRootDir,
    surfaces: [client],
    io: { log() {} },
  });
  if (!skillsResult.ok) {
    for (const issue of skillsResult.issues) {
      issues.push(withIssueTarget(buildIssue({ client, message: issue, fix: fixCommand }), parseIssueTargetFromMessage(issue)));
    }
  }

  if (supportsClientCapability(client, 'agents')) {
    const agentRoot = path.join(resolvedTargetRootDir, `.${client}`, 'agents');
    if (!(await pathExists(agentRoot))) {
      issues.push(withIssueTarget(buildIssue({ client, message: `[missing] .${client}/agents`, fix: fixCommand }), `.${client}/agents`));
    }
  }

  return {
    client,
    tier: plan.tier,
    issues,
    details: {
      metadataPath: metadataPathRelative,
      metadataPresent: Boolean(metadata),
      metadataGeneratedAt: String(metadata?.generatedAt || ''),
      expectedManagedTargets: [...rendered.managedTargets],
      metadataManagedTargets: Array.isArray(metadata?.managedTargets) ? [...metadata.managedTargets] : [],
      operationTargets,
    },
  };
}