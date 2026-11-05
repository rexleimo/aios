// The action allowlist: the only executable surface the panel has.
//
// ADR 0007 decision 3 puts execution in the capability process — the browser only
// fetches. This module makes that literal: a view may name an **action id**, never a
// command. The id maps to a fixed argv here, and the only free variable is a client id
// that the caller validates against `config/host-capabilities.json`. There is no string
// a page can send that becomes part of a shell command.
//
// Two distinctions are data, not UI conventions, and are pinned by
// `shell-actions.test.mjs`:
//
//   - `kind: 'read-only'` may run on click; `kind: 'mutating'` writes outside the
//     repository (client homes, global skills roots) and needs an explicit confirmation.
//   - every mutating action has a `preview` counterpart that writes nothing, so the
//     panel can show the diff before the write instead of describing it.
export const ACTIONS_SCHEMA_VERSION = 1;

/** The CLI entry, relative to the install root. */
export const CLI_REL_PATH = 'scripts/aios.mjs';

/**
 * @typedef {object} ActionSpec
 * @property {string} label
 * @property {string} detail
 * @property {'read-only' | 'mutating'} kind
 * @property {boolean} confirm
 * @property {boolean} needsClient
 * @property {number[]} okExitCodes exit codes that mean "ran", not "failed"
 * @property {(context: { cli: string, client?: string }) => string[] | null} argv
 */

/** @type {Record<string, ActionSpec>} */
export const ACTIONS = Object.freeze({
  'status.refresh': {
    label: '重新采集状态',
    detail: '重跑 aios status --json：矩阵与阻断都来自它的输出。',
    kind: 'read-only',
    confirm: false,
    needsClient: false,
    // 实测：`aios status --json` 在判定为 blocked 时退出码是 1，payload 照样完整。
    // 把 1 当失败会让「重新采集」每次都红着收场。
    okExitCodes: [0, 1],
    argv: ({ cli }) => [cli, 'status', '--json'],
  },
  'skill.health': {
    label: '技能健康',
    detail: 'aios skill health --json：技能的安装情况与失败模式。',
    kind: 'read-only',
    confirm: false,
    needsClient: false,
    okExitCodes: [0],
    argv: ({ cli }) => [cli, 'skill', 'health', '--json'],
  },
  'doctor.run': {
    label: '仓库体检',
    detail: 'aios doctor：安装、集成与仓库健康。实测约 14 秒，输出流式回显。',
    kind: 'read-only',
    confirm: false,
    needsClient: false,
    okExitCodes: [0],
    argv: ({ cli }) => [cli, 'doctor'],
  },
  'client.setup.preview': {
    label: '预览安装',
    detail: 'aios setup --dry-run：只显示会写什么，不写任何东西。',
    kind: 'read-only',
    confirm: false,
    needsClient: true,
    okExitCodes: [0],
    argv: ({ cli, client }) =>
      client ? [cli, 'setup', '--dry-run', '--client', client] : null,
  },
  'client.setup.apply': {
    label: '安装 / 修复',
    detail: 'aios setup --client <id> --yes：把 AIOS 集成写进该客户端。写主目录，必须显式确认。',
    kind: 'mutating',
    confirm: true,
    needsClient: true,
    okExitCodes: [0],
    argv: ({ cli, client }) => (client ? [cli, 'setup', '--client', client, '--yes'] : null),
  },
});

/** The ids a view may name, in a stable order. */
export function listActionIds() {
  return Object.keys(ACTIONS);
}

/** Whether a spec requires an explicit confirmation before it may run. */
export function requiresConfirmation(id) {
  return ACTIONS[id]?.confirm === true;
}

/** Whether a spec is meaningless without a client id. */
export function actionNeedsClient(id) {
  return ACTIONS[id]?.needsClient === true;
}

/**
 * Build an argv for an action id, or `null` when the id is unknown or the inputs are
 * unusable. A caller that gets `null` must not run anything: the fallback for a bad
 * request is a refusal, never a default command.
 */
export function buildActionArgv(id, { cli, client } = {}) {
  const spec = ACTIONS[id];
  if (!spec) return null;
  if (typeof cli !== 'string' || cli.length === 0) return null;
  if (spec.needsClient && (typeof client !== 'string' || client.length === 0)) return null;
  const argv = spec.argv({ cli, client });
  if (!Array.isArray(argv) || argv.length === 0) return null;
  if (argv.some((part) => typeof part !== 'string' || part.length === 0)) return null;
  return argv;
}

/** Whether an exit code means the action ran (not whether it liked the result). */
export function isSuccessfulExit(id, code) {
  const allowed = ACTIONS[id]?.okExitCodes ?? [0];
  return allowed.includes(Number(code));
}

/** Server-sent event frame: one JSON payload per event, no shell quoting involved. */
export function sseFrame(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/** The actions a client row offers, in the order the row should show them. */
export function clientActionIds() {
  return listActionIds().filter((id) => actionNeedsClient(id));
}
