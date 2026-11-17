import fs from 'node:fs';
import { atomicTempPath } from './atomic-write.mjs';

export function readFileSnapshot(filePath) {
  try { return fs.readFileSync(filePath); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Checks cover asynchronous preparation, not OS-level CAS against external writers.
export async function writeFileChecked(filePath, content, { original, checkRevision = () => true }) {
  const expected = original === null ? null : Buffer.from(original);
  const temp = atomicTempPath(filePath);
  let collision = false;
  let renamed = false;
  try {
    try {
      await fs.promises.writeFile(temp, content, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      collision = error.code === 'EEXIST';
      throw error;
    }
    const current = readFileSnapshot(filePath);
    const matches = current === null ? expected === null : expected !== null && current.equals(expected);
    if (!matches || !checkRevision()) return false;
    // No await between the final byte/revision check and the rename.
    fs.renameSync(temp, filePath);
    renamed = true;
    return true;
  } finally {
    // A renamed temp is no longer ours to clean up, and commit must not fail afterward.
    if (!collision && !renamed) await fs.promises.rm(temp, { force: true });
  }
}
