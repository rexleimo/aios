// scripts/mcp-landing-evidence.mjs — w7：给每个 MCP 落点出一张可复跑的证据卡。
//
// 证据不是状态：它只回答四个可以客观核对的问题，答不上来就写「答不上来」：
//   ① 这个落点在声明表里能不能写（`mcp list` 的 writable/registered）；
//   ② 真装一条探针条目，`doctor` 能不能把它读回来并认定 `owned`；
//   ③ 卸掉之后配置文件是否**逐字节**回到安装前；
//   ④ 这一家的客户端在这台机器上到底装没装（没装就写 host-unsupported + 原文，不编原因）。
//
// 三条纪律：
//   · **不给读不到的事实编理由**。客户端没装 → `host-unsupported` + `binary not on PATH: <cmd>`；
//     写入被拒 → 原样抄 CLI 的 `reason`。ADR 0007/0008 的「未覆盖 ≠ 好」就落在这两行上。
//   · **每个落点跑完必须回到原状**。安装前存 sha256，卸载后再存一次；不相等就把差异写进卡片，
//     而不是「大概没问题」。探针条目名固定，万一上次泄漏，先清掉再装（并记为一步）。
//   · **默认预演**。不加 `--apply` 只打印将要碰的文件；真跑要显式声明，因为这一步会短暂写用户的真实配置
//     （每次写入都由写路径留下备份，卸载后按字节校验）。
//
// 用法：
//   node scripts/mcp-landing-evidence.mjs                 # 预演：打印会跑哪些落点、会碰哪些文件
//   node scripts/mcp-landing-evidence.mjs --apply         # 真跑并写证据卡
//   node scripts/mcp-landing-evidence.mjs --apply --only claude,codex
//   node scripts/mcp-landing-evidence.mjs --apply --json  # 机器可读汇总
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = process.env.AIOS_PROJECT_ROOT && path.isAbsolute(process.env.AIOS_PROJECT_ROOT)
  ? process.env.AIOS_PROJECT_ROOT
  : process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'evidence', '2026-11-05-mcp-landing');
const PROBE = 'aios-landing-probe';
export const EVIDENCE_SCHEMA = 'mcp.landing-evidence.v1';

/** 客户端 id → 可执行名（用于回答「这台机器上装了没装」）。 */
const CLIENT_BINARIES = Object.freeze({
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  opencode: 'opencode',
  hermes: 'hermes',
  grok: 'grok',
  qoder: 'qoder',
  workbuddy: 'workbuddy',
  zcode: 'zcode',
  pi: 'pi',
});

/**
 * 探针条目按落点形状给：同一份 `{command,args,type}` 对 pi/hermes/opencode 都会被白名单或形状要求拒掉。
 * 每条都**不含 env**：证据卡要能公开，凭据与端口值一概不进。
 */
const PROBE_ENTRIES = Object.freeze({
  pi: { command: 'node', args: ['/aios-landing-probe.js'], lifecycle: 'lazy' },
  hermes: { command: 'node', args: ['/aios-landing-probe.js'] },
  opencode: { type: 'local', command: ['node', '/aios-landing-probe.js'], enabled: true },
  default: { command: 'node', args: ['/aios-landing-probe.js'], type: 'stdio' },
});

export function probeEntryFor(clientId) {
  return { ...(PROBE_ENTRIES[clientId] || PROBE_ENTRIES.default) };
}

/** 不用 shell、不依赖 `which`：按 PATH/PATHEXT 找可执行文件名。 */
export function hasCommand(command, { env = process.env, fsImpl = fs } = {}) {
  const exts = process.platform === 'win32' ? String(env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      try {
        if (fsImpl.existsSync(path.join(dir, command + ext.toLowerCase())) || fsImpl.existsSync(path.join(dir, command + ext))) return true;
      } catch {
        // 不可读的 PATH 段直接跳过。
      }
    }
  }
  return false;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fileDigest(file) {
  try {
    return sha256(fs.readFileSync(file));
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return 'absent';
    throw error;
  }
}

async function aios(args, { timeoutMs = 120_000 } = {}) {
  const script = path.join(ROOT, 'scripts', 'aios.mjs');
  try {
    const { stdout } = await execFileAsync(process.execPath, [script, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, AIOS_PROJECT_ROOT: ROOT },
    });
    return { ok: true, text: stdout };
  } catch (error) {
    return {
      ok: false,
      exitCode: typeof error?.code === 'number' ? error.code : 1,
      text: String(error?.stdout ?? ''),
      stderr: String(error?.stderr ?? error?.message ?? ''),
    };
  }
}

function parseJson(result) {
  try {
    return JSON.parse(result.text);
  } catch {
    return null;
  }
}

