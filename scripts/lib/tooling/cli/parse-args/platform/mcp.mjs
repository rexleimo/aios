// scripts/lib/tooling/cli/parse-args/platform/mcp.mjs — `aios mcp` 参数解析。
//
// 严格模式：`allowUnknownOption(false)` + 非 help 一律 `toUsageError` 上传。
// 这条不是风格问题——`commander/passthrough.mjs:25` 的延期名单里已经躺着 12 个「吞掉用法错误还退 0」
// 的命令，`cli-usage-error-exit.test.mjs` 拿 COMMAND_SPECS 逐个 spawn 检查真实退出码。
// 新命令不许再进那张账，所以这里从第一行起就是严的。
//
// 本层只认字面参数并拼出条目对象；落点在哪、字段合不合白名单、条目归谁，全部归 `clients/mcp/*`。
// 条目碎片→对象这件事只在这里做一次（`cli.mjs` 不再重复拼一遍，否则两处会漂移）。
import { Command } from 'commander';

import { isHelpDisplay, toUsageError } from '../../commander/passthrough.mjs';

const VERBS = ['list', 'add', 'remove', 'enable', 'disable', 'adopt', 'doctor'];
/** 只有这两个动词跨全部落点；写操作必须钉死一个 (client, scope)。 */
const READ_ONLY_VERBS = new Set(['list', 'doctor']);
const SCOPES = new Set(['home', 'project', 'all']);

function collect(value, previous = []) {
  return [...previous, String(value)];
}

/** `--env K=V` 成对收集。值只进内存、绝不回显——CLI 没有任何路径打印 env 值。 */
function collectEnv(value, previous = {}) {
  const raw = String(value);
  const index = raw.indexOf('=');
  if (index <= 0) throw new Error(`--env expects KEY=VALUE (got "${raw}")`);
  return { ...previous, [raw.slice(0, index)]: raw.slice(index + 1) };
}

function parseEntryJson(value) {
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    throw new Error(`--entry must be valid JSON (${error.message})`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--entry must be a JSON object of MCP server fields');
  }
  return parsed;
}

