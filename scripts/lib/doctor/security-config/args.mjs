export function usage() {
  return `Usage:
  scripts/doctor-security-config.sh [--workspace <path>] [--global] [--strict]

Options:
  --workspace <path>   Scan this workspace root (default: git root or cwd)
  --global             Also scan small allowlisted global config files
  --strict             Exit non-zero when findings exist
  -h, --help           Show this help
`;
}

export function parseArgs(argv) {
  const out = {
    workspace: '',
    scanGlobal: false,
    strict: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') {
      out.workspace = String(argv[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (arg === '--global') {
      out.scanGlobal = true;
      continue;
    }
    if (arg === '--strict') {
      out.strict = true;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      out.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return out;
}