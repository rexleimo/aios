import fs from 'node:fs';
import path from 'node:path';

import { CRG_MCP_ALIAS } from '../constants.mjs';
import { backupFilePath } from '../paths.mjs';
import { buildCrgMcpServerEntry, isCrgServeEntry } from './entries.mjs';

// 纯函数：转义 TOML 字符串，避免 Windows 反斜杠和引号破坏配置。
export function escapeTomlString(value) {
  return String(value || '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

export function parseTomlArrayStrings(raw = '') {
  const values = [];
  const regex = /"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(raw || '').matchAll(regex)) {
    values.push(match[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\'));
  }
  return values;
}

export function parseCodexMcpServersToml(raw = '') {
  const servers = {};
  let currentName = '';

  for (const line of String(raw || '').split(/\r?\n/u)) {
    const sectionMatch = /^\s*\[mcp_servers\.([^\]]+)\]\s*$/u.exec(line);
    if (sectionMatch) {
      currentName = sectionMatch[1].trim().replace(/^"(.+)"$/u, '$1');
      if (currentName) {
        servers[currentName] = {};
      }
      continue;
    }

    if (!currentName) continue;
    const commandMatch = /^\s*command\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (commandMatch) {
      servers[currentName].command = commandMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const cwdMatch = /^\s*cwd\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (cwdMatch) {
      servers[currentName].cwd = cwdMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const typeMatch = /^\s*type\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (typeMatch) {
      servers[currentName].type = typeMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const argsMatch = /^\s*args\s*=\s*(\[[^\]]*\])\s*$/u.exec(line);
    if (argsMatch) {
      servers[currentName].args = parseTomlArrayStrings(argsMatch[1]);
    }
  }

  return servers;
}

export function formatCodexMcpServerToml(clientKey, projectRoot) {
  const desired = buildCrgMcpServerEntry(clientKey);
  const args = desired.args.map((arg) => `"${escapeTomlString(arg)}"`).join(', ');
  const lines = [
    `[mcp_servers.${CRG_MCP_ALIAS}]`,
    `command = "${escapeTomlString(desired.command)}"`,
    `args = [${args}]`,
  ];
  if (projectRoot) {
    lines.push(`cwd = "${escapeTomlString(projectRoot)}"`);
  }
  lines.push(`type = "${escapeTomlString(desired.type)}"`);
  return lines.join('\n');
}

function codexSectionPattern() {
  return new RegExp(
    `(^|\\n)\\[mcp_servers\\.${CRG_MCP_ALIAS.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\][\\s\\S]*?(?=\\n\\[|$)`,
    'u'
  );
}

export function upsertCodexMcpToml(filePath, projectRoot, { dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const sectionPattern = codexSectionPattern();
  const desiredSection = formatCodexMcpServerToml('codex', projectRoot);
  const nextRaw = sectionPattern.test(raw)
    ? raw.replace(sectionPattern, (match, prefix) => `${prefix}${desiredSection}`)
    : `${raw.replace(/\s*$/u, '')}${raw.trim() ? '\n\n' : ''}${desiredSection}\n`;

  const normalizedNextRaw = nextRaw.endsWith('\n') ? nextRaw : `${nextRaw}\n`;
  if (exists && raw === normalizedNextRaw) {
    return { status: 'unchanged' };
  }
  if (dryRun) {
    return { status: 'planned' };
  }
  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, normalizedNextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

export function removeCrgFromCodexToml(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const sectionPattern = codexSectionPattern();
    if (!sectionPattern.test(raw)) return;
    let nextRaw = raw.replace(sectionPattern, '$1');
    nextRaw = nextRaw.replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '\n');
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, nextRaw, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function inspectCodexToml(raw) {
  const servers = parseCodexMcpServersToml(raw);
  const entry = servers[CRG_MCP_ALIAS];
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}