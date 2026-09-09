import { IMPORT_FORMATS, importExternalMemories } from './import-external.mjs';

const USAGE = `Usage: node scripts/aios.mjs import --format <${IMPORT_FORMATS.join('|')}> --file <path> [--dry-run] [--json]

Import external assistant-memory files into the governed memo candidate
queue. Imported facts are reviewable with 'memo candidate list' and land in
the active memo space (default) tagged #import-<format>. Nothing is promoted
automatically.`;

export async function runImportCommand({ args = [], rootDir, stdout = process.stdout }) {
  let format = '';
  let file = '';
  let dryRun = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    const value = () => {
      const next = args[index + 1];
      if (next === undefined) throw new Error(`${arg} requires a value\n${USAGE}`);
      index += 1;
      return next;
    };
    if (arg === '--format') format = String(value()).trim().toLowerCase();
    else if (arg === '--file') file = String(value());
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--json') json = true;
    else if (arg === '-h' || arg === '--help') {
      stdout.write(`${USAGE}\n`);
      return;
    } else throw new Error(`unknown option: ${arg}\n${USAGE}`);
  }

  const result = await importExternalMemories(rootDir, { format, file, dryRun });
  if (json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const action = result.dryRun ? 'would import' : 'imported';
  stdout.write(`${action} ${result.imported} fact(s) from ${result.file} as ${result.format} candidate(s), skipped ${result.skipped} duplicate(s)\n`);
  if (!result.dryRun) {
    stdout.write('Review with: node scripts/aios.mjs memo candidate list\n');
  }
}
