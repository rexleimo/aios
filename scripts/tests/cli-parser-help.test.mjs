import assert from 'node:assert/strict';
import test from 'node:test';

import { createCliParser } from '../../src/shared/cli-parser.mjs';

/**
 * `createCliParser` backs twelve CLIs. It had no direct coverage until A10, when
 * `help <command>` and `<command> --help` were found to drop the command's own
 * options: `parse()` returned only `help: true`, so every caller printed
 * `program.helpInformation()`, which renders each subcommand's options as the
 * placeholder `[options]` — making per-command flags undiscoverable from --help.
 *
 * `parse()` now reports `helpCommand`, and `helpText(name)` renders that command.
 */

function makeParser() {
  return createCliParser({
    name: 'demo',
    description: 'demo cli',
    subcommands: [
      {
        name: 'train',
        description: 'Run training',
        options: [
          ['--config <path>', 'Config path'],
          ['--resume', 'Resume mode'],
        ],
      },
      { name: 'status', description: 'Show status', options: [] },
    ],
  });
}

test('creates a parser exposing parse, program, and helpText', () => {
  const cli = makeParser();
  assert.equal(typeof cli.parse, 'function');
  assert.equal(typeof cli.helpText, 'function');
  assert.ok(cli.program);
});

test('bare invocation and -h request top-level help', () => {
  for (const argv of [[], ['-h'], ['--help'], ['help']]) {
    const parsed = makeParser().parse(argv);
    assert.equal(parsed.help, true, `argv=${JSON.stringify(argv)}`);
    assert.equal(parsed.helpCommand, '', `argv=${JSON.stringify(argv)} must not name a command`);
  }
});

test('a subcommand --help names that subcommand', () => {
  for (const argv of [['train', '--help'], ['train', '-h']]) {
    const parsed = makeParser().parse(argv);
    assert.equal(parsed.help, true);
    assert.equal(parsed.helpCommand, 'train');
  }
});

test('help <subcommand> names that subcommand', () => {
  const parsed = makeParser().parse(['help', 'train']);
  assert.equal(parsed.help, true);
  assert.equal(parsed.helpCommand, 'train');
});

test('help for an unknown subcommand falls back to top level without throwing', () => {
  const parsed = makeParser().parse(['help', 'nope']);
  assert.equal(parsed.help, true);
  assert.equal(parsed.helpCommand, '');
});

test('helpText renders the named command options, and top level otherwise', () => {
  const cli = makeParser();

  const commandHelp = cli.helpText('train');
  assert.match(commandHelp, /Usage: demo train/u);
  assert.match(commandHelp, /Options:/u);
  assert.match(commandHelp, /--config <path>/u);
  assert.match(commandHelp, /--resume/u, 'A10: per-command flags must be discoverable');

  const topLevel = cli.helpText();
  assert.match(topLevel, /Usage: demo \[command\]/u);
  assert.doesNotMatch(topLevel, /--resume/u, 'top level lists commands, not their flags');

  // Unknown names degrade to top-level help rather than throwing.
  assert.equal(cli.helpText('nope'), topLevel);
  assert.equal(cli.helpText(''), topLevel);
});

test('a subcommand still parses its own flags and positional args', () => {
  const parsed = makeParser().parse(['train', '--config', 'a.json', '--resume', 'extra']);
  assert.equal(parsed.help, false);
  assert.equal(parsed.command, 'train');
  assert.equal(parsed.flags.config, 'a.json');
  assert.equal(parsed.flags.resume, true);
  // `args` is the raw positional list (the subcommand name is not stripped); that is
  // pre-existing behaviour, asserted here only so A10 cannot quietly change it.
  assert.ok(parsed.args.includes('extra'), `expected 'extra' in ${JSON.stringify(parsed.args)}`);
});
