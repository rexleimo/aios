import { t } from '../../../i18n/t.mjs';
import { serializeTargetRef } from '../../../lib/config/model-routing.mjs';

export function clientFailure(payload, fallback = t("读取失败")) {
  for (const value of [payload?.detail, payload?.error?.message, payload?.error, payload?.stderr]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

export function installationSummary(client) {
  if (!client || client.installed === null) return t("安装状态未验证（读取异常，不代表未安装）");
  if (client.installed === false) return t("PATH 中未检测到程序（不等于本机绝无安装）");
  const version = client.version || ({ failed: t("版本探测失败"), unrecognized: t("版本输出无法识别"),
    unsupported: t("此客户端尚不支持版本探测") }[client.versionStatus] || t("版本未读到"));
  return t("已检测到程序 · {version}", { version: version });
}

export function clientTargetOptions(payload) {
  if (!Array.isArray(payload?.models)) throw new Error(t("模型目录返回格式无效。"));
  const models = payload.models;
  const eligible = new Set(models.map(model => model.id));
  const known = new Set((payload.modelBindings || models).map(model => model.id));
  const groups = payload.editable?.routingGroups || [];
  return [
    { value: 'auto', label: t("AIOS Auto · 使用模型分配") },
    ...models.map(model => ({ value: serializeTargetRef({ kind: 'model', id: model.id }), label: `${model.label || model.id} · ${model.id}` })),
    ...groups.filter(group => group.enabled !== false && ['', 'smart', 'ordered'].includes(group.routing || '')
      && Array.isArray(group.models) && group.models.every(id => known.has(id)) && group.models.some(id => eligible.has(id)))
      .map(group => ({ value: serializeTargetRef({ kind: 'group', id: group.id }), label: t("路由组 · {value0}（顺序后备）", { value0: group.id }) })),
  ];
}

export function connectionSummary(client) {
  if (!client) return t("状态未读到");
  const status = client.readback?.status;
  const abnormal = { drift: t("配置已被修改，与恢复记录不一致"), unreadable: t("配置无法读取，连接状态未验证"),
    malformed: t("配置格式无效，连接状态未验证"), unknown: t("配置无法完整解析，连接状态未验证"),
    partial: t("配置接入不完整，不能视为已连接") }[status];
  if (abnormal) return `${abnormal}${client.connected ? t("（仍观察到网关配置）") : ''}`;
  return client.connected === true ? t("配置已接入 · {value0}", { value0: client.mode || t("现有配置") }) : t("未接入");
}

export function connectionMutationBlocked(client) {
  return !client || ['drift', 'unreadable', 'malformed', 'unknown', 'partial'].includes(client.readback?.status)
    || ['drift', 'unknown'].includes(client.ownership?.status);
}

export function updatePreviewSupported(preview) {
  return preview?.supported === true && /^[a-f0-9]{64}$/u.test(preview.revision || '')
    && typeof preview.command?.file === 'string' && Array.isArray(preview.command.args)
    && preview.command.args.every(arg => typeof arg === 'string');
}

export function updateCommandLabel(preview) {
  if (!updatePreviewSupported(preview)) return t("没有可执行的来源适配器命令。");
  return [preview.command.file, ...preview.command.args].map(arg => JSON.stringify(arg)).join(' ');
}