function firstLine(text, limit = 300) {
  return String(text ?? '').trim().split(/\r?\n/u)[0].slice(0, limit);
}

async function listLandings() {
  const result = await aios(['mcp', 'list', '--json']);
  const payload = parseJson(result);
  if (!payload || payload.schema !== 'mcp.list.v1') {
    throw new Error(`aios mcp list --json returned no mcp.list.v1 payload: ${firstLine(result.stderr || result.text)}`);
  }
  return payload.landings || [];
}

/** 一个落点的完整证据。任何一步失败都保留原文，并保证不再留探针。 */
export async function captureLanding(landing, { apply, allowCreate = false, log = () => {} } = {}) {
  const clientId = String(landing.clientId || '');
  const scope = String(landing.scope || '');
  const binary = CLIENT_BINARIES[clientId] || '';
  const card = {
    schema: EVIDENCE_SCHEMA,
    clientId,
    scope,
    file: String(landing.file || ''),
    format: String(landing.format || ''),
    entryPath: String(landing.entryPath || ''),
    // 只认**显式**的 true：`mcp list` 对被读路径拒绝的落点（例如 pi 项目级）不给 writable 字段，
    // 用「不等于 false」会把拒绝读成可写——那正是 `mcp-targets` 那类 bug 的形状。
    writable: landing.writable === true,
    registered: landing.registered === true,
    fileExists: false,
    unverifiedFields: Array.isArray(landing.unverifiedFields) ? [...landing.unverifiedFields] : [],
    note: String(landing.note || ''),
    clientBinary: binary,
    clientInstalled: binary ? hasCommand(binary) : false,
    probe: { name: PROBE, entry: probeEntryFor(clientId) },
    status: 'unverified',
    reason: '',
    steps: [],
    capturedAt: new Date().toISOString(),
  };

  card.fileExists = fileDigest(card.file) !== 'absent';
  if (landing.status === 'rejected') {
    card.reason = `landing-not-writable: ${String(landing.reason || 'read gate refused this landing')}`;
    return card;
  }
  if (!card.writable) {
    card.reason = 'landing-not-writable (declaration says this scope is not a write target)';
    return card;
  }
  if (!card.clientInstalled) {
    card.status = 'host-unsupported';
    card.reason = `client binary not on PATH: ${binary || '(unknown)'}`;
    return card;
  }
  // 文件不存在时**不**为了取证去创建它：那会把「这台机器上本来没有这份配置」变成「有，而且是空的」。
  // 想强行创建需要显式 `--allow-create`，并且卡上会留下 createdFile 标记。
  if (!card.fileExists && !allowCreate) {
    card.reason = 'config file absent; probe skipped so the evidence run does not create client config files (pass --allow-create to override)';
    return card;
  }

  card.steps.push({ step: 'before-hash', value: fileDigest(card.file) });
  if (!apply) {
    card.status = 'planned';
    card.reason = 'dry-run: nothing was written';
    return card;
  }

  // 上一轮可能泄漏的探针：先按 doctor 判定清掉，避免 add 撞上 conflict（清理本身也是一步证据）。
  const pre = parseJson(await aios(['mcp', 'doctor', '--client', clientId, '--json']));
  const leaked = (pre?.landings || [])
    .filter((item) => item.scope === scope)
    .flatMap((item) => item.servers || [])
    .find((server) => server.name === PROBE);
  if (leaked) {
    const cleaned = await aios(['mcp', 'remove', PROBE, '--client', clientId, '--scope', scope, '--force', '--json']);
    card.steps.push({ step: 'cleanup-leaked-probe', status: parseJson(cleaned)?.status || 'unknown', raw: firstLine(cleaned.text || cleaned.stderr) });
  }

  // ① dry-run 必须真不写盘（w2 的门在真实落点上再验一次）。
  const dry = parseJson(await aios(['mcp', 'add', PROBE, '--client', clientId, '--scope', scope, '--entry', JSON.stringify(card.probe.entry), '--dry-run', '--json']));
  const dryHash = fileDigest(card.file);
  card.steps.push({ step: 'dry-run', status: dry?.status || 'unknown', reason: firstLine(dry?.message || dry?.reason || ''), wroteNothing: dryHash === card.steps[0].value });
  if (dryHash !== card.steps[0].value) {
    card.reason = 'dry-run wrote to the config file';
    return card;
  }

  // ② 真装。
  const added = parseJson(await aios(['mcp', 'add', PROBE, '--client', clientId, '--scope', scope, '--entry', JSON.stringify(card.probe.entry), '--json']));
  card.steps.push({ step: 'add', status: added?.status || 'unknown', reason: firstLine(added?.message || added?.reason || '') });
  if (added?.status !== 'installed') {
    card.reason = added?.reason || firstLine(added?.message || '') || 'add did not report installed';
    return card;
  }

  // ③ 读回：doctor 必须认它是 AIOS 自己写的。
  const back = parseJson(await aios(['mcp', 'doctor', '--client', clientId, '--json']));
  const readBack = (back?.landings || [])
    .filter((item) => item.scope === scope)
    .flatMap((item) => item.servers || [])
    .find((server) => server.name === PROBE);
  card.steps.push({
    step: 'read-back',
    status: readBack?.ownership || 'missing',
    fields: readBack?.fields || [],
    lastVerifiedAt: readBack?.lastVerifiedAt ?? null,
  });
  if (!readBack || readBack.ownership !== 'owned') {
    card.reason = `read-back ownership=${readBack?.ownership || 'missing'}`;
    await aios(['mcp', 'remove', PROBE, '--client', clientId, '--scope', scope, '--force', '--json']);
    return card;
  }

  // ④ 卸载 + 逐字节比对。
  const removed = parseJson(await aios(['mcp', 'remove', PROBE, '--client', clientId, '--scope', scope, '--json']));
  card.steps.push({ step: 'remove', status: removed?.status || 'unknown', reason: firstLine(removed?.message || removed?.reason || '') });
  const after = fileDigest(card.file);
  const byteIdentical = after === card.steps[0].value;
  card.steps.push({ step: 'after-hash', value: after, byteIdentical });

  if (removed?.status !== 'uninstalled') {
    card.reason = `remove status=${removed?.status || 'unknown'}`;
    return card;
  }
  if (!byteIdentical) {
    // 差异要写清楚是什么，不写「大概没问题」：目前唯一会被写路径新留下的东西是桶外根键。
    card.reason = 'config bytes differ after uninstall (see steps.before-hash / after-hash)';
    return card;
  }
  card.status = 'verified';
  card.reason = '';
  return card;
}

