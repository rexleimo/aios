// scripts/lib/integrations/skill.mjs — 第三方技能的钉住拉取、哈希校验与目录落地。
// 为什么不用 `npx skills add`：那要求在执行时信任第三方 CLI 与网页指令；
// 这里只信任注册表里钉死的 commit + sha256，拉取后逐字节校验，
// 校验不过就整体失败，绝不把未验证的内容写进任何客户端技能根。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeFileAtomic } from '../fs/atomic-write.mjs';
import { stripAiosFrontmatter } from '../skills/frontmatter.mjs';
import { resolveIntegrationLedgerDir } from './ledger.mjs';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 20000;

export class IntegrationSkillError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegrationSkillError';
  }
}

export function resolveVendorStageDir(vendor, options = {}) {
  return path.join(resolveIntegrationLedgerDir(options), 'vendor', String(vendor));
}

export function skillCatalogDir(rootDir, integration) {
  return path.join(rootDir, 'skill-sources', integration.skill.installName);
}

async function githubJson(url, { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'aios-integration-installer',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new IntegrationSkillError(`github ${response.status} for ${url}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof IntegrationSkillError) throw error;
    const reason = error?.name === 'AbortError' ? 'timeout' : (error instanceof Error ? error.message : String(error));
    throw new IntegrationSkillError(`github request failed (${reason}) for ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

// 在钉死的 commit 上枚举技能目录下的全部 blob，并逐个取回内容。
// 走 GitHub REST（api.github.com）而不是 raw.githubusercontent：后者在受限网络下常被拦。
export async function fetchSkillFiles({ integration, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new IntegrationSkillError('no fetch implementation available');
  const { repo, commit, skillPath } = integration.skill;
  const prefix = `${skillPath}/`;

  const tree = await githubJson(`${GITHUB_API}/repos/${repo}/git/trees/${commit}?recursive=1`, { fetchImpl, timeoutMs });
  if (tree?.truncated) {
    throw new IntegrationSkillError(`github tree for ${repo}@${commit} was truncated; refusing an incomplete skill`);
  }
  const blobs = (Array.isArray(tree?.tree) ? tree.tree : [])
    .filter((node) => node?.type === 'blob' && typeof node.path === 'string' && node.path.startsWith(prefix));
  if (blobs.length === 0) {
    throw new IntegrationSkillError(`no files found under ${prefix} at ${repo}@${commit}`);
  }

  const files = {};
  for (const node of blobs) {
    const blob = await githubJson(`${GITHUB_API}/repos/${repo}/git/blobs/${node.sha}`, { fetchImpl, timeoutMs });
    if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') {
      throw new IntegrationSkillError(`unexpected blob encoding for ${node.path}`);
    }
    files[node.path.slice(prefix.length)] = Buffer.from(blob.content.replace(/\s+/gu, ''), 'base64');
  }
  return { files, commit };
}

// 纯函数：对文本内容做行尾归一化后再哈希。
// 理由：同一个 commit 在 Windows（core.autocrlf）下检出会得到 CRLF 副本，
// 字节级哈希会把一个合法安装误判成被篡改。技能文件是文本，
// 行尾差异不构成篡改；内容差异仍会被检出。
function contentDigest(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  return createHash('sha256').update(Buffer.from(text.replace(/\r\n/gu, '\n'), 'utf8')).digest('hex');
}

// 纯函数：校验钉住的入口文件哈希。任何内容不一致都是硬失败。
export function verifySkillFiles({ files, skill }) {
  const entry = files?.[skill.entryFile];
  if (!entry) {
    throw new IntegrationSkillError(`pinned entry file ${skill.entryFile} missing from the fetched skill tree`);
  }
  const sha256 = contentDigest(entry);
  if (sha256 !== skill.sha256) {
    throw new IntegrationSkillError(
      `sha256 mismatch for ${skill.installName}/${skill.entryFile}: expected ${skill.sha256}, got ${sha256}`,
    );
  }
  return { sha256, bytes: entry.length, fileCount: Object.keys(files).length };
}

export function readStagedSkillFiles(stageDir) {
  if (!fs.existsSync(stageDir)) return {};
  const files = {};
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile()) files[rel] = fs.readFileSync(abs);
    }
  };
  walk(stageDir, '');
  return files;
}

// 把已校验的文件写入 ~/.aios/integrations/vendor/<vendor>/，作为可复用的本地缓存。
export async function stageSkillFiles({ vendor, files, stageDir, options = {} } = {}) {
  const target = stageDir || resolveVendorStageDir(vendor, options);
  fs.rmSync(target, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const destination = path.join(target, ...rel.split('/'));
    await writeFileAtomic(destination, content);
  }
  return target;
}

// 纯函数：判断目录里现有内容是否与校验过的文件一致（用于幂等复用）。
export function stagedFilesMatch(files, existing) {
  const a = Object.keys(files).sort();
  const b = Object.keys(existing).sort();
  if (a.length !== b.length || a.some((key, index) => key !== b[index])) return false;
  return a.every((key) => contentDigest(files[key]) === contentDigest(existing[key]));
}

export function vendorSkillState(vendor, options = {}) {
  const stageDir = resolveVendorStageDir(vendor, options);
  return { stageDir, exists: fs.existsSync(stageDir) };
}

// 纯函数：算出目录里入口文件当前的哈希（用于判断 catalog 副本是否仍被 AIOS 拥有）。
export function hashCatalogEntry(rootDir, integration) {
  const entryPath = path.join(skillCatalogDir(rootDir, integration), integration.skill.entryFile);
  try {
    return contentDigest(fs.readFileSync(entryPath));
  } catch {
    return '';
  }
}

