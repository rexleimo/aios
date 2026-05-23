export const LOG_AUDIT_TARGETS = ['scripts', 'mcp-server/src'];

export const LOG_AUDIT_EXCLUDE_GLOBS = [
  '!scripts/tests/**',
  '!scripts/contextdb-shell-bridge.mjs',
  '!scripts/ctx-agent-core.mjs',
  '!scripts/doctor-bootstrap-task.mjs',
  '!scripts/lib/lifecycle/quality-gate.mjs',
  '!mcp-server/src/contextdb/cli.ts',
  '!scripts/rl-shell-v1.mjs',
  '!scripts/rl-mixed-v1.mjs',
  '!scripts/generate-rl-shell-v1-benchmark.mjs',
  '!scripts/generate-orchestrator-agents.mjs',
  '!scripts/sync-skills.mjs',
  '!scripts/sync-native.mjs',
  '!scripts/check-native-sync.mjs',
  '!scripts/check-site-sync.mjs',
  '!scripts/materialize-release-local-outputs.mjs',
  '!scripts/perf-orchestrate-learn-eval-smoke.mjs',
  '!scripts/perf-team-status-watch-smoke.mjs',
  '!scripts/lib/tui-ink/cli.tsx',
  '!scripts/lib/tui-ink/index.tsx',
];

export const QUALITY_FAILURE_CATEGORY_BY_LABEL = {
  Build: 'quality-build',
  Types: 'quality-types',
  ContextDB: 'quality-contextdb',
  Scripts: 'quality-scripts',
  Logs: 'quality-logs',
  Release: 'quality-release',
  Architecture: 'quality-architecture',
  Security: 'quality-security',
  Git: 'quality-git',
};