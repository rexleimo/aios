// scripts/lib/clients/mcp/cli.mjs — `aios mcp` 的命令面（w4）。
//
// 这一层只做三件事：把 CLI 参数变成引擎调用、把引擎判定投影成机器可读的输出、定退出码。
// 判定全在 `landing-schema.mjs` / `ledger.mjs` / `install-policy.mjs`，这里**一条规则都不重复**
// （ADR 0001：一个语义只有一个所有者；CLI 里出现第二份判断，就一定会漂移）。
//
// 隐私是结构性的：本层从不输出条目字段的值，只输出**键名**、指纹与判定。
// `env`/`headers` 这类可能含凭据的东西连值都不进 stdout；有测试拿哨兵值钉住这点。
import os from 'node:os';
import path from 'node:path';

import { getClientHomes } from '../../foundation/platform/paths.mjs';
import { MCP_LANDING_OVERRIDES, findLandingDrift, listLandingClients, resolveLanding } from './landing-schema.mjs';
import { installServer, uninstallServer } from './install-policy.mjs';
import { classifyMcpOwnership, fingerprintMcpEntry, ledgerKeyFor, readMcpLedger, resolveMcpLedgerDir } from './ledger.mjs';
import { landingFile, readServers } from './server-writer.mjs';

export const MCP_LIST_SCHEMA = 'mcp.list.v1';
export const MCP_ACTION_SCHEMA = 'mcp.action.v1';

/** 成功语义才退 0。拒绝、冲突、未接、未找到一律非 0——不给「打印了就算成功」。 */
const SUCCESS = new Set(['installed', 'restored', 'uninstalled', 'adopted', 'unchanged', 'planned', 'verified', 'ok']);

/**
 * 本层认识的动词。参数层（`parse-args/platform/mcp.mjs`）有一份同样的名单——两处名单由
 * `mcp-cli-verbs.test.mjs` 的对照断言钉住，谁漂了谁红，跟 `integration.mjs` 一样不新增跨层依赖。
 */
const READ_VERBS = new Set(['list', 'doctor']);
const WRITE_VERBS = new Set(['add', 'adopt', 'remove', 'enable', 'disable']);
const ALL_VERBS = Object.freeze([...WRITE_VERBS, ...READ_VERBS]);
export { READ_VERBS as MCP_READ_VERBS, WRITE_VERBS as MCP_WRITE_VERBS };

function landingScopes(clientId) {
  return Object.keys(MCP_LANDING_OVERRIDES[clientId] || {});
}

function selectedClients(client) {
  const all = listLandingClients();
  if (!client || client === 'all') return all;
  if (!all.includes(client)) throw new Error(`unknown MCP client: ${client}`);
  return [client];
}

function selectedScopes(clientId, scope) {
  const all = landingScopes(clientId);
  if (!scope || scope === 'all') return all;
  if (!all.includes(scope)) throw new Error(`unknown MCP landing: ${clientId}/${scope}`);
  return [scope];
}

function resolveOrError(clientId, scope, targets) {
  try {
    return { landing: resolveLanding(clientId, scope, { targets }) };
  } catch (error) {
    return { error: error.message };
  }
}

/** 只输出键名与指纹：值一律不出门。归属判定复用引擎的 `classifyMcpOwnership`，不在这里重算规则。 */
function projectServer(name, entry, record) {
  const verdict = classifyMcpOwnership({ actual: entry, ledgerEntry: record });
  return {
    name,
    fields: Object.keys(entry || {}).sort(),
    envKeys: Object.keys(entry?.env || {}).sort(),
    fingerprint: fingerprintMcpEntry(entry),
    ownership: verdict.status,
    origin: record?.origin || '',
    reason: verdict.reason || '',
    bucketCreated: record?.bucketCreated === true,
    lastVerifiedAt: record?.lastVerifiedAt || null,
  };
}

