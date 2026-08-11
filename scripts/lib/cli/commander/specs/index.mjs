import { BOOTSTRAP_COMMAND_SPECS } from './bootstrap.mjs';
import { EXECUTION_COMMAND_SPECS } from './execution.mjs';
import { HEALTH_COMMAND_SPECS } from './health.mjs';
import { INTERNAL_COMMAND_SPECS } from './internal.mjs';
import { LIFECYCLE_COMMAND_SPECS } from './lifecycle.mjs';
import { MEMORY_COMMAND_SPECS } from './memory.mjs';
import { INSIGHT_COMMAND_SPECS } from './insight.mjs';
import { TOOL_OUTPUT_COMMAND_SPECS } from './tool-output.mjs';
import { WORKFLOW_COMMAND_SPECS } from './workflow.mjs';
import { WORK_COMMAND_SPECS } from './work.mjs';

export const COMMAND_SPECS = [
  ...BOOTSTRAP_COMMAND_SPECS,
  ...LIFECYCLE_COMMAND_SPECS,
  ...HEALTH_COMMAND_SPECS,
  ...WORKFLOW_COMMAND_SPECS,
  ...WORK_COMMAND_SPECS,
  ...EXECUTION_COMMAND_SPECS,
  ...INSIGHT_COMMAND_SPECS,
  ...MEMORY_COMMAND_SPECS,
  ...TOOL_OUTPUT_COMMAND_SPECS,
  ...INTERNAL_COMMAND_SPECS,
];
