'use client';

import { t } from '../../i18n/t.mjs';
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import type { ConsoleFacts } from '../../lib/console-facts';
import { McpWorkspace } from './mcp-workspace';
import { AgentsPanel } from './resources/agents-panel';
import { SkillsPanel } from './resources/skills-panel';

export function ResourcesWorkspace({ facts }: { facts: ConsoleFacts }) {
  const [visited, setVisited] = useState({ skills: false, agents: false });
  return (
    <Tabs.Root defaultValue="mcp" onValueChange={value => {
      if (value === 'skills' || value === 'agents') setVisited(current => ({ ...current, [value]: true }));
    }}>
      <Tabs.List aria-label={t("资源库分类")} className="mb-6 flex gap-1 rounded-rex-lg border border-rex-border bg-rex-panel p-1">
        {[['mcp', 'MCP'], ['skills', 'Skills'], ['agents', 'Subagents']].map(([value, label]) => (
          <Tabs.Trigger key={value} value={value} className="rounded-rex-sm px-4 py-2 text-sm text-rex-text-muted data-[state=active]:bg-rex-bg data-[state=active]:font-semibold data-[state=active]:text-rex-text focus-visible:outline-2 focus-visible:outline-rex-cyan">
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="mcp" forceMount className="data-[state=inactive]:hidden"><McpWorkspace facts={facts} /></Tabs.Content>
      <Tabs.Content value="skills" forceMount className="data-[state=inactive]:hidden">{visited.skills && <SkillsPanel />}</Tabs.Content>
      <Tabs.Content value="agents" forceMount className="data-[state=inactive]:hidden">{visited.agents && <AgentsPanel />}</Tabs.Content>
    </Tabs.Root>
  );
}