async function projectLanding({ clientId, scope, homes, projectRoot, ledgerDir, targets, fileOverride = '' }) {
  const resolved = resolveOrError(clientId, scope, targets);
  if (resolved.error) return { clientId, scope, status: 'error', reason: resolved.error, servers: [] };
  const landing = resolved.landing;
  let filePath;
  try {
    filePath = fileOverride || landingFile(landing, { clientHome: homes[clientId] || '', projectRoot });
  } catch (error) {
    return { clientId, scope, status: 'error', reason: error.message, servers: [] };
  }
  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') {
    return { clientId, scope, file: filePath, format: landing.format, status: read.status, reason: read.reason || '', servers: [] };
  }
  const ledger = await readMcpLedger(clientId, { ledgerDir });
  const records = ledger.entries || {};
  const servers = Object.entries(read.entries || {})
    .map(([name, entry]) => projectServer(name, entry, records[ledgerKeyFor(scope, name)]))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    clientId,
    scope,
    file: filePath,
    format: landing.format,
    entryPath: landing.entryPath,
    writable: landing.writable,
    registered: landing.registered,
    unverifiedFields: landing.unverifiedFields,
    note: landing.note,
    status: read.status === 'ok' ? 'ok' : 'absent',
    ledgerCorrupt: ledger.corrupt || '',
    servers,
  };
}

/** 列出每个落点的真实状态。控制台的统一对象表（w6）读的就是这个结构。 */
export async function listMcpState({ client = 'all', scope = 'all', homeDir = os.homedir(), env = process.env, projectRoot = process.cwd(), ledgerDir = '', file = '', targets } = {}) {
  const homes = getClientHomes(env, homeDir);
  // `--file` 只在「选中了一个落点」时才成立：铺满全表时一个文件路径对 18 个落点没有意义，
  // 静默忽略会让人以为读的是那个文件。
  const single = Boolean(file) && client !== 'all' && scope !== 'all';
  const landings = [];
  for (const clientId of selectedClients(client)) {
    for (const one of selectedScopes(clientId, scope)) {
      landings.push(await projectLanding({ clientId, scope: one, homes, projectRoot, ledgerDir, targets, fileOverride: single ? file : '' }));
    }
  }
  const counts = { landings: landings.length, errors: 0, owned: 0, external: 0, keptDiffers: 0, adopted: 0, conflict: 0, servers: 0 };
  for (const landing of landings) {
    if (landing.status === 'error') counts.errors += 1;
    for (const server of landing.servers) {
      counts.servers += 1;
      if (counts[server.ownership] !== undefined) counts[server.ownership] += 1;
    }
  }
  return { schema: MCP_LIST_SCHEMA, command: 'list', landings, counts, drift: findLandingDrift({ targets }).map((item) => ({ ...item })) };
}

/** 落点→文件路径。`--file` 是唯一的覆盖位（给非常规安装与自检用），其余一律由补表决定。 */
function configPathFor(options, { homeDir, env, projectRoot }) {
  const resolved = resolveOrError(options.client, options.scope, options.targets);
  if (resolved.error) throw new Error(resolved.error);
  if (options.file) return { landing: resolved.landing, filePath: options.file };
  const homes = getClientHomes(env, homeDir);
  return { landing: resolved.landing, filePath: landingFile(resolved.landing, { clientHome: homes[options.client] || '', projectRoot }) };
}

/** enable/disable：只有落点白名单里有 `enabled` 的客户端能做，且必须是 AIOS 拥有（或已接管）的条目。 */
async function setEnabled({ options, engine, wantEnabled }) {
  const landing = engine.landing;
  if (!landing.allowedFields.includes('enabled')) {
    return {
      status: 'rejected',
      reason: 'field-not-supported-by-landing',
      field: 'enabled',
      hint: `${landing.clientId}/${landing.scope} 的条目 schema 里没有 enabled 字段；开关要在该客户端自己的界面做，不在此伪造`,
    };
  }
  const read = readServers({ clientId: options.client, scope: options.scope, filePath: engine.filePath, targets: options.targets });
  const actual = read.entries?.[options.name];
  if (!actual) return { status: 'not-found', reason: 'entry-not-found', serverName: options.name };
  if (Boolean(actual.enabled) === wantEnabled) return { status: 'unchanged', serverName: options.name };
  return installServer({ ...engine.args, entry: { ...actual, enabled: wantEnabled }, restore: true });
}

