/* 中文注释：memo 解析保留透传语义——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';

const MEMO_CLI = new Command()
  .name('memo')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]');

export function parseMemoArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help') || rest.includes('help');

  try {
    const parsed = MEMO_CLI.parse(rest, { from: 'user' });

    // 提取 -- 后的透传参数
    const doubleDashIdx = rest.indexOf('--');
    let passthrough;
    let workspaceRoot = '';
    if (doubleDashIdx !== -1) {
      passthrough = rest.slice(doubleDashIdx + 1);
    } else {
      // Commander 把 positional args 放进 parsed.args，过滤掉 help 标记
      passthrough = (parsed.args || []).filter(a => !['-h', '--help', 'help'].includes(a));
    }

    const filtered = [];
    for (let index = 0; index < passthrough.length; index += 1) {
      const value = String(passthrough[index] || '');
      if (value === '--workspace') {
        workspaceRoot = String(passthrough[index + 1] || '').trim();
        if (!workspaceRoot) throw new Error('memo --workspace requires a path');
        index += 1;
        continue;
      }
      if (value.startsWith('--workspace=')) {
        workspaceRoot = value.slice('--workspace='.length).trim();
        if (!workspaceRoot) throw new Error('memo --workspace requires a path');
        continue;
      }
      filtered.push(passthrough[index]);
    }

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'memo',
      options: { argv: filtered, workspaceRoot },
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'memo',
      options: { argv: [] },
    };
  }
}
