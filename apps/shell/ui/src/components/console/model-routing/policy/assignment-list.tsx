import { t } from '../../../../i18n/t.mjs';
import { Button } from '../../console-ui';
import type { ModelOption } from '../intent-routing-section';
import type { RoutingController } from '../use-routing-config';
import { modelName } from './model-label';

export type AssignmentPreview = ReturnType<RoutingController['policyPreview']>;

export function AssignmentResult({ preview, models }: { preview: AssignmentPreview; models: ModelOption[] }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
        {preview.modelId ? modelName(models, preview.modelId) : preview.byProtocol.some((item) => item.modelId) ? t("按请求协议选择") : t("未配置默认路由")}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">{t("来源：")}{preview.source}</p>
      {preview.note && <p className="mt-1 text-[11px] leading-5 text-rex-text-muted">{preview.note}</p>}
      {!preview.modelId && preview.byProtocol.some((item) => item.modelId) && (
        <ul className="mt-1 space-y-1 text-[11px] leading-5 text-rex-text-muted">
          {preview.byProtocol.map((item) => <li key={item.protocol} className="break-words [overflow-wrap:anywhere]">{item.protocol}：{item.modelId ? modelName(models, item.modelId) : t("无兼容候选")}</li>)}
        </ul>
      )}
    </div>
  );
}

export function AssignmentRow({ label, clientId = '', preview, models, disabled = false, onEdit, onRestore }: {
  label: string;
  clientId?: string;
  preview: AssignmentPreview;
  models: ModelOption[];
  disabled?: boolean;
  onEdit: () => void;
  onRestore?: () => void;
}) {
  return (
    <li aria-label={t("{value0}{label}分配", { value0: clientId ? `${clientId} ` : '', label: label })} className="grid min-w-0 gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[100px_minmax(0,1fr)_auto]">
      <p className="text-xs font-semibold leading-6">{label}</p>
      <AssignmentResult preview={preview} models={models} />
      <div className="flex flex-wrap items-start gap-2">
        <Button size="sm" variant="outline" disabled={disabled} onClick={onEdit}>{t("修改")}</Button>
        {onRestore && <Button size="sm" variant="ghost" onClick={onRestore}>{t("恢复继承")}</Button>}
      </div>
    </li>
  );
}
