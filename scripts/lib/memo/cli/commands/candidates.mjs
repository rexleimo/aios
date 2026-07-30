import { getActiveMemoStorage, loadMemoStorageApi } from '../storage-api.mjs';
import { usageError } from '../shared.mjs';

function parseArgs(secondary, rest = []) {
  const tokens = [secondary, ...rest].filter((token) => token !== undefined);
  const action = String(tokens.shift() || '').trim().toLowerCase();
  let candidateId = '';
  let reason = '';
  let json = false;
  let includeText = false;
  let status = '';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = String(tokens[index] || '');
    if (token === '--json') {
      json = true;
    } else if (token === '--include-text') {
      includeText = true;
    } else if (token === '--status') {
      status = String(tokens[index + 1] || '').trim();
      index += 1;
    } else if (token === '--reason') {
      const parts = [];
      index += 1;
      while (index < tokens.length && !String(tokens[index]).startsWith('--')) {
        parts.push(String(tokens[index]));
        index += 1;
      }
      index -= 1;
      reason = parts.join(' ').trim();
    } else if (!token.startsWith('--') && !candidateId) {
      candidateId = token;
    }
  }
  return { action, candidateId, reason, json, includeText, status };
}

function printJson(io, value) {
  io.log(JSON.stringify(value, null, 2));
}

export async function handleMemoCandidateCommand({
  secondary,
  rest,
  workspaceRoot,
  activeSpace,
  io,
  runtimeIdentity = null,
  env = process.env,
}) {
  const args = parseArgs(secondary, rest);
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
  if (args.action === 'list') {
    const candidates = await storageApi.listMemoryCandidates({
      workspaceRoot,
      storage,
      space: activeSpace,
      status: args.status,
      includeText: args.includeText,
      runtimeIdentity,
      env,
    });
    if (args.json) return printJson(io, candidates);
    if (candidates.length === 0) {
      io.log('(none)');
      return;
    }
    for (const candidate of candidates) {
      io.log(`${candidate.status}\t${candidate.sourceType}\t${candidate.candidateId}\t${candidate.sourceHash.slice(0, 12)}`);
    }
    return;
  }

  if (args.action === 'inspect') {
    if (!args.candidateId) throw usageError('memo candidate inspect requires candidate id');
    const candidate = await storageApi.inspectMemoryCandidate({
      workspaceRoot,
      storage,
      space: activeSpace,
      candidateId: args.candidateId,
      runtimeIdentity,
      env,
    });
    if (!candidate) throw usageError(`candidate not found: ${args.candidateId}`);
    if (args.json) return printJson(io, candidate);
    io.log(`${candidate.candidateId} [${candidate.status}]`);
    io.log(candidate.text);
    return;
  }

  const actionApi = {
    promote: storageApi.promoteMemoryCandidate,
    reject: storageApi.rejectMemoryCandidate,
    expire: storageApi.expireMemoryCandidate,
  }[args.action];
  if (!actionApi) {
    throw usageError('Usage: memo candidate <list|inspect|promote|reject|expire> ...');
  }
  if (!args.candidateId) throw usageError(`memo candidate ${args.action} requires candidate id`);
  const result = await actionApi({
    workspaceRoot,
    storage,
    space: activeSpace,
    candidateId: args.candidateId,
    reason: args.reason,
    runtimeIdentity,
    env,
  });
  if (args.json) {
    printJson(io, result);
  } else {
    io.log(`${result.receipt.decision} ${args.action} ${args.candidateId}`);
    io.log(`  Receipt: ${result.receipt.receiptRef}`);
    io.log(`  Reason: ${result.receipt.reasonCode}`);
  }
  if (!result.ok) {
    const error = new Error(`candidate ${args.action} denied: ${result.receipt.reasonCode}`);
    error.code = 'AIOS_MEMO_CANDIDATE_DENIED';
    error.receipt = result.receipt;
    throw error;
  }
}
