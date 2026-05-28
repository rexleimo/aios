import path from 'node:path';

import { parseArgs, usage } from './args.mjs';
import {
  detectGitRoot,
  listAgentRoleFiles,
  listFilesIfPresent,
  listFilesUnder,
  pickGlobalConfigFiles,
  readTextSafe,
  relativeTo,
} from './files.mjs';
import {
  findRiskyHookPatterns,
  findSecretPatterns,
  redactFinding,
  scanJsonBroadAllowlists,
} from './patterns.mjs';

function collectWorkspaceFiles(workspace) {
  const files = [];
  files.push(...listFilesIfPresent(workspace, [
    'CLAUDE.md',
    'config/browser-profiles.json',
    '.claude/settings.json',
    '.claude/mcp.json',
    '.claude/hooks.json',
    '.claude/CLAUDE.md',
    '.codex/config.toml',
    '.gemini/settings.json',
    '.opencode/settings.json',
  ]));
  files.push(...listAgentRoleFiles(workspace, '.claude/agents', ['.md']));
  files.push(...listAgentRoleFiles(workspace, '.codex/agents', ['.toml', '.md']));
  files.push(...listFilesUnder(workspace, 'agent-sources', (name) => name.toLowerCase().endsWith('.json')));
  return files;
}

function scanFile({ filePath, workspace, stdout }) {
  const text = readTextSafe(filePath, 1024 * 1024);
  if (text == null) {
    stdout.write(`[warn] unreadable or too large: ${filePath}\n`);
    return 1;
  }

  let findings = 0;
  for (const id of findSecretPatterns(text)) {
    stdout.write(`[warn] secret pattern ${redactFinding(id)} in ${relativeTo(workspace, filePath)}\n`);
    findings += 1;
  }

  for (const id of findRiskyHookPatterns(text)) {
    stdout.write(`[warn] risky hook pattern ${redactFinding(id)} in ${relativeTo(workspace, filePath)}\n`);
    findings += 1;
  }

  if (filePath.toLowerCase().endsWith('.json')) {
    const res = scanJsonBroadAllowlists(text);
    if (res.ok && res.paths.length > 0) {
      stdout.write(`[warn] broad allowlist "*" in ${relativeTo(workspace, filePath)} at: ${res.paths.join(', ')}\n`);
      findings += 1;
    } else if (!res.ok) {
      stdout.write(`[warn] invalid json: ${relativeTo(workspace, filePath)}\n`);
      findings += 1;
    }
  }

  return findings;
}

export function runSecurityConfigDoctor({ argv = [], cwd = process.cwd(), env = process.env, stdout = process.stdout } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    stdout.write(usage());
    return 0;
  }

  const workspace = path.resolve(args.workspace || detectGitRoot(cwd) || cwd);
  const homeDir = env.HOME || '';
  stdout.write('Security Config Doctor\n');
  stdout.write('----------------------\n');
  stdout.write(`Workspace: ${workspace}\n`);

  const files = collectWorkspaceFiles(workspace);
  if (args.scanGlobal) {
    if (homeDir) {
      files.push(...pickGlobalConfigFiles(homeDir, env));
      stdout.write('[info] global scan enabled (allowlisted files only)\n');
    } else {
      stdout.write('[warn] HOME is not set; skipping global scan\n');
    }
  }

  const uniq = [...new Set(files)].sort();
  if (uniq.length === 0) {
    stdout.write('[info] no known config files found to scan\n');
    return 0;
  }

  let findings = 0;
  for (const filePath of uniq) {
    findings += scanFile({ filePath, workspace, stdout });
  }

  stdout.write(`[summary] warn=${findings}\n`);
  return args.strict && findings > 0 ? 1 : 0;
}
