import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWorkspace, parseArgs, usage } from './args.js';
import { runContextDbCommand } from './handlers.js';

const AIOS_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { command, options } = parseArgs(argv);

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  try {
    await runContextDbCommand({
      command,
      options,
      workspaceRoot: getWorkspace(options),
      defaultAiosRootDir: AIOS_ROOT_DIR,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unknown command:')) {
      throw new Error(`${error.message}\n\n${usage()}`);
    }
    throw error;
  }
}
