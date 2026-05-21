import { parseArgs } from '../parse-args.mjs';

export function maybeUserArgvFromRaw(rawArgs = []) {
  const raw = [...rawArgs];
  if (raw.length >= 2 && /(?:^|[/\\])node(?:\.exe)?$/iu.test(String(raw[0] || ''))) {
    return raw.slice(2);
  }
  return raw;
}

export function getActionCommand(args) {
  return args[args.length - 1];
}

export function argvFromActionCommand(command) {
  const root = command?.parent || command;
  if (root?.rawArgs?.length) {
    return maybeUserArgvFromRaw(root.rawArgs);
  }
  return root?.args || command?.args || [];
}

export function registerPassthroughCommand(program, spec, dispatch) {
  const command = program
    .command(spec.name)
    .description(spec.description)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]');

  for (const alias of spec.aliases || []) {
    command.alias(alias);
  }

  for (const [flags, description] of spec.options || []) {
    command.option(flags, description);
  }

  command.action(async (...args) => {
    const actionCommand = getActionCommand(args);
    await dispatch(parseArgs(argvFromActionCommand(actionCommand)));
  });

  return command;
}