// 纯函数：剥掉 AIOS 自己注入的 frontmatter 后再哈希。
// 这是归属判定的真正依据：它复现上游被钉住的文件内容，
// 所以用户改过正文会被检出，而纯 AIOS 层的 frontmatter 变动不会误判。
export function hashCatalogUpstreamBody(rootDir, integration) {
  const entryPath = path.join(skillCatalogDir(rootDir, integration), integration.skill.entryFile);
  try {
    const text = fs.readFileSync(entryPath, 'utf8');
    return contentDigest(stripAiosFrontmatter(text));
  } catch {
    return '';
  }
}

// 纯函数：给第三方技能补上 AIOS 内部 frontmatter。
// 这些键由 stripAiosFrontmatter 在写进客户端技能树前剥掉，
// 所以客户端只会看到 name/description/license 这些它认识的字段；
// AIOS catalog 侧靠它们决定分发到哪些客户端与作用域。
const AIOS_INJECTED_KEYS = Object.freeze([
  'installCatalogName', 'clients', 'scopes', 'defaultInstall', 'tags', 'repoTargets',
]);

export function buildCatalogSkillContent(content, { integration, clients = [] } = {}) {
  const text = String(content);
  const header = [
    '---',
    `installCatalogName: ${integration.skill.installName}`,
    `clients: [${clients.join(', ')}]`,
    'scopes: [global, project]',
    'defaultInstall:',
    '  global: true',
    '  project: false',
    `tags: [aios, integration, ${integration.vendor}]`,
    `repoTargets: [${[...clients, 'agents'].join(', ')}]`,
  ];

  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return `${header.join('\n')}\n---\n\n${text}`;
  }
  const lines = text.split('\n');
  const closeIdx = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closeIdx === -1) {
    return `${header.join('\n')}\n---\n\n${text}`;
  }
  const kept = [];
  for (let index = 1; index < closeIdx; index += 1) {
    const line = lines[index];
    const key = line.includes(':') ? line.slice(0, line.indexOf(':')).trim() : '';
    if (AIOS_INJECTED_KEYS.includes(key)) {
      // 连带跳掉该键的嵌套子行（如 defaultInstall 下的 global/project）
      while (index + 1 < closeIdx && /^\s+\S/u.test(lines[index + 1])) index += 1;
      continue;
    }
    kept.push(line);
  }
  return [...header, ...kept, ...lines.slice(closeIdx)].join('\n');
}

// 把校验过的技能落到 AIOS catalog（skill-sources/），之后由现成的
// syncGeneratedSkills / installContextDbSkills 分发到全部客户端。
// 绝不覆盖一个不是 AIOS 托管的同名目录。

export async function installSkillToCatalog({ rootDir, integration, stageDir, ledger, clients = [], options = {} } = {}) {
  const target = skillCatalogDir(rootDir, integration);
  const existingFiles = readStagedSkillFiles(target);
  const stagedFiles = readStagedSkillFiles(stageDir);
  const owned = isOwnedCatalogCopy({ rootDir, integration, ledger });

  if (Object.keys(existingFiles).length > 0 && !owned) {
    return {
      status: 'refused',
      reason: 'unmanaged-existing-catalog-directory',
      catalogPath: target,
    };
  }
  const nextFiles = { ...stagedFiles };
  const upstreamEntry = stagedFiles[integration.skill.entryFile];
  if (!upstreamEntry) {
    return { status: 'refused', reason: `staged skill is missing ${integration.skill.entryFile}`, catalogPath: target };
  }
  nextFiles[integration.skill.entryFile] = Buffer.from(
    buildCatalogSkillContent(upstreamEntry.toString('utf8'), { integration, clients }),
    'utf8',
  );
  const catalogSha256 = contentDigest(nextFiles[integration.skill.entryFile]);

  if (owned && stagedFilesMatch(nextFiles, existingFiles)) {
    return { status: 'reused', catalogPath: target, fileCount: Object.keys(nextFiles).length, catalogSha256 };
  }

  for (const [rel, content] of Object.entries(nextFiles)) {
    await writeFileAtomic(path.join(target, ...rel.split('/')), content);
  }
  return { status: 'installed', catalogPath: target, fileCount: Object.keys(nextFiles).length, catalogSha256 };
}

function isOwnedCatalogCopy({ rootDir, integration, ledger }) {
  if (!ledger?.skill) return false;
  if (ledger.skill.installName !== integration.skill.installName) return false;
  const pinned = ledger.skill.sha256 || '';
  if (!pinned) return false;
  const current = hashCatalogUpstreamBody(rootDir, integration);
  return Boolean(current) && current === pinned;
}

// 只在 catalog 副本仍与账本哈希一致时移除；用户改过的副本一律保留并报告 conflict。
export function removeSkillFromCatalog({ rootDir, integration, ledger } = {}) {
  const target = skillCatalogDir(rootDir, integration);
  if (!fs.existsSync(target)) return { status: 'not-found' };
  if (!isOwnedCatalogCopy({ rootDir, integration, ledger })) {
    return { status: 'conflict', reason: 'catalog-copy-modified-or-unowned', catalogPath: target };
  }
  fs.rmSync(target, { recursive: true, force: true });
  return { status: 'removed', catalogPath: target };
}

export function defaultVendorStageOptions({ env = process.env, homeDir = os.homedir() } = {}) {
  return { env, homeDir };
}
