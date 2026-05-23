import fs from 'node:fs';
import path from 'node:path';

// 纯函数：把文件内容转成稳定摘要；调用方只比较相等性，不依赖具体算法。
export function hashFileBuffer(buffer) {
  return buffer.toString('base64');
}

export function snapshotDirectory(absDir, baseDir = absDir, output = new Map(), ignoreNames = new Set()) {
  if (!fs.existsSync(absDir)) {
    return output;
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) {
      continue;
    }

    const absPath = path.join(absDir, entry.name);
    const relPath = path.relative(baseDir, absPath) || '.';
    if (entry.isDirectory()) {
      output.set(relPath, { type: 'dir' });
      snapshotDirectory(absPath, baseDir, output, ignoreNames);
      continue;
    }

    output.set(relPath, { type: 'file', hash: hashFileBuffer(fs.readFileSync(absPath)) });
  }

  return output;
}

// 纯函数：逐项比较目录快照，避免调用方关心 Map 的内部结构。
export function snapshotsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const [relPath, value] of left.entries()) {
    const other = right.get(relPath);
    if (!other) {
      return false;
    }
    if (value.type !== other.type) {
      return false;
    }
    if (value.hash !== other.hash) {
      return false;
    }
  }

  return true;
}
