#!/usr/bin/env node
// Client capability scorecard — recomputes the AIOS control-surface score for
// every client declared in config/host-capabilities.json. No number in the
// report is hand-written: scripts/client-capability-scorecard.mjs --check
// regenerates the report and fails on drift.
//
// This measures the AIOS-side interception/control surface of each client.
// It is NOT a model-intelligence or leaderboard score — see the report's
// scope section, which is generated from the same config.

import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';

const DEFAULT_CONFIG_PATH = 'config/host-capabilities.json';
const DEFAULT_REPORT_PATH = 'docs/reports/2026-10-19-client-capability-scorecard.md';

export const LEVEL_POINTS = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3 });
// Capability axes are the exact token set used by config/host-capabilities.json.
// Exported because this file is the vocabulary's single owner: the shell matrix
// view imports it instead of keeping a second copy that could drift.
export const CAPABILITY_AXES = Object.freeze([
  'sessionStartInjection',
  'preToolRewrite',
  'controlledShellRunner',
  'mcpProxy',
  'compactPacket',
  'advisorySkills',
  'metrics',
]);
const MAX_SCORE = Math.max(...Object.values(LEVEL_POINTS)) + CAPABILITY_AXES.length + 2;

export function scoreEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('scoreEntry requires a client entry object');
  }
  const level = LEVEL_POINTS[entry.targetLevel];
  if (level === undefined) {
    throw new Error(`unknown targetLevel: ${entry.targetLevel}`);
  }
  const declared = new Set(entry.capabilities || []);
  const capabilities = CAPABILITY_AXES.map((axis) => (declared.has(axis) ? 1 : 0));
  const entrypoint = entry.requiredEntrypoint === 'aios-managed-runner'
    && entry.directHostBypassAllowed === false ? 1 : 0;
  const compression = entry.turnCompression
    && entry.turnCompression.preSendRequired === true
    && entry.turnCompression.postReceiveRequired === true
    && entry.turnCompression.mode === 'tight'
    && entry.turnCompression.uncontrolledHostOutput === 'policy-violation' ? 1 : 0;
  const total = level + capabilities.reduce((a, b) => a + b, 0) + entrypoint + compression;
  return {
    targetLevel: entry.targetLevel,
    levelPoints: level,
    capabilities,
    entrypoint,
    compression,
    total,
    limits: entry.limits || [],
  };
}

export function buildScorecard(config) {
  const clients = config && config.clients;
  if (!clients || typeof clients !== 'object') {
    throw new Error('host-capabilities config must contain a clients map');
  }
  return Object.fromEntries(Object.entries(clients).map(([name, entry]) => [name, {
    ...scoreEntry(entry),
    declaredCapabilities: entry.capabilities || [],
  }]));
}

const MARK = { 1: '✓', 0: '·' };

export function renderReport(config, scorecard) {
  const levelLegend = Object.entries(config.levels)
    .map(([level, description]) => `- \`${level}\` (${LEVEL_POINTS[level] ?? 'unpriced'} pts): ${description}`)
    .join('\n');
  const axesLine = CAPABILITY_AXES.map((axis) => `\`${axis}\``).join(' + ');
  const rows = Object.entries(scorecard)
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([name, score]) => {
      const caps = score.capabilities.map((v) => MARK[v]).join(' ');
      return `| \`${name}\` | ${score.targetLevel} (${score.levelPoints}) | ${caps} | ${MARK[score.entrypoint]} | ${MARK[score.compression]} | **${score.total} / ${MAX_SCORE}** |`;
    })
    .join('\n');
  const limitNotes = Object.entries(scorecard)
    .filter(([, score]) => score.limits.length > 0)
    .map(([name, score]) => `### \`${name}\`\n${score.limits.map((limit) => `- ${limit}`).join('\n')}`)
    .join('\n\n');

  return `# Client Capability Scorecard (generated)

<!-- generated-by: scripts/client-capability-scorecard.mjs -->
<!-- source: config/host-capabilities.json — do not hand-edit numbers; rerun --write -->

## Scope and reading rules

- This scorecard measures the **AIOS control-surface coverage** of each client
  (what AIOS can reliably intercept, inject, compress, and meter), recomputed
  from \`config/host-capabilities.json\`. It is **not** a model-intelligence
  score and **not** a leaderboard entry; behavioral A/B evidence lives in the
  \`docs/reports/2026-07-23-workflow-intelligence-diagnostic-*\` protocol.
- Axis set is fixed to the capability tokens in the config: ${axesLine}.
- Every row's evidence is the config entry itself; declared limits are listed
  verbatim below the table so constraints stay visible with the score.

## Level legend (from config)

${levelLegend}

## Scorecard

| client | level | ${CAPABILITY_AXES.map((axis) => axis.slice(0, 4)).join(' ')} | entry | compress | total |
| --- | --- | --- | --- | --- | --- |
${rows}

\`entry\` = \`requiredEntrypoint: aios-managed-runner\` and \`directHostBypassAllowed: false\`.
\`compress\` = pre-send + post-receive required, mode \`tight\`, uncontrolled host output
treated as \`policy-violation\`. Column order in \`level\` and capability groups matches
the axis list above; abbreviated headers are the first four letters of each axis.

## Declared limits (evidence, verbatim from config)

${limitNotes}
`;
}

function main(argv) {
  const mode = argv.includes('--check') ? 'check' : argv.includes('--write') ? 'write' : 'print';
  const configPath = argv.includes('--config')
    ? argv[argv.indexOf('--config') + 1]
    : DEFAULT_CONFIG_PATH;
  const reportPath = argv.includes('--report')
    ? argv[argv.indexOf('--report') + 1]
    : DEFAULT_REPORT_PATH;

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const scorecard = buildScorecard(config);

  if (mode === 'print') {
    console.log(JSON.stringify(scorecard, null, 2));
    return;
  }
  const rendered = renderReport(config, scorecard);
  if (mode === 'write') {
    writeFileSync(reportPath, rendered);
    console.log(`wrote ${reportPath}`);
    return;
  }
  let current = '';
  try {
    current = readFileSync(reportPath, 'utf8');
  } catch {
    console.error(`drift: ${reportPath} does not exist`);
    process.exitCode = 1;
    return;
  }
  if (current !== rendered) {
    console.error(`drift: ${reportPath} no longer matches config/host-capabilities.json`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok: ${reportPath} matches config (${Object.keys(scorecard).length} clients)`);
}

if (isDirectModuleInvocation(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
