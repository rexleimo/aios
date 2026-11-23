'use client';

import { t } from '../../../../i18n/t.mjs';
import { Button, Input } from '../../console-ui';

// A credential has exactly one active source at a time. Switching clears the
// other field so no stale key can silently take precedence at runtime.
export type CredentialMode = 'direct' | 'env' | 'inherit';

const MODE_LABELS: Record<CredentialMode, string> = {
  direct: t("直接填写"),
  env: t("环境变量引用"),
  inherit: t("继承供应商"),
};

export function CredentialSourceField({
  label,
  inputLabel,
  envInputLabel,
  mode,
  apiKey,
  apiKeyEnv,
  showKeys,
  allowInherit = false,
  onChange,
  onToggleShow,
}: {
  label: string;
  inputLabel: string;
  envInputLabel: string;
  mode: CredentialMode;
  apiKey: string;
  apiKeyEnv: string;
  showKeys: boolean;
  allowInherit?: boolean;
  onChange: (next: { mode: CredentialMode; apiKey: string; apiKeyEnv: string }) => void;
  onToggleShow: () => void;
}) {
  const modes: CredentialMode[] = allowInherit ? ['inherit', 'direct', 'env'] : ['direct', 'env'];
  const pick = (next: CredentialMode) => {
    if (next === mode) return;
    onChange({
      mode: next,
      apiKey: next === 'direct' ? apiKey : '',
      apiKeyEnv: next === 'env' ? apiKeyEnv : '',
    });
  };
  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("{label}来源", { label: label })}>
        {modes.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={mode === option ? 'default' : 'outline'}
            aria-pressed={mode === option}
            aria-label={t("{label}来源：{value1}", { label: label, value1: MODE_LABELS[option] })}
            onClick={() => pick(option)}
          >
            {MODE_LABELS[option]}
          </Button>
        ))}
      </div>
      {mode === 'direct' && (
        <div className="flex items-center gap-2">
          <Input
            type={showKeys ? 'text' : 'password'}
            aria-label={inputLabel}
            value={apiKey}
            placeholder={t("粘贴真实密钥")}
            onChange={(event) => onChange({ mode, apiKey: event.target.value, apiKeyEnv: '' })}
          />
          <Button type="button" variant="outline" aria-label={showKeys ? t("隐藏密钥") : t("显示密钥")} onClick={onToggleShow}>
            {showKeys ? t("隐藏") : t("显示")}
          </Button>
        </div>
      )}
      {mode === 'env' && (
        <Input
          aria-label={envInputLabel}
          value={apiKeyEnv}
          placeholder="env:MY_API_KEY"
          onChange={(event) => onChange({ mode, apiKey: '', apiKeyEnv: event.target.value })}
        />
      )}
      {mode === 'inherit' && (
        <p className="rounded-rex-sm border border-rex-border p-2 text-xs leading-5 text-rex-text-muted">
          
          {t("此账号不单独配置密钥，运行时继承供应商的密钥配置。")}
        </p>
      )}
    </div>
  );
}
