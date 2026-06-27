#!/usr/bin/env node
// scripts/privacy-guard.mjs — 薄壳入口，逻辑在 scripts/lib/privacy-guard/
import {
  commandInit,
  commandStatus,
  commandSet,
  commandRedact,
} from './lib/privacy-guard/commands.mjs';

function usage() {
  process.stdout.write(`Usage:
  scripts/privacy-guard.mjs <command> [options]

Commands:
  init                     Initialize config at ~/.rexcil/privacy-guard.json
  status                   Print effective config
  set                      Update config values
  read --file <path>       Strict read path (redact or block)
  redact --file <path>     Print redacted file content to stdout

Common options:
  --path <config-path>     Override config path

set options:
  --enabled <true|false>
  --enable | --disable
  --mode <regex|ollama|hybrid>
  --ollama-enabled <true|false>
  --model <name>
  --endpoint <url>
  --timeout-ms <int>
  --enforce <true|false>            Require redaction for sensitive files
  --block-when-disabled <true|false> Block raw output when guard is disabled
  --detect-content <true|false>     Detect sensitivity by content as well as path

redact options:
  --file <path>            File to process
  --mode <regex|ollama|hybrid>
  --force                  Redact even when config is disabled or path is not sensitive

Environment:
  REXCIL_HOME              Override ~/.rexcil root
  REXCIL_PRIVACY_CONFIG    Override full config file path
`);
}

function parseOptions(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      out.help = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'force' || key === 'enable' || key === 'disable') {
        out[key] = true;
        continue;
      }
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }
      out[key] = value;
      i += 1;
      continue;
    }
    out._.push(arg);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || '';

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    usage();
    process.exit(0);
  }

  const options = parseOptions(argv.slice(1));
  if (options.help) {
    usage();
    process.exit(0);
  }

  switch (command) {
    case 'init':
      commandInit(options);
      return;
    case 'status':
      commandStatus(options);
      return;
    case 'set':
      commandSet(options);
      return;
    case 'read':
      await commandRedact(options);
      return;
    case 'redact':
      await commandRedact(options);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[error] ${message}\n`);
  process.exit(1);
});
