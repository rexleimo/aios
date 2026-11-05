import { BOOTSTRAP_COMMAND_SPECS } from './core/bootstrap.mjs';
import { EXECUTION_COMMAND_SPECS } from './core/execution.mjs';
import { HEALTH_COMMAND_SPECS } from './intel/health.mjs';
import { INTERNAL_COMMAND_SPECS } from './io/internal.mjs';
import { INTEGRATION_COMMAND_SPECS } from './io/integration.mjs';
import { MCP_COMMAND_SPECS } from './io/mcp.mjs';
import { JUDGMENT_COMMAND_SPECS } from './intel/judgment.mjs';
import { LIFECYCLE_COMMAND_SPECS } from './core/lifecycle.mjs';
import { MEMORY_COMMAND_SPECS } from './intel/memory.mjs';
import { INSIGHT_COMMAND_SPECS } from './intel/insight.mjs';
import { TOOL_OUTPUT_COMMAND_SPECS } from './io/tool-output.mjs';
import { WORKFLOW_COMMAND_SPECS } from './core/workflow.mjs';
import { WORK_COMMAND_SPECS } from './core/work.mjs';

export const COMMAND_SPECS = [
  ...BOOTSTRAP_COMMAND_SPECS,
  ...LIFECYCLE_COMMAND_SPECS,
  ...HEALTH_COMMAND_SPECS,
  ...WORKFLOW_COMMAND_SPECS,
  ...WORK_COMMAND_SPECS,
  ...EXECUTION_COMMAND_SPECS,
  ...INSIGHT_COMMAND_SPECS,
  ...MEMORY_COMMAND_SPECS,
  ...INTEGRATION_COMMAND_SPECS,
  ...MCP_COMMAND_SPECS,
  ...JUDGMENT_COMMAND_SPECS,
  ...TOOL_OUTPUT_COMMAND_SPECS,
  ...INTERNAL_COMMAND_SPECS,
];
