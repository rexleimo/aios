// 中文注释：TOML/YAML 类客户端的就地接入编辑器——用带标记的托管块或结构化 Document API，块外的用户配置一字不动。
// 与 codex 的 [model_providers] 块同一思路：backup 保存原值，restore 精确还原，漂移可检测。
import YAML from 'yaml';

const KEY = 'aios-gateway';
const BEGIN = '# aios-gateway:begin (managed by `aios model-router connect`; remove via disconnect)';
const END = '# aios-gateway:end';
const trim = (url) => String(url || '').replace(/\/+$/u, '');
const v1 = (url) => `${trim(url)}/v1`;

function stripBlock(lines) {
  const begin = lines.findIndex((line) => line.trim() === BEGIN);
  if (begin === -1) return { lines, prior: null };
  const end = lines.findIndex((line, index) => index > begin && line.trim() === END);
  if (end === -1) throw new Error('incomplete managed block; preserve the config and recovery backup');
  return { lines: lines.filter((_, index) => index < begin || index > end), prior: lines.slice(begin, end + 1).join('\n') };
}

function textOut(lines, block) {
  const body = lines.join('\n').replace(/\n+$/u, '');
  return `${body}\n\n${block}\n`;
}

// ---- grok：~/.grok/config.toml，[model."aios/<id>"] 表 + [models] default ----
export function editGrok(text, { gatewayUrl, modelId }) {
  const { lines, prior } = stripBlock(String(text || '').split('\n'));
  const id = `aios/${modelId}`;
  const backup = { prior, hadModels: lines.some((line) => /^\s*\[models\]\s*$/u.test(line)), default: null };
  // 用户已有的 [models] default 存原值；我们把新默认写进托管块末尾的独立 [models] 表会冲突，
  // 因此只在原 [models] 表里替换 default，backup 记录它。
  const modelsAt = lines.findIndex((line) => /^\s*\[models\]\s*$/u.test(line));
  if (modelsAt >= 0) {
    for (let i = modelsAt + 1; i < lines.length && !/^\s*\[/u.test(lines[i]); i += 1) {
      const match = lines[i].match(/^\s*default\s*=\s*(.+?)\s*$/u);
      if (match) { backup.default = match[1]; lines[i] = `default = ${JSON.stringify(id)}`; break; }
    }
  }
  const block = [
    BEGIN,
    `[models]`,
    `default = ${JSON.stringify(id)}`,
    `[model.${JSON.stringify(id)}]`,
    `model = ${JSON.stringify(modelId)}`,
    `name = "AIOS Gateway"`,
    `base_url = ${JSON.stringify(v1(gatewayUrl))}`,
    `api_key = ${JSON.stringify(KEY)}`,
    `api_backend = "openai"`,
    END,
  ].join('\n');
  return { text: textOut(lines, block), backup, changedKeys: ['[models].default', `[model."${id}"]`] };
}

export function restoreGrok(text, backup) {
  const { lines } = stripBlock(String(text || '').split('\n'));
  if (Object.hasOwn(backup, 'default')) {
    const modelsAt = lines.findIndex((line) => /^\s*\[models\]\s*$/u.test(line));
    if (modelsAt >= 0) {
      for (let i = modelsAt + 1; i < lines.length && !/^\s*\[/u.test(lines[i]); i += 1) {
        if (/^\s*default\s*=/u.test(lines[i])) {
          if (backup.default === null) lines.splice(i, 1);
          else lines[i] = `default = ${backup.default}`;
          break;
        }
      }
    }
  }
  let body = lines.join('\n').replace(/\n+$/u, '');
  if (backup.prior) body = `${body}\n\n${backup.prior}`;
  return `${body}\n`;
}

// ---- hermes：~/.hermes/config.yaml，用 yaml Document API 精准改 providers.aios + model.provider/default ----
// 只 setIn/deleteIn 这些路径，其余节点、顺序、注释由 yaml 原样保留，避免整文件重排。
const HERMES_PATHS = [
  ['providers', 'aios', 'base_url'],
  ['providers', 'aios', 'api_key'],
  ['providers', 'aios', 'api_mode'],
  ['providers', 'aios', 'models'],
  ['model', 'provider'],
  ['model', 'default'],
];
const plain = (value) => value?.toJSON?.() ?? value;

export function editHermes(text, { gatewayUrl, modelId }) {
  const doc = YAML.parseDocument(String(text || '') || '{}');
  const backup = { hadModel: YAML.isMap(doc.getIn(['model'], true)) };
  for (const path of HERMES_PATHS) {
    const current = doc.getIn(path, true);
    backup[path.join('.')] = current === undefined ? null : plain(current);
  }
  doc.setIn(['providers', 'aios', 'base_url'], v1(gatewayUrl));
  doc.setIn(['providers', 'aios', 'api_key'], KEY);
  doc.setIn(['providers', 'aios', 'api_mode'], 'chat_completions');
  doc.setIn(['providers', 'aios', 'models'], [modelId]);
  doc.setIn(['model', 'provider'], 'aios');
  doc.setIn(['model', 'default'], modelId);
  return { text: doc.toString(), backup, changedKeys: HERMES_PATHS.map((path) => path.join('.')) };
}

export function restoreHermes(text, backup) {
  const doc = YAML.parseDocument(String(text || '') || '{}');
  for (const path of HERMES_PATHS) {
    const key = path.join('.');
    const value = backup[key];
    if (value === null || value === undefined) doc.deleteIn(path);
    else doc.setIn(path, value);
  }
  // deleteIn 只删叶子；原本不存在的 providers.aios / providers 空容器要一并清掉。
  const aios = doc.getIn(['providers', 'aios'], true);
  if (YAML.isMap(aios) && aios.items.length === 0) doc.deleteIn(['providers', 'aios']);
  const providers = doc.getIn(['providers'], true);
  if (YAML.isMap(providers) && providers.items.length === 0) doc.deleteIn(['providers']);
  if (!backup.hadModel) {
    const model = doc.getIn(['model'], true);
    if (YAML.isMap(model) && model.items.length === 0) doc.deleteIn(['model']);
  }
  return doc.toString();
}
