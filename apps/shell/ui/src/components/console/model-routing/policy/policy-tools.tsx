'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { Button, Modal } from '../../console-ui';
import { RoutingProfiles } from '../../gateway/routing-profiles';
import type { RoutingController } from '../use-routing-config';

export function PolicyTools({ routing }: { routing: RoutingController }) {
  const [profiles, setProfiles] = useState(false);
  if (!routing.editable) return null;
  return <>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><Button size="sm" variant="outline" aria-label="策略工具"><MoreHorizontal size={15} />工具</Button></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 max-w-[calc(100vw-2rem)] rounded-rex-md border border-rex-border bg-rex-bg p-1 shadow-lg">
          <DropdownMenu.Item onSelect={() => setProfiles(true)} className="cursor-pointer rounded-rex-sm px-3 py-2 text-xs text-rex-text outline-none focus:bg-rex-panel">角色覆盖方案（仅角色矩阵）</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <Modal open={profiles} onOpenChange={setProfiles} title="角色覆盖方案" description="仅快照角色矩阵；不包含普通对话默认、客户端普通对话例外或意图分流。">
      <RoutingProfiles matrix={routing.editable.matrix} modelIds={routing.models.map((model) => model.id)} targetIds={routing.targets.map((target) => target.id)} onApply={(matrix) => routing.setEditable((previous) => previous ? { ...previous, matrix } : previous)} />
    </Modal>
  </>;
}
