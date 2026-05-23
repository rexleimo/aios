import fs from 'node:fs';
import path from 'node:path';

import { CRG_DATA_DIR, CRG_MCP_ALIAS } from './constants.mjs';
import { resolveClientHomes } from './environment.mjs';
import { removeCrgFromInstructionFiles } from './instructions.mjs';
import { collectCodemapMcpTargets, removeCrgFromClientTarget } from './mcp-targets.mjs';
import { removeOpencodePlugin } from './opencode-plugin.mjs';
import { normalizeClientList } from './selection.mjs';
import { removeState, stateFilePath } from './state-store.mjs';

export async function uninstallCodemap({ rootDir, projectRoot, dryRun = false, io = console, clientHomes = null, client = 'all' } = {}) {
  const homes = resolveClientHomes(clientHomes);
  const projectRootPath = path.resolve(projectRoot || process.cwd());

  io.log('[1/5] Removing MCP config from clients');
  for (const target of collectCodemapMcpTargets(projectRootPath, homes, client)) {
    if (dryRun) {
      if (fs.existsSync(target.path)) {
        io.log(`PLAN codemap would remove ${CRG_MCP_ALIAS} from ${target.path}`);
      }
    } else if (fs.existsSync(target.path)) {
      removeCrgFromClientTarget(target, { io });
    }
  }

  io.log('[2/5] Removing opencode plugin');
  if (normalizeClientList(client).includes('opencode')) {
    const pluginResult = removeOpencodePlugin(homes.opencode, { dryRun, io });
    io.log(`OK   opencode plugin ${pluginResult.status}: ${pluginResult.path || homes.opencode}`);
  } else {
    io.log('SKIP opencode client not selected');
  }

  io.log('[3/5] Removing CRG instruction sections');
  if (dryRun) {
    io.log('PLAN codemap would remove CRG sections from client instruction files');
  } else {
    removeCrgFromInstructionFiles(projectRootPath, { io, client });
  }

  io.log('[4/5] Removing state file');
  if (dryRun) {
    io.log(`PLAN codemap would remove state file ${stateFilePath(projectRootPath)}`);
  } else {
    removeState(projectRootPath);
    io.log('OK   codemap state removed');
  }

  io.log('[5/5] Preserving graph data');
  const crgDataDir = path.join(projectRootPath, CRG_DATA_DIR);
  io.log(fs.existsSync(crgDataDir)
    ? `OK   ${dryRun ? 'would preserve' : 'preserved'} ${crgDataDir} (user data)`
    : 'OK   graph data directory not present');

  io.log('Codemap uninstall complete.');
  return { removed: true, dryRun };
}