async function main(argv) {
  const flags = new Set(argv.filter((item) => item.startsWith('--')));
  const apply = flags.has('--apply');
  const jsonOut = flags.has('--json');
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 ? String(argv[onlyAt + 1] || '').split(',').map((item) => item.trim()).filter(Boolean) : [];
  const outDirAt = argv.indexOf('--out');
  const outDir = outDirAt >= 0 ? path.resolve(String(argv[outDirAt + 1] || '')) : OUT_DIR;

  const landings = await listLandings();
  const selected = landings.filter((landing) => only.length === 0 || only.includes(landing.clientId));
  if (selected.length === 0) {
    process.stderr.write('no landing matched\n');
    return 2;
  }

  if (!apply) {
    process.stdout.write(`plan: ${selected.length} landing(s) would be probed (no writes). Add --apply to execute.\n`);
    for (const landing of selected) {
      const binary = CLIENT_BINARIES[landing.clientId] || '';
      const installed = binary ? hasCommand(binary) : false;
      const writableState = landing.status === 'rejected' ? 'rejected' : landing.writable === true ? 'writable' : 'not-writable';
      const existsState = fileDigest(String(landing.file || '')) !== 'absent' ? 'exists' : 'absent';
      process.stdout.write(`  - ${landing.clientId}/${landing.scope} → ${landing.file} [${landing.format}, ${writableState}, ${existsState}, registered=${landing.registered === true}, client=${installed ? 'installed' : 'MISSING'}]
`);
    }
    return 0;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const cards = [];
  for (const landing of selected) {
    process.stdout.write(`… ${landing.clientId}/${landing.scope}\n`);
    const card = await captureLanding(landing, { apply, allowCreate: flags.has('--allow-create') });
    cards.push(card);
    const name = `${card.clientId}-${card.scope}.json`;
    fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(card, null, 2)}\n`, 'utf8');
    process.stdout.write(`  → ${card.status}${card.reason ? ` (${card.reason})` : ''}\n`);
  }

  const summary = {
    schema: 'mcp.landing-evidence-index.v1',
    capturedAt: new Date().toISOString(),
    outDir: path.relative(ROOT, outDir).split(path.sep).join('/'),
    counts: Object.fromEntries(['verified', 'unverified', 'host-unsupported'].map((status) => [status, cards.filter((card) => card.status === status).length])),
    cards: cards.map((card) => ({ clientId: card.clientId, scope: card.scope, status: card.status, reason: card.reason })),
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (jsonOut) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else process.stdout.write(`evidence: ${summary.counts.verified} verified / ${summary.counts.unverified} unverified / ${summary.counts['host-unsupported']} host-unsupported → ${summary.outDir}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1'))) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}