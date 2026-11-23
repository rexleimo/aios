'use client';

import { t } from '../../../i18n/t.mjs';
import { Button } from '../console-ui';

const PROTOCOLS = ['openai-chat', 'openai-response', 'claude', 'gemini'];

export function ModelSourceProtocols({
  value,
  available = [],
  onChange,
}: {
  value: string[];
  available?: string[];
  onChange: (next: string[]) => void;
}) {
  const protocols = [...new Set([...PROTOCOLS, ...available, ...value])];

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{t("支持协议")}</legend>
      <div className="flex flex-wrap gap-2">
        {protocols.map((protocol) => (
          <Button
            key={protocol}
            type="button"
            size="sm"
            variant={value.includes(protocol) ? 'default' : 'outline'}
            aria-pressed={value.includes(protocol)}
            onClick={() =>
              onChange(
                value.includes(protocol) ? value.filter((item) => item !== protocol) : [...value, protocol]
              )
            }
          >
            {protocol}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
