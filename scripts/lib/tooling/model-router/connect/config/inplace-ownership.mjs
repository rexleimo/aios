import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { editClaude, restoreClaude, editCodex, restoreCodex, editPiSettings, restorePiSettings, editPiModels, restorePiModels,
  editOpencode, restoreOpencode, editZcode, restoreZcode, editQoder, restoreQoder, editGemini, restoreGemini,
  editHermes, restoreHermes, editGrok, restoreGrok, editWorkbuddy, restoreWorkbuddy } from '../editors.mjs';
import { persistedConnectTarget, requestModelForTarget } from '../targets.mjs';

export const EDITORS = {
  'claude/main': (text, { gatewayUrl, modelId, catalog }) => editClaude(text, gatewayUrl, modelId, catalog),
  'codex/main': (text, { gatewayUrl, modelId }) => editCodex(text, gatewayUrl, modelId),
  'pi/settings': (text, { modelId }) => editPiSettings(text, modelId),
  'pi/models': (text, { gatewayUrl, modelId, catalog }) => editPiModels(text, gatewayUrl, modelId, catalog),
  'opencode/main': (text, { gatewayUrl, modelId, catalog }) => editOpencode(text, { gatewayUrl, modelId, catalog }),
  'zcode/main': (text, { gatewayUrl, modelId, catalog }) => editZcode(text, { gatewayUrl, modelId, catalog }),
  'qoder/main': (text, { gatewayUrl, modelId, catalog }) => editQoder(text, { gatewayUrl, modelId, catalog }),
  'gemini/main': (text, { gatewayUrl, modelId, catalog }) => editGemini(text, { gatewayUrl, modelId, catalog }),
  'hermes/main': (text, { gatewayUrl, modelId }) => editHermes(text, { gatewayUrl, modelId }),
  'grok/main': (text, { gatewayUrl, modelId }) => editGrok(text, { gatewayUrl, modelId }),
  'workbuddy/main': (text, { gatewayUrl, modelId, catalog }) => editWorkbuddy(text, { gatewayUrl, modelId, catalog }),
};
export const RESTORERS = {
  'claude/main': restoreClaude,
  'codex/main': restoreCodex,
  'pi/settings': restorePiSettings,
  'pi/models': restorePiModels,
  'opencode/main': restoreOpencode,
  'zcode/main': restoreZcode,
  'qoder/main': restoreQoder,
  'gemini/main': restoreGemini,
  'hermes/main': restoreHermes,
  'grok/main': restoreGrok,
  'workbuddy/main': restoreWorkbuddy,
};

export function staleConfig(file) {
  return Object.assign(new Error(`client config changed outside connect: ${file}; preserve the recovery backup and reconcile before retrying`), { code: 'CLIENT_CONFIG_STALE' });
}

export function readFileState(fsImpl, file) {
  try {
    return { existed: true, text: fsImpl.readFileSync(file, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { existed: false, text: '' };
    throw error;
  }
}

const hash = (text) => createHash('sha256').update(text).digest('hex');
export const projectBackup = (backup, shape) => Object.fromEntries(Object.keys(shape).map((key) => [key, backup[key]]));

export function entryParams(entry, document) {
  const target = entry.target ?? document.targets?.[entry.client];
  const version = entry.targetRefVersion ?? document.targetRefVersion;
  const modelId = target === undefined ? entry.modelId || document.modelId || 'gateway-default'
    : version === undefined ? target : requestModelForTarget(persistedConnectTarget(target, version));
  return { gatewayUrl: entry.gatewayUrl ?? document.gatewayUrl, modelId, catalog: entry.catalog ?? document.catalogs?.[entry.client] ?? [] };
}

function managedHash(backup) {
  // 容器是否存在不代表字段所有权；用户可在 env/providers 中添加无关配置。
  const { hadEnv, hadProviders, ...managed } = backup;
  return hash(JSON.stringify(managed));
}

export function configSnapshot(state, backup) {
  return { existed: state.existed, hash: hash(state.text), managed: managedHash(backup) };
}

const sameManaged = (a, b) => a && b && a.existed === b.existed && a.managed === b.managed;
export const sameFile = (a, b) => a && b && a.existed === b.existed && a.hash === b.hash;
export const isOriginal = (entry, current) => (current.existed || !entry.existed) && current.managed === managedHash(entry.backup);

export function appliedSnapshots(entry, document) {
  if (entry.applied || entry.pending) return [entry.applied, entry.pending?.before, entry.pending?.after].filter(Boolean);
  // 兼容旧备份：从旧接入参数重建托管字段，不把当前外部值认领为网关所有。
  const key = `${entry.client}/${entry.role}`;
  const params = entryParams(entry, document);
  let { text } = EDITORS[key]('', params);
  if (document.targetRefVersion !== 1) {
    if (entry.client === 'codex') text = text.replace('/clients/codex/v1', '/v1');
    else {
      const legacy = JSON.parse(text);
      if (entry.client === 'claude') legacy.env.ANTHROPIC_BASE_URL = document.gatewayUrl.replace(/\/+$/u, '');
      if (key === 'pi/settings') legacy.defaultModel = `aios-gateway/${params.modelId}`;
      if (key === 'pi/models') {
        legacy.providers['aios-gateway'].baseUrl = document.gatewayUrl.replace(/\/+$/u, '');
        delete legacy.providers['aios-gateway'].headers;
      }
      text = `${JSON.stringify(legacy, null, 2)}\n`;
    }
  }
  return [configSnapshot({ existed: true, text }, projectBackup(EDITORS[key](text, params).backup, entry.backup))];
}

export function assertOwned(entry, current, document) {
  if (!isOriginal(entry, current) && !appliedSnapshots(entry, document).some((known) => sameManaged(current, known))) throw staleConfig(entry.file);
}

export function inspectInplaceEntry(entry, document, fsImpl = fs) {
  const before = readFileState(fsImpl, entry.file);
  const backup = EDITORS[`${entry.client}/${entry.role}`](before.text, entryParams(entry, document)).backup;
  const current = configSnapshot(before, projectBackup(backup, entry.backup));
  return { existed: before.existed, original: isOriginal(entry, current), matches: appliedSnapshots(entry, document).some((known) => sameManaged(current, known)), pending: Boolean(entry.pending) };
}
