// scripts/lib/clients/mcp/entry-transforms.mjs — 「同一个条目在每家叫什么」的唯一一处（w5a）。
//
// 为什么必须有这一层：`landing-schema.mjs` 的白名单只会**拒绝**越界字段，不会改名。
// 于是 AIOS 的规范条目（claude 家族的 `startupTimeoutSec`）今天写不进 codex/gemini/grok/zcode——
// 而四家私有写入器各自在原地做这件改名（`mcp-gemini.mjs:16-31`、`zcode-schema.mjs:33-48`、
// codemap 的 TOML 写手），改名规则因此有四个所有者。w5b 要把它们的**文件写入**收编到通用路径，
// 前提就是通用路径自己有这份规则，否则收编等于把四份规则复制四遍。
//
// 三条规矩，都是这层的存在理由，不是风格：
//   1. **只改名、只换算，绝不静默丢字段。** 私有写入器里有「按白名单过滤」的做法（zcode 的
//      `normalizeZcodeServerEntry` 会把不在表里的键直接抹掉），本层不学它：调用方给的字段若白名单不认，
//      一律由 `assertEntryAllowed` 判成 `unknown-field` 拒掉并点名。悄悄丢掉一个字段＝交付方以为装上了，
//      客户端那边却没有——这正是本切片要根治的「做出来等于没做」。
//   2. **改名必须发生在归属指纹之前。** 账本按「磁盘上那条目的全字段 sha256」认领（`ledger.mjs:59-61`），
//      若先按规范形状记指纹、再写一份改名后的形状到磁盘，每条收编后的条目都会永久 `kept-differs`。
//      所以 `install-policy` 必须在判定前调用本层，之后所有环节（指纹/白名单/写盘）看到的都是同一份落地形状。
//   3. **目标键已存在且值不同即拒**，不覆盖调用方明确写了的那个值：`{startupTimeoutSec:10, timeout:30000}`
//      是矛盾输入，猜哪一边都是错的。
import { isDeepStrictEqual } from 'node:util';

/**
 * 一条改名规则。`scale` 只用于「同一时长在两家单位不同」的字段（秒 → 毫秒），
 * 依据是既有所有者：`browser/mcp/formats/mcp-gemini.mjs:5`（`startupTimeoutSec 秒 → timeout 毫秒`）与
 * `foundation/clients/integration/mcp/zcode-schema.mjs:44-46`（同样 ×1000）。
 * codex/grok 的 `startup_timeout_sec` 从键名到单位都是秒，因此**不带** scale——
 * 给它加 1000 会把 10 秒写成 10000 秒，那是把改名做成改值。
 */
const RENAME = Object.freeze({
  gemini: [{ from: 'startupTimeoutSec', to: 'timeout', scale: 1000 }],
  zcode: [{ from: 'startupTimeoutSec', to: 'timeoutMs', scale: 1000 }],
  codex: [{ from: 'startupTimeoutSec', to: 'startup_timeout_sec' }],
  grok: [{ from: 'startupTimeoutSec', to: 'startup_timeout_sec' }],
});

/**
 * 逐 (client, scope) 生效的改名表。目前四家两个 scope 同规则，所以按 client 挂；
 * 真出现「同一 client 的两个 scope 规则不同」时在这里加 scope 键覆盖，而不是在调用方加分支。
 * 没登记的落点＝不改名（claude/workbuddy/qoder/hermes 项目级用的就是规范形状）。
 */
export const ENTRY_FIELD_RENAMES = Object.freeze(
  Object.fromEntries(Object.entries(RENAME).map(([clientId, rules]) => [clientId, Object.freeze(rules)])),
);

/** 该落点会不会动条目形状：界面/证据卡用它说明「装进去的字节与提交的对象不同名」。 */
export function landingRenames(clientId, scope) {
  void scope; // 预留：scope 级覆盖在这里生效
  return ENTRY_FIELD_RENAMES[clientId] || Object.freeze([]);
}

/**
 * 把规范条目转换成该落点的形状。返回 `{ ok, entry, renamed }`。
 * `renamed` 只报「哪个键在落点叫什么、按哪条规则换算」（`{from,to,rule}`），**不带值**：
 * 这一层的输出纪律是从不打印条目内容（ADR 0008 的隐私面），换算后的 10000 也是条目内容。
 * 要解释「为什么 10 变成 10000」，看 `rule: 'x1000'` 与这里的注释，不看用户的值。
 * `ok:false` 时带机器可读理由，调用方不得写盘。
 */
export function normalizeEntryForLanding(clientId, scope, entry) {
  const rules = landingRenames(clientId, scope);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || rules.length === 0) {
    return { ok: true, entry, renamed: Object.freeze([]) };
  }
  const out = { ...entry };
  const renamed = [];
  for (const rule of rules) {
    if (!Object.prototype.hasOwnProperty.call(out, rule.from)) continue;
    const raw = out[rule.from];
    let value = raw;
    const descriptor = rule.scale === undefined ? 'rename' : `x${rule.scale}`;
    if (rule.scale !== undefined) {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        return { ok: false, reason: 'transform-not-numeric', field: rule.from, value: String(raw), entry: out, renamed: Object.freeze(renamed) };
      }
      value = Math.round(numeric * rule.scale);
    }
    if (Object.prototype.hasOwnProperty.call(out, rule.to) && !isDeepStrictEqual(out[rule.to], value)) {
      return {
        ok: false,
        reason: 'transform-target-conflict',
        field: rule.to,
        conflictFrom: rule.from,
        entry: out,
        renamed: Object.freeze(renamed),
      };
    }
    delete out[rule.from];
    out[rule.to] = value;
    renamed.push(Object.freeze({ from: rule.from, to: rule.to, rule: descriptor }));
  }
  return { ok: true, entry: out, renamed: Object.freeze(renamed) };
}