export async function runMcpCommand(options = {}, { projectRoot = process.cwd(), stdout = process.stdout, env = process.env, homeDir = os.homedir(), targets } = {}) {
  // `--home-dir` / `--project-root` 是显式覆盖位：w2/w3/w4 的全部测试都靠它指到临时目录，
  // 真机配置在 w7 之前一个字节都不该被这些命令碰到。
  const merged = { ...options, targets: options.targets || targets };
  const root = merged.projectRoot || projectRoot;
  const home = merged.homeDir || homeDir;
  const verb = String(options.subcommand || '').trim().toLowerCase();

  if (verb === 'list') {
    const state = await listMcpState({ ...merged, homeDir: home, env, projectRoot: root });
    return emit({ ...state, exitCode: 0 }, merged, stdout);
  }
  if (verb === 'doctor') {
    const state = await listMcpState({ ...merged, homeDir: home, env, projectRoot: root });
    const clients = selectedClients(merged.client);
    // 账本位置要说成真路径：写 `<AIOS_HOME>` 这种占位符，人就还得自己去猜去哪找。
    const ledgerDir = resolveMcpLedgerDir({ env, homeDir: home, ledgerDir: merged.ledgerDir || '' });
    const ledger = [];
    for (const clientId of clients) {
      const read = await readMcpLedger(clientId, { ledgerDir: merged.ledgerDir || '' });
      ledger.push({ clientId, path: path.join(ledgerDir, `${clientId}.json`), missing: read.missing === true, corrupt: read.corrupt || '' });
    }
    const corrupt = ledger.some((item) => item.corrupt);
    // 退出码只判「这次问到的落点」：`--client claude` 不该被 pi 的表不齐拖红，
    // 但 drift 数组仍然全量带在输出里——事实要说全，判定范围要跟问题一致。
    const askedDrift = state.drift.filter((item) => clients.includes(item.clientId));
    const unhealthy = state.counts.errors > 0 || corrupt || askedDrift.length > 0;
    // `command` 必须在 `...state` 之后覆盖：list 的状态里自带 command:'list'，先写会被吃掉。
    return emit({ ...state, schema: MCP_ACTION_SCHEMA, command: 'doctor', ledger, driftInScope: askedDrift, exitCode: unhealthy ? 1 : 0 }, merged, stdout);
  }

  // 动词不合法时要在解析落点之前就说清楚：否则报出来的是「landing 不存在」这种误导话。
  if (!WRITE_VERBS.has(verb)) {
    throw new Error(`mcp requires subcommand: ${ALL_VERBS.join(', ')} (got "${verb}")`);
  }

  const { landing, filePath } = configPathFor(merged, { homeDir: home, env, projectRoot: root });
  const engine = {
    landing,
    filePath,
    args: {
      clientId: merged.client,
      scope: merged.scope,
      serverName: merged.name,
      filePath,
      dryRun: merged.dryRun === true,
      backupDir: merged.backupDir || '',
      ledgerDir: merged.ledgerDir || '',
      targets: merged.targets,
      browserRuntimeInstalled: merged.browserRuntime === true,
    },
  };

  let result;
  if (verb === 'add') {
    result = await installServer({ ...engine.args, entry: merged.entry, adopt: merged.adopt === true, restore: merged.restore === true });
  } else if (verb === 'adopt') {
    result = await installServer({ ...engine.args, entry: merged.entry, adopt: true });
  } else if (verb === 'remove') {
    result = await uninstallServer({ ...engine.args, adopt: merged.adopt === true, force: merged.force === true });
  } else {
    result = await setEnabled({ options: merged, engine, wantEnabled: verb === 'enable' });
  }
  const payload = {
    schema: MCP_ACTION_SCHEMA,
    command: verb,
    serverName: merged.name,
    landing: { clientId: merged.client, scope: merged.scope, file: filePath, format: landing.format, entryPath: landing.entryPath },
    ...result,
    exitCode: failureOf(result.status),
  };
  return emit(payload, merged, stdout);
}

