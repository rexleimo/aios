// scripts/lib/clients/plugins/client-contributions.mjs — client kind contribution（P3）。
// client contribution 声明"这个插件支持把 AIOS 接入哪些客户端、用什么方式"，
// 实际接入动作复用现有 connect 系统（ADR 0010），这里只做声明的校验与解析。

const SUPPORTED_MODES = Object.freeze(['inplace', 'isolated']);
const CLIENT_ID_PATTERN = /^[a-z][a-z0-9._-]*$/u;

export class ClientContributionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClientContributionError';
  }
}

/**
 * 校验并归一化 contributes.clients 数组。
 * 每条：{ id, mode, baseUrlKey, note? }；mode 必须是 inplace/isolated。
 */
export function normalizeClientContributions(raw) {
  if (raw === undefined || raw === null) return Object.freeze([]);
  if (!Array.isArray(raw)) throw new ClientContributionError('contributes.clients must be an array');
  return Object.freeze(raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ClientContributionError(`contributes.clients[${index}] must be an object`);
    }
    const id = String(entry.id || '').trim();
    if (!CLIENT_ID_PATTERN.test(id)) throw new ClientContributionError(`contributes.clients[${index}].id is invalid`);
    const mode = String(entry.mode || 'inplace').trim();
    if (!SUPPORTED_MODES.includes(mode)) throw new ClientContributionError(`contributes.clients[${index}].mode must be ${SUPPORTED_MODES.join(' or ')}`);
    return Object.freeze({
      id,
      mode,
      baseUrlKey: String(entry.baseUrlKey || '').trim(),
      note: String(entry.note || '').trim(),
    });
  }));
}
