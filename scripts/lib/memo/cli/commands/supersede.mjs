import { Command } from 'commander';
import { DEFAULT_SUPERSEDE_THRESHOLD, proposeSupersedes } from '../../storage/temporal.mjs';
import { usageError } from '../shared.mjs';
import { getActiveMemoStorage, loadMemoStorageApi } from '../storage-api.mjs';

// A proposal is scanned against the whole space, so the read limit has to be
// well above the list default — a stale fact 200 entries back is exactly the
// kind this command exists to retire.
const SCAN_LIMIT = 5000;

const MEMO_SUPERSEDE_CLI = new Command()
  .name('memo-supersede')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[keywords...]')
  .option('--threshold <n>', 'Similarity required to treat two facts as revisions of each other')
  .option('--apply', 'Write the proposed supersede entries instead of only printing them');

function parseSupersedeFlags(argv) {
  let parsed;
  try {
    parsed = MEMO_SUPERSEDE_CLI.parse(argv, { from: 'user' });
  } catch {
    return { threshold: DEFAULT_SUPERSEDE_THRESHOLD, apply: false };
  }
  const flags = parsed.opts();
  let threshold = DEFAULT_SUPERSEDE_THRESHOLD;
  if (flags.threshold !== undefined) {
    const value = Number.parseFloat(String(flags.threshold));
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      throw usageError('--threshold must be a number greater than 0 and at most 1');
    }
    threshold = value;
  }
  return { threshold, apply: flags.apply === true };
}

function describeProposal(proposal) {
  const lines = [`keep  ${proposal.keep.eventId}  ${proposal.keep.text}`];
  for (const target of proposal.supersedes) {
    lines.push(`  retire ${target.eventId}  (${target.similarity.toFixed(2)})  ${target.text}`);
  }
  return lines.join('\n');
}

export async function handleMemoSupersedeCommand({ argv, workspaceRoot, activeSpace, io }) {
  const { threshold, apply } = parseSupersedeFlags(argv.slice(1));
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  const events = await storageApi.listMemoEvents(workspaceRoot, {
    storage,
    space: activeSpace,
    limit: SCAN_LIMIT,
  });

  const proposals = proposeSupersedes(events, { threshold });
  if (proposals.length === 0) {
    io.log('No superseded facts detected.');
    return true;
  }

  for (const proposal of proposals) {
    io.log(describeProposal(proposal));
  }

  if (!apply) {
    io.log('');
    io.log(`${proposals.length} proposal(s). Re-run with --apply to write them.`);
    return true;
  }

  // Memo storage is append-only, so applying a proposal re-asserts the winning
  // text as a new event that retires every revision it replaces — including the
  // winner's own earlier copy, so exactly one live fact remains.
  for (const proposal of proposals) {
    await storageApi.appendMemoEvent({
      workspaceRoot,
      storage,
      space: activeSpace,
      text: proposal.keep.text,
      supersedes: [proposal.keep.eventId, ...proposal.supersedes.map((target) => target.eventId)],
    });
  }
  io.log('');
  io.log(`Applied ${proposals.length} supersede entr${proposals.length === 1 ? 'y' : 'ies'}.`);
  return true;
}