function positiveSeconds(raw, flag) {
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} must be a non-negative number of seconds`);
  return value;
}

const SHARED_OPTIONS = [
  ['--json', 'Machine-readable JSON output'],
  ['--format <text|json>', 'Output format'],
  ['--client <id>', 'Client id (see `aios mcp list`); "all" only for list/doctor'],
  ['--scope <home|project|all>', 'Landing scope (default: home for writes)'],
  ['--home-dir <path>', 'Client home root override'],
  ['--project-root <path>', 'Project root for project-scope landings'],
  ['--ledger-dir <path>', 'Ownership ledger directory override'],
];

// 这两个只对「一个确定的落点」有意义，读动词铺满全表时不接受，所以只在写动词上出现。
const TARGET_OPTIONS = [
  ['--file <path>', 'Override the landing file path'],
  ['--backup-dir <path>', 'Directory for pre-write backups'],
];

const ENTRY_OPTIONS = [
  ['--command <cmd>', 'Entry command executable'],
  ['--arg <value>', 'Entry argument; repeat per argument', collect, []],
  ['--type <type>', 'Entry transport type as this client spells it'],
  ['--env <K=V>', 'Entry environment variable; repeat', collectEnv, {}],
  ['--cwd <path>', 'Entry working directory'],
  ['--timeout <seconds>', 'Entry timeout (gemini names it timeout)', positiveSeconds],
  ['--startup-timeout-sec <seconds>', 'Entry startup timeout (claude family names it startupTimeoutSec)', positiveSeconds],
  ['--lifecycle <lazy|eager>', 'Entry lifecycle (pi)'],
  ['--enabled', 'Write enabled=true on the entry'],
  ['--entry <json>', 'Whole entry object; replaces the fragment flags above'],
  ['--browser-runtime', 'Assert the browser MCP runtime is installed (pi browser gate)'],
  ['--dry-run', 'Plan only: touch neither the config nor the ledger'],
  ['--adopt', 'Explicit human decision: take over a foreign or user-edited entry'],
];

const EXTRA_OPTIONS = {
  add: [['--restore', 'Human decision: replace an AIOS-owned entry whose shape is stale']],
  // force 的适用面只有一种：AIOS 登记过、之后被人改过（kept-differs）。从未归 AIOS 的条目要删得先 adopt。
  remove: [['--force', 'Human decision: delete an entry AIOS registered and someone has since edited']],
};

const program = new Command()
  .name('mcp')
  .description('Manage MCP servers across the local agent clients (ownership-guarded)')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(true);

for (const verb of VERBS) {
  const cmd = program
    .command(verb)
    .helpOption(false)
    .exitOverride()
    .allowUnknownOption(false)
    .allowExcessArguments(true)
    .argument('[name]', 'MCP server name');
  const readOnly = READ_ONLY_VERBS.has(verb);
  // 读动词也接受 `--file`，但只允许在 `--client <id> --scope home|project` 选中单个落点时用（下面校验）。
  const optionsForVerb = [...SHARED_OPTIONS, ...(readOnly ? [TARGET_OPTIONS[0]] : [...TARGET_OPTIONS, ...ENTRY_OPTIONS, ...(EXTRA_OPTIONS[verb] || [])])];
  for (const [flags, desc, fn, def] of optionsForVerb) {
    cmd.option(flags, desc, fn, def);
  }
}

function defaultOptions(verb) {
  return {
    subcommand: verb || '',
    name: '',
    // 读动词默认铺满全部落点；写动词必须显式给 --client，缺了就报用法错误，不猜。
    client: READ_ONLY_VERBS.has(verb) ? 'all' : '',
    scope: READ_ONLY_VERBS.has(verb) ? 'all' : 'home',
    json: false,
    format: '',
    dryRun: false,
    adopt: false,
    restore: false,
    force: false,
    browserRuntime: false,
    entry: null,
    homeDir: '',
    projectRoot: '',
    ledgerDir: '',
    file: '',
    backupDir: '',
  };
}

function buildEntry(flags) {
  if (flags.entry !== undefined) return parseEntryJson(flags.entry);
  const entry = {};
  if (flags.command) entry.command = String(flags.command);
  if (Array.isArray(flags.arg) && flags.arg.length) entry.args = flags.arg;
  if (flags.type) entry.type = String(flags.type);
  if (flags.env && Object.keys(flags.env).length) entry.env = flags.env;
  if (flags.cwd) entry.cwd = String(flags.cwd);
  if (flags.timeout !== undefined) entry.timeout = flags.timeout;
  if (flags.startupTimeoutSec !== undefined) entry.startupTimeoutSec = flags.startupTimeoutSec;
  if (flags.lifecycle) entry.lifecycle = String(flags.lifecycle);
  if (flags.enabled === true) entry.enabled = true;
  if (!Object.keys(entry).length) throw new Error('mcp add needs --entry <json> or at least --command');
  return entry;
}

export function parseMcpArgs(argv = []) {
  const rest = argv.slice(1);
  const rawVerb = String(rest[0] || '').trim().toLowerCase();
  const help = rest.includes('-h') || rest.includes('--help');
  const verb = VERBS.includes(rawVerb) ? rawVerb : '';

  try {
    if (help || !verb) {
      if (rawVerb && !rawVerb.startsWith('-') && !VERBS.includes(rawVerb)) {
        throw new Error(`unknown mcp verb "${rawVerb}" (use: ${VERBS.join(', ')})`);
      }
      // 裸 `aios mcp` 是帮助展示（退 0）；`aios mcp --某旗标` 是用法错误（退非 0）。
      // 这条区分是 `cli-usage-error-exit.test.mjs` 的守卫项：它拿 COMMAND_SPECS 逐个 spawn
      // `mcp --definitely-not-a-real-flag`，要求真实非零退出——把未知旗标降级成 help 就是假绿。
      const strayFlag = rest.find((token) => String(token).startsWith('-') && token !== '-h' && token !== '--help');
      if (!help && strayFlag) throw new Error(`unknown option for mcp: ${strayFlag} (mcp needs a verb: ${VERBS.join(', ')})`);
      return { mode: 'help', help: true, command: 'mcp', options: defaultOptions(verb) };
    }

    const options = defaultOptions(verb);
    const parsed = program.parse(rest, { from: 'user' });
    const matched = parsed.commands?.find((command) => command.name() === verb);
    const flags = matched?.opts ? matched.opts() : {};
    const positional = (matched?.args || []).map((value) => String(value).trim()).filter(Boolean);
    if (positional.length > 1) throw new Error(`mcp ${verb} takes one server name (got ${positional.length})`);

    options.name = positional[0] || '';
    options.json = flags.json === true;
    options.format = flags.format ? String(flags.format) : '';
    if (flags.client) options.client = String(flags.client).trim().toLowerCase();
    if (flags.scope) options.scope = String(flags.scope).trim().toLowerCase();
    options.dryRun = flags.dryRun === true;
    options.adopt = flags.adopt === true;
    options.restore = flags.restore === true;
    options.force = flags.force === true;
    options.browserRuntime = flags.browserRuntime === true;
    for (const key of ['homeDir', 'projectRoot', 'ledgerDir', 'file', 'backupDir']) {
      if (flags[key]) options[key] = String(flags[key]);
    }

    if (!SCOPES.has(options.scope)) throw new Error(`--scope must be home, project, or all (got "${options.scope}")`);
    if (READ_ONLY_VERBS.has(verb)) {
      if (options.dryRun || options.adopt) throw new Error(`mcp ${verb} is read-only`);
      // 读面也可以把落点指到别处，但必须说清是哪一个：铺满 18 个落点时一个路径谁都代表不了。
      if (options.file && (options.client === 'all' || !options.scope || options.scope === 'all')) {
        throw new Error('--file needs a single landing: pass --client <id> and --scope home|project');
      }
    } else {
      if (options.scope === 'all') throw new Error(`mcp ${verb} needs --scope home or project, not all`);
      if (!options.client || options.client === 'all') throw new Error(`mcp ${verb} needs --client <id>; "all" is only for list/doctor`);
      if (!options.name) throw new Error(`mcp ${verb} requires a server name`);
      if (verb === 'add') options.entry = buildEntry(flags);
      if (verb === 'adopt') options.entry = flags.entry === undefined ? null : parseEntryJson(flags.entry);
      if (verb !== 'add' && flags.restore) throw new Error('--restore only applies to mcp add');
      if (verb !== 'remove' && flags.force) throw new Error('--force only applies to mcp remove');
      if (verb !== 'add' && verb !== 'adopt' && (flags.entry !== undefined || flags.enabled === true)) throw new Error(`mcp ${verb} does not take entry flags`);
    }
    if (options.format === 'json') options.json = true;

    return { mode: 'command', help: false, command: 'mcp', options };
  } catch (error) {
    if (!isHelpDisplay(error)) throw toUsageError(error, { command: 'mcp' });
    return { mode: 'help', help: true, command: 'mcp', options: defaultOptions(verb) };
  }
}

export const MCP_VERBS = Object.freeze([...VERBS]);
