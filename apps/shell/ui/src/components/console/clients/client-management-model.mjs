import { serializeTargetRef } from '../../../lib/config/model-routing.mjs';

export function clientFailure(payload, fallback = '读取失败') {
  for (const value of [payload?.detail, payload?.error?.message, payload?.error, payload?.stderr]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

export function installationSummary(client) {
  if (!client || client.installed === null) return '安装状态未验证（读取异常，不代表未安装）';
  if (client.installed === false) return 'PATH 中未检测到程序（不等于本机绝无安装）';
  const version = client.version || ({ failed: '版本探测失败', unrecognized: '版本输出无法识别',
    unsupported: '此客户端尚不支持版本探测' }[client.versionStatus] || '版本未读到');
  return `已检测到程序 · ${version}`;
}

export function clientTargetOptions(payload) {
  if (!Array.isArray(payload?.models)) throw new Error('模型目录返回格式无效。');
  const models = payload.models;
  const eligible = new Set(models.map(model => model.id));
  const known = new Set((payload.modelBindings || models).map(model => model.id));
  const groups = payload.editable?.routingGroups || [];
  return [
    { value: 'auto', label: 'AIOS Auto · 使用模型分配' },
    ...models.map(model => ({ value: serializeTargetRef({ kind: 'model', id: model.id }), label: `${model.label || model.id} · ${model.id}` })),
    ...groups.filter(group => group.enabled !== false && ['', 'smart', 'ordered'].includes(group.routing || '')
      && Array.isArray(group.models) && group.models.every(id => known.has(id)) && group.models.some(id => eligible.has(id)))
      .map(group => ({ value: serializeTargetRef({ kind: 'group', id: group.id }), label: `路由组 · ${group.id}（顺序后备）` })),
  ];
}

export function connectionSummary(client) {
  if (!client) return '状态未读到';
  const status = client.readback?.status;
  const abnormal = { drift: '配置已被修改，与恢复记录不一致', unreadable: '配置无法读取，连接状态未验证',
    malformed: '配置格式无效，连接状态未验证', unknown: '配置无法完整解析，连接状态未验证',
    partial: '配置接入不完整，不能视为已连接' }[status];
  if (abnormal) return `${abnormal}${client.connected ? '（仍观察到网关配置）' : ''}`;
  return client.connected === true ? `配置已接入 · ${client.mode || '现有配置'}` : '未接入';
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
  if (!updatePreviewSupported(preview)) return '没有可执行的来源适配器命令。';
  return [preview.command.file, ...preview.command.args].map(arg => JSON.stringify(arg)).join(' ');
}
