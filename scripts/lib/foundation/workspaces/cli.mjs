// scripts/lib/foundation/workspaces/cli.mjs — `aios workspaces` 的实现（本机工程清单）。
//
// 只读：这个动词不改任何用户配置，也不删登记项（`listWorkspaces` 对消失的路径只标 `missing`，
// 删除是人的决定）。它存在的理由是 Console 需要一个有单一所有者、可 JSON 化的工作区来源，
// 而不是在界面里去猜有哪些工程。
import { discoverWorkspaces, resolveWorkspaceKey, scanRoots } from './discover.mjs';

const USAGE = `Usage:
  aios workspaces list [--json]
  aios workspaces resolve <key> [--json]

What it reports:
  The machine's AIOS workspaces = registry entries (~/.aios/workspaces/<key>.json) merged with
  filesystem evidence (a child directory that carries its own .aios/memo/file/events.jsonl).
  "key" is the registry's own digest of the resolved path; it is the only handle clients may pass back.
  Paths are never accepted as input, and a key that is not in the current list is refused.
`;

export async function runWorkspacesCommand(parsed, { rootDir, stdout = process.stdout } = {}) {
  const raw = parsed?.options?.args ?? [];
  // 中文注释：和 memory/memo 同形时 `--json` 会留在位置参数里，所以这里自己拆。
  // 不把旗标当位置参数误读成 key——那会让 `resolve --json` 报一个看不懂的 not-listed。
  const json = raw.includes('--json');
  const positional = raw.filter((entry) => !String(entry).startsWith('-'));
  const [sub, ...args] = positional;

  if (sub === 'list') {
    const items = discoverWorkspaces({ rootDir });
    if (json) {
      stdout.write(`${JSON.stringify({ schema: 'aios.workspaces.v1', scanRoots: scanRoots({ rootDir }), workspaces: items }, null, 2)}\n`);
      return;
    }
    if (items.length === 0) {
      stdout.write('本机没有登记的 AIOS 工作区，也没有找到带记忆仓的工程目录。\n');
      stdout.write(`扫描范围：${scanRoots({ rootDir }).join(', ') || '(无)'}\n`);
      return;
    }
    stdout.write(`本机 AIOS 工作区（${items.length} 个；扫描范围：${scanRoots({ rootDir }).join(', ')}）\n`);
    for (const item of items) {
      const marks = [item.current ? '当前' : '', item.missing ? '路径已消失' : '', item.stale ? '超期' : '']
        .filter(Boolean)
        .join('/');
      stdout.write(
        `  ${item.key}  ${item.name.padEnd(24)} memo ${String(item.memos).padStart(4)} 会话 ${String(item.sessions).padStart(3)}  最后活动 ${item.lastActivityAt ?? '无记录'}${marks ? `  [${marks}]` : ''}\n`,
      );
    }
    return;
  }

  if (sub === 'resolve') {
    const key = String(args[0] ?? '');
    const result = resolveWorkspaceKey(key, { rootDir });
    if (json) {
      stdout.write(`${JSON.stringify({ schema: 'aios.workspaces.resolve.v1', ...result }, null, 2)}\n`);
    } else if (result.ok) {
      stdout.write(`${result.workspace.key}  ${result.workspace.path}\n`);
    } else {
      stdout.write(`无法解析工作区标识：${result.detail}\n`);
    }
    // 解析失败要让调用方拿到非零码：这是「按不了的路径」，不是「空结果」。
    if (!result.ok) process.exitCode = 1;
    return;
  }

  stdout.write(USAGE);
  if (sub) process.exitCode = 1;
}
