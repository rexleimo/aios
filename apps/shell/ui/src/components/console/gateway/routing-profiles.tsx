'use client';

import { t } from '../../../i18n/t.mjs';
import { useEffect, useState } from 'react';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { Button, InlineFeedback, Input, Modal, Panel, SmallTitle, type Feedback } from '../console-ui';
import type { RoutingEditable } from '../model-routing/use-routing-config';
import { migrateEditableTargets, serializeTargetRef } from '../../../lib/config/model-routing.mjs';

type Profile = { name: string; matrix: RoutingEditable['matrix']; targetRefVersion?: number };
const STORAGE_KEY = 'aios.profiles';

function validMatrix(value: unknown): value is RoutingEditable['matrix'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const matrix = value as RoutingEditable['matrix'];
  const validMap = (map: unknown) =>
    !!map &&
    typeof map === 'object' &&
    !Array.isArray(map) &&
    Object.values(map).every((entry) => typeof entry === 'string');
  return (
    validMap(matrix.default) &&
    !!matrix.clients &&
    typeof matrix.clients === 'object' &&
    !Array.isArray(matrix.clients) &&
    Object.values(matrix.clients).every(validMap)
  );
}

export function RoutingProfiles({
  matrix,
  modelIds = [],
  targetIds,
  onApply,
}: {
  matrix: RoutingEditable['matrix'];
  modelIds?: string[];
  targetIds?: string[];
  onApply: (value: RoutingEditable['matrix']) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<{ kind: 'apply' | 'delete'; profile: Profile } | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (
        !Array.isArray(value) ||
        !value.every((entry) => typeof entry?.name === 'string' && validMatrix(entry.matrix))
      )
        throw new Error(t("本地方案数据格式不正确，未自动覆盖。"));
      setProfiles(value);
      setStorageReady(true);
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : t("无法读取本地方案。") });
    }
  }, []);
  function persist(next: Profile[]) {
    if (!storageReady) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setProfiles(next);
      return true;
    } catch {
      setFeedback({ tone: 'error', text: t("浏览器存储不可用，方案没有保存。") });
      return false;
    }
  }

  return (
    <Panel className="p-5 sm:p-6">
      <SmallTitle
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={!storageReady}
            onClick={() => {
              setName('');
              setSaving(true);
            }}
          >
            <Plus size={13} />
            
            {t("保存为方案")}
          </Button>
        }
      >
        
        {t("角色覆盖方案")}
      </SmallTitle>
      <p className="mb-4 text-xs leading-6 text-rex-text-muted">
        
        {t("仅快照全局与客户端角色覆盖，不包含普通对话默认、客户端普通对话例外、供应商、密钥或意图规则。方案保存在此浏览器，不与 CLI\r\n        同步；应用只更新草稿。")}
      </p>
      <div className="space-y-2">
        {profiles.length === 0 && (
          <p className="text-xs text-rex-text-muted">
            
            {t("还没有方案。可以把当前草稿的角色覆盖保存为一个命名方案。")}
          </p>
        )}
        {profiles.map((profile) => (
          <div
            key={profile.name}
            className="flex items-center gap-3 rounded-rex-sm border border-rex-border px-3 py-2"
          >
            <Bookmark size={14} className="shrink-0 text-rex-text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{profile.name}</span>
            <Button size="sm" variant="outline" onClick={() => setSelected({ kind: 'apply', profile })}>
              
              {t("应用到草稿")}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("删除方案 {value0}", { value0: profile.name })}
              onClick={() => setSelected({ kind: 'delete', profile })}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <InlineFeedback feedback={feedback} />
      </div>
      <Modal
        open={saving}
        onOpenChange={setSaving}
        title={t("保存角色覆盖方案")}
        description={t("快照当前草稿中的角色覆盖。保存方案不会写入网关配置。")}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            if (profiles.some((profile) => profile.name === trimmed)) {
              setFeedback({ tone: 'error', text: t("方案名称已存在，请换一个名称。") });
              return;
            }
            if (persist([...profiles, { name: trimmed, matrix: structuredClone(matrix), targetRefVersion: 1 }])) {
              setSaving(false);
              setFeedback({ tone: 'ok', text: t("角色覆盖方案已保存在此浏览器。") });
            }
          }}
          className="space-y-4"
        >
          <Input
            aria-label={t("方案名称")}
            placeholder={t("例如 日常开发")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
          <InlineFeedback feedback={feedback?.tone === 'error' ? feedback : null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSaving(false)}>
              
              {t("取消")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              
              {t("保存方案")}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={t("{value0}方案「{value1}」？", { value0: selected?.kind === 'delete' ? t("删除") : t("应用"), value1: selected?.profile.name || '' })}
        description={
          selected?.kind === 'delete'
            ? t("从此浏览器移除方案，不影响当前草稿或已保存的网关配置。")
            : t("将替换草稿中的全局与客户端角色覆盖，其他设置保持不变。仍需保存全部修改才生效。")
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setSelected(null)}>
            
            {t("取消")}
          </Button>
          <Button
            variant={selected?.kind === 'delete' ? 'danger' : 'default'}
            onClick={() => {
              if (!selected) return;
              if (selected.kind === 'delete') {
                if (!persist(profiles.filter((profile) => profile.name !== selected.profile.name))) return;
              } else {
                try {
                  // Leave stored legacy profiles untouched; their unversioned strings are literal model IDs.
                  const migratedMatrix: RoutingEditable['matrix'] = migrateEditableTargets(selected.profile).matrix;
                  const available = new Set(targetIds ?? modelIds.map((id) => serializeTargetRef({ kind: 'model', id })));
                  const refs = [...Object.values(migratedMatrix.default), ...Object.values(migratedMatrix.clients).flatMap(Object.values)];
                  if (refs.some((ref) => ref && ref !== 'auto' && !available.has(ref))) {
                    throw new Error(t("包含当前不可用的模型或模型组，请先补充或启用模型来源。"));
                  }
                  onApply(structuredClone(migratedMatrix));
                  setFeedback({ tone: 'ok', text: t("方案已应用到草稿，尚未写入配置。") });
                } catch (error) {
                  setFeedback({ tone: 'error', text: t("方案未应用：{value0}", { value0: error instanceof Error ? error.message : t("目标引用无效。") }) });
                }
              }
              setSelected(null);
            }}
          >
            
            {t("确认")}{selected?.kind === 'delete' ? t("删除") : t("应用")}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}
