import { useT } from '../../i18n/provider';
import type { PluginPanelUi } from '../../lib/console-facts';
import { Heading, Panel } from './console-ui';

export interface PluginPanelItem {
  id: string;
  href: string;
  label: string;
  title: string;
  source: string;
  ui?: PluginPanelUi;
}

/** 插件 panel：真实 HTML UI 走 sandboxed iframe；旧 manifest 与失败场景保留可诊断说明。 */
export function PluginPanelView({ item, active }: { item: PluginPanelItem; active: boolean }) {
  const t = useT();
  const ui = item.ui;
  return (
    <div hidden={!active}>
      <Heading
        eyebrow="PLUGIN PANEL"
        title={item.title}
        description={`${item.source}: ${t('shell.pluginPanel')}`}
      />
      {ui?.kind === 'html' && ui.error ? (
        <Panel className="max-w-2xl p-6">
          <h2 className="text-sm font-semibold">{t('shell.pluginPanel')}</h2>
          <p role="alert" className="mt-2 text-xs leading-6 text-rex-text-muted">{ui.error}</p>
        </Panel>
      ) : ui?.kind === 'html' && ui.html !== undefined ? (
        <iframe
          title={item.title}
          srcDoc={ui.html}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="h-[calc(100dvh-13rem)] min-h-[480px] w-full rounded-xl border border-rex-border bg-rex-panel"
        />
      ) : (
        <Panel className="max-w-2xl p-6">
          <h2 className="text-sm font-semibold">{t('shell.pluginPanel')}</h2>
          <p className="mt-2 text-xs leading-6 text-rex-text-muted">
            {t('shell.pluginDeclared', { source: item.source, href: item.href })}
          </p>
          <div className="mt-4 rounded-xl border border-rex-border bg-rex-panel/40 p-4 text-xs leading-6">
            <p className="font-medium">{t('shell.pluginContribution')}</p>
            <p className="mt-1 text-rex-text-muted">
              {t('shell.pluginEvidence')}
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
