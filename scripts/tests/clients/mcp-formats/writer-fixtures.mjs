// scripts/tests/clients/mcp-formats/writer-fixtures.mjs — MCP 写路径测试的共享 fixture（w2 建立，w5a 起两个测试文件共用）。
//
// 为什么单独成文件：`mcp-generic-writer.test.mjs` 与 `mcp-writer-capabilities.test.mjs` 要测同一批落点的
// 同一份「别人写的文件长什么样」。把 `makeFixture` 与探针条目抄第二份，standards 会把它记成副本文件，
// 更要紧的是「fixture 代表哪种真实形状」从此有了两个所有者——改一处忘另一处，两边都还是绿的。
// 这里只放数据与建目录的小工具，不放断言：断言留在各自的测试文件里。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROBE = 'aios-probe-server';
export const STDIO = Object.freeze({ command: 'node', args: ['/probe/server.js'], type: 'stdio' });
// 带 cwd 的那一家复用同一个探针条目：两个落点各自抄一份字面量时，standards 会把它们计成副本，
// 而更要紧的是「探针长什么样」这件事从此有了两个所有者——改一处忘另一处，测试仍然绿但测的不是同一件事。
export const STDIO_CWD = Object.freeze({ ...STDIO, cwd: '.' });

export const CASES = Object.freeze([
  {
    key: 'claude/home', clientId: 'claude', scope: 'home', file: '../.claude.json',
    original: `{
  "firstTimeOnboard": true,
  "mcpServers": {
    "theirs": { "command": "npx", "args": ["-y", "@other/server"] },
    "nested": {
      "command": "node",
      "args": ["/srv/a.js"],
      "env": { "A": "1" }
    }
  },
  "projects": { "E:/x": { "allowedTools": [] } }
}
`,
    entry: STDIO,
  },
  {
    key: 'claude/project', clientId: 'claude', scope: 'project', file: '.mcp.json',
    original: `{
  "mcpServers": {
    "theirs": {
      "command": "node",
      "args": ["/srv/theirs.js"],
      "cwd": "."
    }
  }
}
`,
    entry: STDIO_CWD,
  },
  {
    key: 'qoder/home', clientId: 'qoder', scope: 'home', file: 'settings.json',
    original: `{
  "editorMode": "nvim",
  "mcpServers": { "theirs": { "command": "node", "args": [] } }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', startupTimeoutSec: 10 },
  },
  {
    key: 'qoder/project', clientId: 'qoder', scope: 'project', file: '.qoder/settings.json',
    original: `{
  "$schema": "https://qoder.invalid/schema.json",
  "mcpServers": {
    "theirs": {
      "command": "node",
      "args": ["/srv/theirs.js"],
      "startupTimeoutSec": 30
    }
  }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', env: { FOO: 'bar' } },
  },
  {
    key: 'workbuddy/home', clientId: 'workbuddy', scope: 'home', file: 'mcp.json',
    original: `{
  "mcpServers": { "theirs": {"command":"node","args":[]} }
}
`,
    entry: STDIO,
  },
  {
    key: 'gemini/home', clientId: 'gemini', scope: 'home', file: 'settings.json',
    original: `{
  "mcpServers": {
    "theirs": {
      "command": "npx",
      "args": ["@other/mcp"],
      "timeout": 30000
    }
  },
  "telemetry": { "enabled": false }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', timeout: 15000 },
  },
  {
    key: 'gemini/project', clientId: 'gemini', scope: 'project', file: '.gemini/settings.json',
    original: `{
  "mcpServers": {
    "theirs": { "command": "node", "args": ["/srv/theirs.js"], "type": "stdio", "cwd": "." }
  }
}
`,
    entry: STDIO_CWD,
  },
  {
    key: 'opencode/home', clientId: 'opencode', scope: 'home', file: 'opencode.json',
    original: `{
  "$schema": "https://opencode.invalid/config.json",
  "mcp": {
    "theirs": { "type": "local", "command": ["node", "/srv/theirs.js"], "enabled": true }
  },
  "experimental": { "mcp_timeout": 10000 }
}
`,
    entry: { type: 'local', command: ['node', '/probe/server.js'], enabled: true },
  },
  {
    key: 'codex/home', clientId: 'codex', scope: 'home', file: 'config.toml',
    original: `model = "gpt-5"

[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]
type = "stdio"

[mcp_servers.theirs.env]
FOO = "bar"
`,
    entry: STDIO,
  },
  {
    key: 'codex/project', clientId: 'codex', scope: 'project', file: '.codex/config.toml',
    original: `[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js"]
approval_mode = "approve-all"
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', approval_mode: 'approve-all' },
  },
  {
    key: 'grok/home', clientId: 'grok', scope: 'home', file: 'config.toml',
    original: `model = "grok-1"
# 行注释必须原样回来
[mcp_servers.theirs]
command = "node"
enabled = false
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', enabled: true },
  },
  {
    key: 'grok/project', clientId: 'grok', scope: 'project', file: '.grok/config.toml',
    original: `[features]
hooks = true

[mcp_servers.theirs]
command = "node"
args = ["/srv/theirs.js", "--flag"]
enabled = true
`,
    entry: { command: 'node', args: ['/probe/server.js'], type: 'stdio', startup_timeout_sec: 10 },
  },
  {
    key: 'hermes/home', clientId: 'hermes', scope: 'home', file: 'config.yaml',
    original: `model: hermes-1

mcp_servers:
  # 手工维护的条目，注释必须原样回来
  theirs:
    command: node
    args:
      - /srv/theirs.js
    env:
      FOO: bar
  other: { command: node, args: [] }
`,
    entry: { command: 'node', args: ['/probe/server.js'], env: { FOO: 'bar' } },
  },
  {
    key: 'hermes/project', clientId: 'hermes', scope: 'project', file: '.mcp.json',
    original: `{
  "mcpServers": {
    "theirs": { "command": "node", "args": ["/srv/theirs.js"] }
  }
}
`,
    entry: STDIO,
  },
  {
    key: 'zcode/home', clientId: 'zcode', scope: 'home', file: 'cli/config.json',
    original: `{
  "hooks": { "onStart": [] },
  "mcp": {
    "version": 2,
    "servers": {
      "theirs": { "transport": "stdio", "command": "node", "args": ["/t.js"], "env": {} }
    }
  }
}
`,
    // 与 zcode/project 同一条 schema 白名单（`type` + 可选 `timeoutMs`）：`transport` 是用户自有条目
    // 在磁盘上的样子，zcode 自己的 CLI 日志把 `transport` 记为 Unrecognized key。落点表白名单原先把
    // 这两种事实混成一条（home 只能写 transport），于是 `aios mcp add --client zcode --scope home`
    // 写不进真实形状——2026-11-05 实测、w5b 开工前修。
    entry: { type: 'stdio', command: 'node', args: ['/probe/server.js'], env: { FOO: 'bar' }, timeoutMs: 8000 },
  },
  {
    key: 'zcode/project', clientId: 'zcode', scope: 'project', file: '.zcode/config.json',
    original: `{
  "profile": "default",
  "mcp": {
    "servers": {
      "theirs": { "type": "stdio", "command": "node", "args": [], "env": {}, "timeoutMs": 5000 }
    }
  }
}
`,
    entry: { type: 'stdio', command: 'node', args: ['/probe/server.js'], env: {}, timeoutMs: 8000 },
  },
  {
    key: 'pi/home', clientId: 'pi', scope: 'home', file: 'agent/mcp.json',
    original: `{
  "mcpServers": {
    "code-review-graph": { "command": "uvx", "args": ["code-review-graph", "serve"], "lifecycle": "lazy" }
  }
}
`,
    entry: { command: 'node', args: ['/probe/server.js'], lifecycle: 'lazy' },
  },
]);


export function makeFixture(c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rex-mcp-writer-'));
  const filePath = path.join(dir, path.basename(c.file));
  fs.writeFileSync(filePath, c.original, 'utf8');
  return { dir, filePath, backupDir: path.join(dir, 'bak') };
}
