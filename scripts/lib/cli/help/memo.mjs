function normalizeMemoHelpPath(argv = []) {
  const path = [];
  for (const raw of argv) {
    const token = String(raw || '').trim().toLowerCase();
    if (!token || token === '--' || token === '-h' || token === '--help' || token === 'help') {
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    path.push(token);
  }
  return path;
}

function getMemoStorageHelpText(path = []) {
  const subcommand = path[1] || '';

  switch (subcommand) {
    case 'status':
      return `Usage:
  node scripts/aios.mjs memo storage status

Show active memo storage status and supported storage backends.
`;
    case 'use':
      return `Usage:
  node scripts/aios.mjs memo storage use <split|file>

Switch active memo storage to split or file.
`;
    case 'rebuild':
      return `Usage:
  node scripts/aios.mjs memo storage rebuild

Run a full rebuild of derived memo query files without rewriting canonical memo records.
`;
    case 'doctor':
      return `Usage:
  node scripts/aios.mjs memo storage doctor

Check memo storage health and report repair guidance.
`;
    default:
      return `Usage:
  node scripts/aios.mjs memo storage <subcommand> [options]

Subcommands:
  status          Show active memo storage status
  use split       Switch active memo storage to split files
  use file        Switch active memo storage to append-only file
  rebuild         Run a full rebuild of derived query files
  doctor          Check memo storage health
`;
  }
}

export function getMemoHelpText(argv = []) {
  const path = normalizeMemoHelpPath(argv);
  if (path[0] === 'storage') {
    return getMemoStorageHelpText(path);
  }

  return `Usage:
  node scripts/aios.mjs memo <subcommand> [options]

Subcommands:
  add <text>                          Append memo event (supports #tag)
  add <text> --supersedes <id,...>    Append and retire the facts it replaces
  add <text> --valid-at <iso>         Append a fact that became true earlier
  add <text> --no-supersede-hint      Do not report likely earlier revisions
  pin show                            Print pinned memory
  pin set <text>                      Replace pinned memory
  pin add <text>                      Append to pinned memory
  persona init|show|path              Initialize/read global persona baseline
  persona set <text>                  Replace global persona baseline
  persona add <text>                  Append to global persona baseline
  user init|show|path                 Initialize/read global user profile memory
  user set <text>                     Replace global user profile memory
  user add <text>                     Append to global user profile memory
  search <query> [--limit N] [--semantic] [--as-of ISO] [--include-invalid]
                                      Search memos; superseded facts are hidden by default
  supersede [--threshold N] [--apply]
                                      Detect facts a later entry has replaced (dry run by default)
  recall [query] [--limit N] [--highlight-limit N] [--as-of ISO]
                                      Human-readable session recall digest
  gui [--port N] [--project name] [--no-open]
                                      Open project-local ContextDB memory genealogy graph
  storage                             Manage memo storage backend

Storage:
  node scripts/aios.mjs memo storage --help
`;
}
