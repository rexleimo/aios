import path from 'node:path';

import {
  buildRuntimeClientProviderMap,
  getClientCommandName,
  resolveClientRuntimeIds,
} from '../../clients/registry.mjs';

export const SUBAGENT_CLIENT_ENV = 'AIOS_SUBAGENT_CLIENT';
export const SUBAGENT_CONCURRENCY_ENV = 'AIOS_SUBAGENT_CONCURRENCY';
export const SUBAGENT_TIMEOUT_MS_ENV = 'AIOS_SUBAGENT_TIMEOUT_MS';
export const SUBAGENT_UPSTREAM_MAX_ATTEMPTS_ENV = 'AIOS_SUBAGENT_UPSTREAM_MAX_ATTEMPTS';
export const SUBAGENT_UPSTREAM_BACKOFF_MS_ENV = 'AIOS_SUBAGENT_UPSTREAM_BACKOFF_MS';
export const SUBAGENT_PRE_MUTATION_SNAPSHOT_ENV = 'AIOS_SUBAGENT_PRE_MUTATION_SNAPSHOT';
export const SUBAGENT_CODEX_DISABLE_MCP_ENV = 'AIOS_SUBAGENT_CODEX_DISABLE_MCP';
export const SUBAGENT_CODEX_UNATTENDED_ENV = 'AIOS_SUBAGENT_CODEX_UNATTENDED';
export const SUBAGENT_CLAUDE_UNATTENDED_ENV = 'AIOS_SUBAGENT_CLAUDE_UNATTENDED';
export const SUBAGENT_GEMINI_UNATTENDED_ENV = 'AIOS_SUBAGENT_GEMINI_UNATTENDED';
export const SUBAGENT_GROK_UNATTENDED_ENV = 'AIOS_SUBAGENT_GROK_UNATTENDED';

/* 中文注释：harness/team dispatch 注入到子 agent 环境的 agent id 变量名，用于 memo CLI 的 per-agent 命名空间隔离。 */
export const AGENT_ID_ENV = 'AIOS_AGENT_ID';

export const SUPPORTED_CLIENT_IDS = resolveClientRuntimeIds('all');
export const SUPPORTED_CLIENTS = new Set(SUPPORTED_CLIENT_IDS);
export const CLIENT_COMMAND = Object.freeze(Object.fromEntries(
  Object.entries(buildRuntimeClientProviderMap('all')).map(([clientId, client]) => [
    clientId,
    getClientCommandName(client),
  ])
));

export const CODEX_OUTPUT_SCHEMA_REL = path.join('scripts', 'lib', 'specs', 'agent-handoff.schema.json');
export const HANDOFF_SCHEMA_DISPLAY_PATH = 'scripts/lib/specs/agent-handoff.schema.json';
