import { getRootHelpText } from './root.mjs';

import { getBasicCommandHelpText } from './commands/basic.mjs';
import { getWorkflowCommandHelpText } from './commands/workflow.mjs';
import { getMaintenanceCommandHelpText } from './commands/maintenance.mjs';

export function getCommandHelpText(command) {
  return getBasicCommandHelpText(command)
    || getWorkflowCommandHelpText(command)
    || getMaintenanceCommandHelpText(command)
    || getRootHelpText();
}
