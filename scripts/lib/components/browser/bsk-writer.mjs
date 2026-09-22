/* 中文注释：BSK / BrowserSkill 模式的下发引导（release 代码，非 bsk 本体）。
   BSK 走真人会话：复用用户已登录的 Chrome + 浏览器扩展 + 本地 daemon，与 Playwright 互斥。
   本模块只产出"三步引导文案 + 工具集转发表 + version_skew 判定"这类纯数据，
   实际 CLI/扩展安装属 owner action（install.ps1 + Chrome 网上应用店扩展），release 不打包。 */
import { commandExists, captureCommand } from '../../platform/process.mjs';

// 三步引导：安装 CLI → 装扩展并连接 → 切换/运行真人会话。文案可被测试注入的 io 消费。
export const BSK_INSTALL_STEPS = [
  {
    stage: 'install',
    title: 'Step 1 · 安装 BSK CLI（仅本体）',
    command: 'powershell -ExecutionPolicy ByPass -File install.ps1 --browser bsk',
    note: '只装 CLI/daemon，不装浏览器扩展（扩展需手动从 Chrome 网上应用店安装）。',
  },
  {
    stage: 'connect',
    title: 'Step 2 · 装扩展并连接',
    command: 'Install BrowserSkill extension from Chrome Web Store → press "Connect"',
    note: '连通性基线：bsk status --json 须 version_skew:false（CLI/daemon/扩展三者同版）。',
  },
  {
    stage: 'run',
    title: 'Step 3 · 切换并运行真人会话',
    command: 'aios internal browser switch bsk',
    note: '切到 bsk 后，AIOS 把 browser_* 工具转发到 bsk CLI。',
  },
];

// browser_* 工具 → bsk CLI 转发表（thin-wrapper 的入口），与 Playwright 的 browser_* 同接口。
export const BSK_TOOL_MAP = [
  { browser: 'snapshot', bsk: 'snapshot', usage: 'bsk snapshot', description: '抓取当前页面快照（结构化 DOM 文本）。' },
  { browser: 'screenshot', bsk: 'screenshot', usage: 'bsk screenshot', description: '对当前页面截图。' },
  { browser: 'navigate', bsk: 'navigate', usage: 'bsk navigate <url>', description: '在当前窗口导航到 URL。' },
  { browser: 'connect_cdp', bsk: 'connect', usage: 'bsk connect', description: '连接已登录窗口（真人会话入口）。' },
  { browser: 'borrow', bsk: 'borrow', usage: 'bsk borrow', description: '临时接管窗口完成单步操作。' },
  { browser: 'request-help', bsk: 'request-help', usage: 'bsk request-help', description: '向真人发出请求帮助信号。' },
];

// 解析 `bsk status --json`：version_skew:false 且含浏览器条目即视为可用。纯函数，便于断言。
export function parseBskStatusJson(rawJson) {
  let data = null;
  try {
    data = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: 'invalid JSON', version_skew: null, browsers: [], processId: null };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'top-level value is not an object', version_skew: null, browsers: [], processId: null };
  }
  const browsers = Array.isArray(data.browsers)
    ? data.browsers.map((b) => (b && (b.name || b.id || b.title)) || 'unknown')
    : [];
  return {
    ok: data.version_skew === false,
    reason: data.version_skew === false ? null : `version_skew=${JSON.stringify(data.version_skew)}`,
    version_skew: data.version_skew,
    browsers,
    processId: data.processId ?? data.process_id ?? null,
  };
}

// 三步引导 + 工具集映射（纯字符串数组，便于断言内容与注入 io 消费）。
export function renderBskInstallGuide() {
  const lines = [];
  lines.push('');
  lines.push('Browser automation is set to BSK / BrowserSkill (human-in-the-loop).');
  lines.push('This reuses your logged-in Chrome via an extension + local daemon. It is mutually exclusive with Playwright.');
  lines.push('');
  lines.push('Three setup steps (owner actions, not packaged here):');
  for (const step of BSK_INSTALL_STEPS) {
    lines.push(`[${step.stage}] ${step.title}`);
    lines.push(`    cmd: ${step.command}`);
    lines.push(`    note: ${step.note}`);
    lines.push('');
  }
  lines.push('Tool map (browser_* → bsk CLI):');
  for (const entry of BSK_TOOL_MAP) {
    lines.push(`  ${entry.browser.padEnd(16)} → ${entry.usage.padEnd(30)} ${entry.description}`);
  }
  lines.push('');
  lines.push('Connectivity baseline before use: `bsk status --json` should report version_skew:false.');
  lines.push('');
  return lines;
}

export function printBskInstallGuide({ io = console } = {}) {
  for (const line of renderBskInstallGuide()) io.log(line);
}

// 注入式运行时，让 checkBskConnect 不直接绑定真实系统命令。
export function resolveBskRuntime(runtime = {}) {
  return {
    platform: String(runtime.platform || process.platform),
    commandExists: typeof runtime.commandExists === 'function' ? runtime.commandExists : commandExists,
    captureCommand: typeof runtime.captureCommand === 'function' ? runtime.captureCommand : captureCommand,
  };
}

// 校验 BSK 连接基线（version_skew:false）。仅当 bsk CLI 存在时尝试，缺失只告警不报错。
export async function checkBskConnect({ rootDir, io = console, dryRun = false, runtime = {} } = {}) {
  const bskRuntime = resolveBskRuntime(runtime);
  const line = (m) => io.log(m);

  if (!bskRuntime.commandExists('bsk')) {
    line('WARN bsk CLI not found on PATH (owner action: run install.ps1 --browser bsk); skipping connect baseline');
    return { checked: false, reason: 'bsk-cli-missing', ok: false };
  }

  if (dryRun) {
    line('[plan] browser doctor would run: bsk status --json');
    return { checked: false, reason: 'dry-run', ok: null };
  }

  const result = bskRuntime.captureCommand('bsk', ['status', '--json']);
  if (result.status !== 0) {
    line(`WARN bsk status failed (exit ${result.status ?? 'none'}); run 'aios internal browser switch bsk' after connecting`);
    return { checked: true, reason: 'command-failed', ok: false, status: result.status, stderr: result.stderr };
  }

  const parsed = parseBskStatusJson(result.stdout);
  if (!parsed.ok) {
    line(`WARN bsk not fully connected: ${parsed.reason} (CLI/daemon/extension must all match); try 'bsk connect'`);
    return { checked: true, ok: false, ...parsed, reason: 'version-skew' };
  }

  line(`OK   bsk connected (version_skew:false, browsers: ${parsed.browsers.join(', ') || 'none listed'})`);
  return { checked: true, ok: true, ...parsed };
}
