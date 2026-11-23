import { t } from '../../../i18n/t.mjs';
import { Badge } from '../console-ui';
import type { SkillActionReport } from './resource-types';

const STATUS: Record<string, string> = { installed: t("安装"), updated: t("更新"), removed: t("移除"), unchanged: t("无变化"), absent: t("不存在"),
  conflict: t("内容冲突"), external: t("外部持有"), linked: t("链接目录"), unverified: t("归属未验证"), error: t("失败") };

export function SkillResults({ report, preview }: { report: SkillActionReport; preview: boolean }) {
  return (
    <section aria-label={preview ? t("技能操作预览") : t("技能操作结果")} className="space-y-3 rounded-rex-lg border border-rex-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {preview ? t("预览（尚未写入）") : t("执行结果")}<Badge tone={report.ok ? 'info' : 'danger'}>{report.ok ? t("返回成功") : t("操作受阻")}</Badge>
      </h3>
      {report.error && <p role="alert" className="break-words text-xs text-rex-danger">{report.error === 'preview-stale' ? t("预览已过期，未按旧预览执行。请重新预览并确认。") : report.error}</p>}
      {report.revision && <p className="break-all font-rex-mono text-[10px] text-rex-text-muted">{t("预览版本：")}{report.revision}</p>}
      <ul className="space-y-3 text-xs">
        {(report.results ?? []).map((row, index) => (
          <li key={`${row.client}/${row.target}/${index}`} className="space-y-1 border-t border-rex-border pt-3">
            <p className="font-medium">{row.name} · {row.client} · {row.scope} · {preview ? t("计划：") : ''}{STATUS[row.status] ?? row.status}</p>
            <p className="break-all text-rex-text-muted">{t("落点：")}{row.target}</p>
            {row.reason && <p className="break-words text-rex-danger">{t("原因：")}{row.reason}</p>}
            <p className="break-words text-rex-text-muted">{t("共享此落点的客户端：")}{row.affectedClients.join('、') || t("未记录")}</p>
            {row.backup && <p className="break-all text-rex-text-muted">{t("备份：")}{row.backup}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
