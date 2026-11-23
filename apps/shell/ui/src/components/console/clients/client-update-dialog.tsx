'use client';

import { t } from '../../../i18n/t.mjs';
import { useRef } from 'react';
import { Button, Modal } from '../console-ui';
import type { ClientInstallation } from './use-client-management';
import { updateCommandLabel, updatePreviewSupported } from './client-management-model.mjs';

export interface UpdatePreview {
  client: ClientInstallation;
  revision?: string;
  supported?: boolean;
  reason?: string;
  source?: { kind?: string };
  command?: { file: string; args: string[] };
  [key: string]: unknown;
}

export function ClientUpdateDialog({ preview, busy, onClose, onConfirm }: {
  preview: UpdatePreview;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const supported = updatePreviewSupported(preview);
  return <Modal open title={t("更新 {value0}？", { value0: preview.client.id })} description={t("将使用检测到的安装来源更新客户端程序。此操作可能联网下载；不会自动重启客户端或网关。")} initialFocus={cancel} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <div className="space-y-4">
      <p className="text-xs leading-6 text-rex-text-muted">{t("执行前重新检查安装指纹。安装来源或程序已变化时，将拒绝本次更新，请重新预览。")}</p>
      <p className="text-xs text-rex-text-muted">{t("来源：")}{preview.source?.kind || t("未知")}  {t("· 当前版本：")}{preview.client.version || t("未读到")}</p>
      <pre className="whitespace-pre-wrap break-all rounded-rex-md border border-rex-border p-3 text-xs">{updateCommandLabel(preview)}</pre>
      {!supported && <p role="alert" className="text-xs text-rex-danger">{preview.reason || t("预览缺少有效安装指纹或受支持命令，不能执行更新。")}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button ref={cancel} variant="outline" disabled={busy} onClick={onClose}>{t("取消")}</Button><Button disabled={busy || !supported} onClick={onConfirm}>{busy ? t("更新中…") : t("确认更新客户端")}</Button></div>
    </div>
  </Modal>;
}
