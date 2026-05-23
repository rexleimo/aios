import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import defaultRegistry from '../specs/model-registry.json' with { type: 'json' };
import { clonePlain, normalizeId } from './shared.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const REGISTRY_PATH = path.join(ROOT_DIR, 'memory', 'specs', 'model-registry.json');

let registryCache = null;
let registryCacheMtime = 0;

// 纯函数：返回内置 registry 的副本，调用方无法修改 import 进来的 JSON 常量。
export function defaultModelRegistry() {
  return clonePlain(defaultRegistry);
}

// 副作用函数：按 mtime 缓存磁盘 registry；缺失时退回内置 registry。
export async function loadRegistry() {
  try {
    const stat = await fs.stat(REGISTRY_PATH);
    if (registryCache && stat.mtimeMs === registryCacheMtime) {
      return registryCache;
    }
    const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
    registryCache = JSON.parse(raw);
    registryCacheMtime = stat.mtimeMs;
    return registryCache;
  } catch (error) {
    if (registryCache) return registryCache;
    if (error?.code === 'ENOENT') {
      return defaultModelRegistry();
    }
    throw error;
  }
}

// 纯函数：读取当前 activeModel 标识，隐藏 registry 字段缺失处理。
export function getActiveModel(registry) {
  return normalizeId(registry?.activeModel) || '';
}
