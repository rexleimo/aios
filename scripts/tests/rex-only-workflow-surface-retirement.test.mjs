import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadCanonicalAgents } from '../lib/agents/source-tree.mjs';
import { parseArgs } from '../lib/cli/parse-args.mjs';
import { getCommandHelpText } from '../lib/cli/help.mjs';
import { CLIENT_CAPABILITIES, CLIENT_DEFINITIONS } from '../lib/clients/core/definitions.mjs';
import { runDoctorSuite } from '../lib/doctor/aggregate.mjs';
import { normalizeComponents } from '../lib/lifecycle/options.mjs';
import { listWorkflowRecipes } from '../lib/workflows/recipes.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ACTIVE_CLIENT_INSTRUCTION_FILES = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'client-sources/native-base/shared/partials/agent-routing.md',
]);

test('AIOS exposes only the Rex workflow surface', async () => {
  assert.throws(
    () => normalizeComponents(['superpowers']),
    /Unsupported component: superpowers/u,
  );
  assert.throws(
    () => parseArgs(['internal', 'superpowers', 'doctor']),
    /Unknown internal target: superpowers/u,
  );

  for (const command of ['setup', 'update']) {
    const help = getCommandHelpText(command);
    assert.doesNotMatch(help, /components[^\n]*superpowers/iu);
    assert.doesNotMatch(help, /default:[^\n]*superpowers/iu);
    assert.match(help, /--adopt-legacy-superpowers/u);
  }
  assert.doesNotMatch(getCommandHelpText('uninstall'), /superpowers/iu);

  assert.doesNotMatch(CLIENT_CAPABILITIES.join(','), /superpowers/iu);
  for (const definition of Object.values(CLIENT_DEFINITIONS)) {
    assert.doesNotMatch(definition.capabilities.join(','), /superpowers/iu);
  }

  const uiFiles = [
    'scripts/lib/tui-ink/types.ts',
    'scripts/lib/tui-ink/hooks/useSetupOptions.ts',
    'scripts/lib/tui-ink/screens/SetupScreen.tsx',
    'scripts/lib/tui-ink/screens/UpdateScreen.tsx',
    'scripts/lib/tui-ink/screens/UninstallScreen.tsx',
    'scripts/lib/tui-ink/screens/DoctorScreen.tsx',
  ];
  for (const relativePath of uiFiles) {
    const source = await readFile(path.join(rootDir, relativePath), 'utf8');
    assert.doesNotMatch(source, /superpowers/iu, `${relativePath} still renders a legacy workflow choice`);
  }

  const logs = [];
  await runDoctorSuite({
    rootDir,
    projectRoot: rootDir,
    profile: 'minimal',
    env: {
      AIOS_DISABLED_GATES: [
        'doctor:token-discipline',
        'doctor:shell',
        'doctor:skills',
        'doctor:native',
        'doctor:superpowers',
        'doctor:security',
        'doctor:bootstrap',
        'doctor:browser',
        'doctor:codemap',
        'doctor:mcp-build',
      ].join(','),
    },
    io: { log: (line) => logs.push(String(line)) },
    deps: {
      doctorRexHarness: async () => ({
        ready: true,
        version: 'test',
        errors: 0,
        effectiveWarnings: 0,
        fixHint: '',
        attemptedFix: false,
      }),
      reconcileRexWorkflowSurface: async () => ({
        status: 'already-converged',
        removed: [],
        conflicts: [],
      }),
    },
  });
  assert.doesNotMatch(logs.join('\n'), /doctor:superpowers|Superpowers repository/iu);

  const recipes = await listWorkflowRecipes({ rootDir });
  assert.ok(recipes.recipes.some((recipe) => recipe.workflowId === 'adaptive-software-delivery'));
  assert.ok(!recipes.recipes.some((recipe) => recipe.workflowId === 'loop-operation'));

  const canonicalAgents = await loadCanonicalAgents({ rootDir });
  assert.ok(!canonicalAgents.agentsById['rex-loop-operator']);
  assert.ok(!canonicalAgents.roleMap['loop-operator']);
});

test('active client instructions use Rex providers without legacy workflow references', async () => {
  for (const relativePath of ACTIVE_CLIENT_INSTRUCTION_FILES) {
    const source = await readFile(path.join(rootDir, relativePath), 'utf8');
    assert.match(source, /[Rr]ex(?:-harness)? (?:software )?[Cc]apability [Cc]ommand/u, relativePath);
    assert.doesNotMatch(
      source,
      /\bsuperpowers\b|using-superpowers|writing-plans|brainstorming|test-driven-development|systematic-debugging/iu,
      `${relativePath} still exposes a legacy workflow provider`,
    );
  }
});
