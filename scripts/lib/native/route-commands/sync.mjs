import fs from 'node:fs/promises';
import path from 'node:path';

import { buildRouteTriggerCommandTargets } from './render.mjs';
import { createResult, isManagedRouteCommand, readOptional } from './io.mjs';
import { normalizeClientSelection } from './selection.mjs';

export async function syncRouteTriggerCommands({
  rootDir,
  client = 'all',
  mode = 'install',
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const normalizedMode = String(mode || 'install').trim().toLowerCase();
  if (normalizedMode !== 'install' && normalizedMode !== 'uninstall') {
    throw new Error('route command mode must be install or uninstall');
  }

  const resultsByClient = new Map(normalizeClientSelection(client).map((item) => [item, createResult(item)]));
  const targets = buildRouteTriggerCommandTargets({ rootDir, client, homeMap, env });

  for (const target of targets) {
    const result = resultsByClient.get(target.client);
    const current = await readOptional(target.targetPath);

    if (normalizedMode === 'uninstall') {
      if (!current) {
        result.reused += 1;
        continue;
      }
      if (!isManagedRouteCommand(current)) {
        result.skipped += 1;
        io.log(`[skip] ${target.client} route command unmanaged: ${target.targetPath}`);
        continue;
      }
      await fs.rm(target.targetPath, { force: true });
      result.removed += 1;
      continue;
    }

    if (!current) {
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
      await fs.writeFile(target.targetPath, target.content, 'utf8');
      result.installed += 1;
      continue;
    }
    if (current === target.content) {
      result.reused += 1;
      continue;
    }
    if (!isManagedRouteCommand(current)) {
      result.skipped += 1;
      io.log(`[skip] ${target.client} route command unmanaged: ${target.targetPath}`);
      continue;
    }
    await fs.writeFile(target.targetPath, target.content, 'utf8');
    result.updated += 1;
  }

  return {
    ok: true,
    results: [...resultsByClient.values()],
  };
}

export async function checkRouteTriggerCommandsSync({
  rootDir,
  client = 'all',
  homeMap = {},
  env = process.env,
} = {}) {
  const targets = buildRouteTriggerCommandTargets({ rootDir, client, homeMap, env });
  const reports = new Map(normalizeClientSelection(client).map((item) => [item, {
    client: item,
    issues: [],
    targets: [],
  }]));
  const issues = [];

  for (const target of targets) {
    const report = reports.get(target.client);
    report.targets.push(target.targetPath);
    const current = await readOptional(target.targetPath);
    if (!current) {
      const issue = `[${target.client}] [missing] ${target.targetPath}`;
      report.issues.push(issue);
      issues.push(issue);
      continue;
    }
    if (current === target.content) {
      continue;
    }
    if (!isManagedRouteCommand(current)) {
      const issue = `[${target.client}] [unmanaged conflict] ${target.targetPath}`;
      report.issues.push(issue);
      issues.push(issue);
      continue;
    }
    const issue = `[${target.client}] [drift] ${target.targetPath}`;
    report.issues.push(issue);
    issues.push(issue);
  }

  return {
    ok: issues.length === 0,
    reports: [...reports.values()],
    issues,
  };
}
