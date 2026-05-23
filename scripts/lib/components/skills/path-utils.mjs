import fs from 'node:fs';
import path from 'node:path';

// 纯函数：统一路径真实值，Windows 下使用小写比较。
export function normalizePathForCompare(inputPath) {
  let output = path.resolve(inputPath);
  try {
    output = fs.realpathSync(output);
  } catch {
    // Keep resolved path when the target does not exist yet.
  }
  return process.platform === 'win32' ? output.toLowerCase() : output;
}

// 纯函数：复用路径归一化逻辑，兼容符号链接和 legacy link。
export function arePathsEqual(leftPath, rightPath) {
  return normalizePathForCompare(leftPath) === normalizePathForCompare(rightPath);
}
