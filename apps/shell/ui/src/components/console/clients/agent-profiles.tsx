'use client';

import { t } from '../../../i18n/t.mjs';
import { useEffect, useState } from 'react';
import { Badge, Button, Input, Modal, Panel } from '../console-ui';
import { readAgentProfiles, snapshotTargets, writeAgentProfiles } from './agent-profiles.mjs';

interface AgentProfile { name: string; targets: Record<string, string>; at?: string }

/** magpie 式方案：底部一行，保存当前所有 agent 目标，点击 chip 一键切回。 */
export function AgentProfiles({ selected, onApply }: { selected: Record<string, string>; onApply: (targets: Record<string, string>) => void }) {
  // 初始为空：SSR/hydration 阶段不能访问 window.localStorage，否则 "window is not defined"。
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<AgentProfile | null>(null);
  // 挂载后（仅客户端）从 localStorage 读取，避免服务端渲染与首帧不一致。
  useEffect(() => {
    setProfiles(readAgentProfiles((key: string) => window.localStorage.getItem(key)) as AgentProfile[]);
  }, []);

  const persist = (next: AgentProfile[]) => {
    setProfiles(next);
    writeAgentProfiles(next, (key: string, value: string) => window.localStorage.setItem(key, value));
  };
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || profiles.some((p) => p.name === trimmed)) return;
    const snapshot = snapshotTargets(selected) as AgentProfile;
    persist([...profiles, { ...snapshot, name: trimmed }]);
    setName(''); setNaming(false);
  };

  return (
    <Panel className="flex flex-wrap items-center gap-3 p-4">
      <span className="text-xs font-medium">{t("方案")}</span>
      {profiles.length === 0 && <span className="text-xs text-rex-text-muted">{t("还没有方案 · 保存当前设置，之后一键切回")}</span>}
      {profiles.map((profile) => (
        <button key={profile.name} type="button" onClick={() => setConfirm(profile)}
          className="flex items-center gap-1.5 rounded-rex-sm border border-rex-border bg-rex-panel px-2.5 py-1 text-xs hover:border-rex-cyan focus-visible:outline-2 focus-visible:outline-rex-cyan">
          {profile.name} <Badge tone="neutral">{Object.keys(profile.targets).length}</Badge>
        </button>
      ))}
      <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNaming(true)}>{t("+ 保存当前")}</Button>

      <Modal open={naming} onOpenChange={setNaming} title={t("保存为方案")} description={t("快照当前所有客户端的目标选择，之后可一键切回。方案保存在此浏览器。")}>
        <div className="space-y-3">
          <Input aria-label={t("方案名称")} placeholder={t("方案名称")} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNaming(false)}>{t("取消")}</Button><Button disabled={!name.trim()} onClick={save}>{t("保存方案")}</Button></div>
        </div>
      </Modal>
      <Modal open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }} title={t("应用方案「{value0}」？", { value0: confirm?.name || '' })} description={t("将把所有客户端的目标切回保存时的选择。仍需点各客户端的「应用默认目标」写入配置。")}>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>{t("取消")}</Button><Button onClick={() => { if (confirm) onApply(confirm.targets); setConfirm(null); }}>{t("应用方案")}</Button></div>
      </Modal>
    </Panel>
  );
}