function failureOf(status) {
  return SUCCESS.has(status) ? 0 : 1;
}

function emit(result, options, stdout) {
  if (options.json || options.format === 'json') stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(renderText(result));
  return result;
}

function renderText(result) {
  const lines = [];
  if (result.command === 'list' || result.command === 'doctor') {
    for (const landing of result.landings || []) {
      const tags = [landing.status];
      if (landing.registered === false) tags.push('table-unregistered');
      if (landing.writable === false) tags.push('not-writable');
      if (landing.ledgerCorrupt) tags.push(`ledger-${landing.ledgerCorrupt}`);
      lines.push(`${landing.clientId}/${landing.scope} ${landing.format} [${tags.join('] [')}]`);
      lines.push(`  file: ${landing.file || '-'}  bucket: ${landing.entryPath || '-'}`);
      if (landing.reason) lines.push(`  reason: ${landing.reason}`);
      if (landing.unverifiedFields?.length) lines.push(`  unverified fields: ${landing.unverifiedFields.join(', ')}`);
      for (const server of landing.servers || []) lines.push(`  - ${server.name} (${server.ownership}) {${server.fields.join(', ')}}`);
      if (!landing.servers?.length && landing.status === 'absent') lines.push('  (落点文件不存在)');
    }
    if (result.drift?.length) {
      lines.push('landing drift (补表 vs 声明表):');
      for (const item of result.drift) lines.push(`  - ${item.clientId}/${item.scope} ${item.kind}${item.declared ? ` declared=${item.declared}` : ''}${item.override ? ` actual=${item.override}` : ''}`);
    }
    for (const item of result.ledger || []) lines.push(`ledger: ${item.clientId} ${item.corrupt || (item.missing ? 'missing' : 'ok')} ${item.path}`);
    lines.push(`counts: ${JSON.stringify(result.counts)}`);
    return `${lines.join('\n')}\n`;
  }
  lines.push(`${result.command}: ${result.status}${result.serverName ? ` ${result.serverName}` : ''}`);
  if (result.reason) lines.push(`  reason: ${result.reason}`);
  if (result.policy) lines.push(`  policy: ${result.policy}`);
  if (result.policyRef) lines.push(`  policyRef: ${result.policyRef}`);
  if (result.message) lines.push(`  ${result.message}`);
  if (result.hint) lines.push(`  hint: ${result.hint}`);
  if (result.classification?.status) lines.push(`  ownership: ${result.classification.status}`);
  if (result.landing?.file) lines.push(`  file: ${result.landing.file}`);
  // 字段落到了别人家的名字上必须说出来：不说，交付方会以为文件里写的就是自己给的那个键名（w5a 的改名位）。
  // 只报名，不报值——这一层的输出里任何时候都不出现条目内容。
  if (result.renamed?.length) lines.push(`  renamed: ${result.renamed.map((item) => `${item.from}->${item.to}`).join(', ')}`);
  if (result.createdRootKeys?.length) lines.push(`  createdRootKeys: ${result.createdRootKeys.join(', ')}`);
  if (result.droppedRootKeys?.length) lines.push(`  droppedRootKeys: ${result.droppedRootKeys.join(', ')}`);
  if (result.residue) lines.push(`  residue: ${result.residue}`);
  return `${lines.join('\n')}\n`;
}
