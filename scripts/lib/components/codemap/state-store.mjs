import fs from 'node:fs';
import path from 'node:path';

import { stateFilePath } from './paths.mjs';

export { stateFilePath } from './paths.mjs';

export function readState(projectRoot) {
  const filePath = stateFilePath(projectRoot);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeState(projectRoot, state) {
  const filePath = stateFilePath(projectRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function removeState(projectRoot) {
  const filePath = stateFilePath(projectRoot);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // 删除状态是清理动作，失败不应阻塞卸载流程。
  }
}
