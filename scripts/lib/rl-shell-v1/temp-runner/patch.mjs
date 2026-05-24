import { readFile, writeFile } from 'node:fs/promises';

import { normalizePatchDiff } from '../action-protocol.mjs';
import { resolveWorkspacePath } from './workspace.mjs';

export function parsePatchOperations(diffText) {
  const lines = normalizePatchDiff(diffText).split('\n');
  if (lines[0] !== '*** Begin Patch') {
    throw new Error('Patch must start with *** Begin Patch');
  }
  const operations = [];
  let index = 1;

  while (index < lines.length) {
    const line = lines[index];
    if (line === '*** End Patch') {
      break;
    }
    if (line.startsWith('*** Update File: ')) {
      const filePath = line.slice('*** Update File: '.length).trim();
      index += 1;
      const removed = [];
      const added = [];
      while (index < lines.length) {
        const patchLine = lines[index];
        if (patchLine === '*** End Patch' || patchLine.startsWith('*** Update File: ')) {
          break;
        }
        if (patchLine === '@@' || patchLine.startsWith('@@ ')) {
          index += 1;
          continue;
        }
        if (patchLine.startsWith('-')) {
          removed.push(patchLine.slice(1));
        } else if (patchLine.startsWith('+')) {
          added.push(patchLine.slice(1));
        } else if (patchLine.startsWith(' ')) {
          const context = patchLine.slice(1);
          removed.push(context);
          added.push(context);
        }
        index += 1;
      }
      operations.push({
        filePath,
        removedText: removed.join('\n'),
        addedText: added.join('\n'),
      });
      continue;
    }
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }
    throw new Error(`Unsupported patch line: ${line}`);
  }

  if (operations.length === 0) {
    throw new Error('Patch must contain at least one update');
  }
  return operations;
}

export async function applyPatch(workspace, diffText) {
  const operations = parsePatchOperations(diffText);
  const filesTouched = [];

  for (const operation of operations) {
    const targetPath = resolveWorkspacePath(workspace, operation.filePath);
    const original = await readFile(targetPath, 'utf8');
    if (!original.includes(operation.removedText)) {
      throw new Error(`Patch hunk did not match file contents for ${operation.filePath}`);
    }
    const next = original.replace(operation.removedText, operation.addedText);
    await writeFile(targetPath, next, 'utf8');
    filesTouched.push(operation.filePath);
  }

  return filesTouched;
}
