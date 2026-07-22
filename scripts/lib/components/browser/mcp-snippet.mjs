/* 中文注释：手动配置片段只负责展示给用户复制的 MCP block，不参与迁移写文件。 */
import { PRIMARY_BROWSER_ALIAS } from './constants.mjs';
import { resolveShellCommand } from './runtime-paths.mjs';

export function printSnippet(io, launcherPath, cdpUrl) {
  const shellCmd = resolveShellCommand();
  const isWin = process.platform === 'win32';
  const argsStr = isWin
    ? `"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "${launcherPath}"`
    : `"${launcherPath}"`;
  io.log('');
  io.log('Done. Browser MCP config was auto-updated where possible.');
  io.log('Use this MCP server block only if a client needs a manual refresh:');
  io.log(`- If \`${PRIMARY_BROWSER_ALIAS}\` already exists, replace its block in-place (do not delete the alias name).`);
  io.log('');
  io.log('{');
  io.log('  "mcpServers": {');
  io.log(`    "${PRIMARY_BROWSER_ALIAS}": {`);
  io.log('      "type": "stdio",');
  io.log(`      "command": "${shellCmd}",`);
  io.log(`      "args": [${argsStr}],`);
  io.log('      "env": {');
  io.log(`        "BROWSER_USE_CDP_URL": "${cdpUrl}"`);
  io.log('      }');
  io.log('    }');
  io.log('  }');
  io.log('}');
}
