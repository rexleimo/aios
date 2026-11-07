#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCwdOutsideRootDir } from './lib/foundation/platform/aios-runtime-root.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const mcpServerDir = path.join(rootDir, 'mcp-server');
const projectNodeRunner = path.join(mcpServerDir, 'scripts', 'with-project-node.mjs');
const distEntry = path.join(mcpServerDir, 'dist', 'index.js');
const requiredDistEntries = [
  distEntry,
  path.join(mcpServerDir, 'dist', 'browser', 'index.js'),
  path.join(mcpServerDir, 'dist', 'browser', 'launcher.js'),
  path.join(mcpServerDir, 'dist', 'browser', 'profiles.js'),
  path.join(mcpServerDir, 'dist', 'browser', 'health.js'),
];
const sourceEntry = path.join(mcpServerDir, 'src', 'index.ts');
const tsxEntry = path.join(mcpServerDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function fail(message) {
  console.error(`[aios-browser] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(projectNodeRunner)) {
  fail(`project Node runner missing: ${projectNodeRunner}`);
}

let target;
let targetArgs = [];
if (requiredDistEntries.every((entry) => fs.existsSync(entry))) {
  target = distEntry;
} else if (fs.existsSync(sourceEntry) && fs.existsSync(tsxEntry)) {
  target = tsxEntry;
  targetArgs = [sourceEntry];
} else {
  fail(
    `browser MCP entry is unavailable. Build a complete ${path.join(mcpServerDir, 'dist')} tree or install mcp-server dependencies so ${tsxEntry} exists.`,
  );
}

// 中文注释：子进程的 CWD 不能落在安装树里。Windows 上「目录改名」只被一种持有者拦住：
// 某个进程的 CWD 在该目录子树内（实测：Chrome 的 profile 句柄、tsx 的 fs.watch 目录通知句柄、
// SQLite 的文件句柄都不拦；只有 CWD 拦）。旧写法 `cwd: rootDir` 把这个长期运行的 MCP 服务器
// 永久钉在 `~/.rexcil/aios` 里，于是每一次浏览器会话都在给自己下一次 `aios update` 上锁。
// 判定收到 resolveCwdOutsideRootDir 一个 owner：继承调用方（客户端）的 CWD = 项目根，
// 只有当它本就在安装树里（例如有人从安装目录手动起它）才退回用户主目录。
//
// 本进程自己也是持有者：它是 spawnSync 阻塞式长驻进程，整场 MCP 会话都活着，所以必须先把自己
// 择出去，再给子进程选同一个树外目录——否则只修了下游，启动器本身依旧把安装树锁着（实测就是这样）。
const { cwd: safeCwd, relocated } = resolveCwdOutsideRootDir({ cwd: process.cwd(), rootDir });
if (relocated) {
  process.chdir(safeCwd);
}
const childCwd = safeCwd;

const result = spawnSync(process.execPath, [projectNodeRunner, target, ...targetArgs], {
  windowsHide: true,
  cwd: childCwd,
  env: {
    ...process.env,
    // 中文注释：把自己择出来的工作目录显式交给下一跳。with-project-node 默认用 PROJECT_ROOT
    // （npm 脚本需要它解相对路径），但它是长驻链的一环——不递这个值，子进程就会回到安装树里
    // 把目录锁住（实测旧行为：PID 18644/5720 的 cwd 就卡在 …\aios\mcp-server）。
    AIOS_MCP_CHILD_CWD: childCwd,
  },
  stdio: 'inherit',
});

if (result.error) {
  fail(result.error.message || String(result.error));
}

process.exit(result.status ?? 1);
