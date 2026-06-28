#!/usr/bin/env node
// scripts/privacy-guard.mjs — 薄壳入口，逻辑在 scripts/lib/privacy-guard/
import {
  commandInit,
  commandStatus,
  commandSet,
  commandRedact,
} from './lib/privacy-guard/commands.mjs';
import { createCliParser } from '../src/shared/cli-parser.mjs';

const cli = createCliParser({
  name: 'privacy-guard',
  description: 'Privacy guard config tool',
  subcommands: [
    {
      name: 'init',
      description: 'Initialize config at ~/.rexcil/privacy-guard.json',
      options: [
        ['--path <config-path>', 'Override config path'],
      ],
    },
    {
      name: 'status',
      description: 'Print effective config',
      options: [
        ['--path <config-path>', 'Override config path'],
      ],
    },
    {
      name: 'set',
      description: 'Update config values',
      options: [
        ['--path <config-path>', 'Override config path'],
        ['--enabled <true|false>', 'Enable or disable privacy guard'],
        ['--enable', 'Enable privacy guard'],
        ['--disable', 'Disable privacy guard'],
        ['--mode <mode>', 'Privacy mode: regex, ollama, or hybrid'],
        ['--ollama-enabled <true|false>', 'Enable ollama mode'],
        ['--model <name>', 'Ollama model name'],
        ['--endpoint <url>', 'Ollama endpoint URL'],
        ['--timeout-ms <int>', 'Ollama request timeout (ms)'],
        ['--enforce <true|false>', 'Require redaction for sensitive files'],
        ['--block-when-disabled <true|false>', 'Block raw output when guard is disabled'],
        ['--detect-content <true|false>', 'Detect sensitivity by content as well as path'],
      ],
    },
    {
      name: 'read',
      description: 'Strict read path (redact or block)',
      options: [
        ['--file <path>', 'File to process'],
        ['--mode <mode>', 'Privacy mode: regex, ollama, hybrid'],
        ['--force', 'Redact even when config is disabled or path is not sensitive'],
        ['--path <config-path>', 'Override config path'],
      ],
    },
    {
      name: 'redact',
      description: 'Print redacted file content to stdout',
      options: [
        ['--file <path>', 'File to process'],
        ['--mode <mode>', 'Privacy mode: regex, ollama, hybrid'],
        ['--force', 'Redact even when config is disabled or path is not sensitive'],
        ['--path <config-path>', 'Override config path'],
      ],
    },
  ],
  helpText: [
    'Environment:',
    '  REXCIL_HOME              Override ~/.rexcil root',
    '  REXCIL_PRIVACY_CONFIG    Override full config file path',
  ].join('\n'),
});

const parsed = cli.parse(process.argv.slice(2));

if (parsed.help) {
  console.log(cli.program.helpInformation());
  process.exit(0);
}

const command = parsed.command;
if (!command) {
  console.error('Error: missing command');
  console.log(cli.program.helpInformation());
  process.exit(1);
}

// Commander 把 boolean flag 转化为 camelCase 属性；下游期望 camelCase，直接透传
const options = { ...parsed.flags, _: parsed.args };
options.help = undefined; // help 由 Commander 自带，不传给业务

switch (command) {
  case 'init':
    commandInit(options);
    break;
  case 'status':
    commandStatus(options);
    break;
  case 'set':
    commandSet(options);
    break;
  case 'read':
    await commandRedact(options);
    break;
  case 'redact':
    await commandRedact(options);
    break;
  default:
    console.error(`Error: unknown command '${command}'`);
    process.exit(1);
}
