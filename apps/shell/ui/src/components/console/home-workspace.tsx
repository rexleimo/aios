'use client';

import { useT } from '../../i18n/provider';
import { clientLabel, landingTokenLabel, LANDING_TOKEN_EXPLANATION, type ConsoleFacts } from '../../lib/console-facts';
import type { NavId } from '../../lib/console-navigation';
import { Badge, Button, Heading, Modal, Panel, SmallTitle } from './console-ui';
import { AgentOverview } from './model-routing/agent-overview';
import { ClientManagement } from './clients/client-management';

export function HomeWorkspace({
  facts,
  navigate,
  active,
}: {
  facts: ConsoleFacts;
  navigate: (view: NavId) => void;
  active: boolean;
}) {
  const t = useT();
  return (
    <>
      <Heading
        eyebrow={t('home.eyebrow')}
        title={t('home.title')}
        description={t('home.description')}
      />
      {facts.degraded.length > 0 && (
        <Panel className="mb-7 border-rex-danger/40 p-5">
          <SmallTitle action={<Badge tone="danger">{t('home.degradedCount', { count: facts.degraded.length })}</Badge>}>{t('home.degradedTitle')}</SmallTitle>
          <ul className="space-y-2 text-xs leading-5 text-rex-text-muted">
            {facts.degraded.map((entry) => (
              <li key={entry.item}>
                <span className="font-medium text-rex-text">{entry.item}</span>：{entry.error}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <AgentOverview clients={facts.clients} issues={facts.issues} active={active} navigate={navigate} />
    </>
  );
}

export function ToolsWorkspace({
  facts,
  onMcp,
  selectedId,
  onSelect,
}: {
  facts: ConsoleFacts;
  onMcp: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  const selected = facts.clients.find((client) => client.clientId === selectedId);
  return (
    <>
      <ClientManagement facts={facts} onDetails={onSelect} />
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) onSelect(null);
        }}
        title={`${selected ? clientLabel(selected.clientId).name : t('nav.tools')} · ${t('home.detailsTitle')}`}
        description={t('home.detailsDesc')}
      >
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-[90px_1fr] gap-3 text-sm">
              <dt className="text-rex-text-muted">{t('home.configLanding')}</dt>
              <dd>{selected.installed ? `${selected.scopes.length} (${selected.scopes.map((s) => s.scope).join('、')})` : t('home.noneHere')}</dd>
              <dt className="text-rex-text-muted">{t('home.configFile')}</dt>
              <dd className="break-all">{selected.configFiles.join('\n') || t('home.none')}</dd>
              <dt className="text-rex-text-muted">{t('home.serviceCount')}</dt>
              <dd>{selected.services} {t('shell.serviceInstances')}</dd>
              <dt className="text-rex-text-muted">{t('home.landingCheck')}</dt>
              <dd>
                <ul className="space-y-1">
                  {selected.landingTokens.map((entry) => (
                    <li key={entry.scope}>
                      {entry.scope}：{landingTokenLabel(entry.token).label}
                      <span className="block text-[11px] text-rex-text-muted">
                        {entry.reason || LANDING_TOKEN_EXPLANATION[entry.token] || ''}
                      </span>
                    </li>
                  ))}
                  {selected.landingTokens.length === 0 && <li>{t('home.noLanding')}</li>}
                </ul>
              </dd>
              <dt className="text-rex-text-muted">{t('home.connectionTest')}</dt>
              <dd>{t('home.connectionTestDesc')}</dd>
            </dl>
            <div className="rounded-xl bg-rex-panel p-4 text-xs leading-6 text-rex-text-muted">
              {t('home.readSuccessNote')}
            </div>
            <Button
              onClick={() => {
                onSelect(null);
                onMcp();
              }}
            >
              {t('home.openMcp')}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
