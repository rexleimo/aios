import fs from 'node:fs/promises';
import { z } from 'zod';

import { defaultProviders } from './providers/index.mjs';

const ProviderSchema = z.object({
  cmd: z.string().min(1),
  args: z.array(z.string()).default([]),
  stdin: z.boolean().default(true),
  output: z.enum(['text', 'json']).default('text'),
  env: z.record(z.string()).default({}),
});

export const HarnessConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  runRootDir: z.string().min(1).default('.harness'),
  runsDir: z.string().min(1).default('runs'),
  humanGate: z.object({
    enabled: z.boolean().default(true),
  }).default({ enabled: true }),
  providers: z.record(ProviderSchema).default(() => defaultProviders()),
});

export async function loadHarnessConfig({ configPath } = {}) {
  const rawText = await fs.readFile(configPath, 'utf8');
  const json = JSON.parse(rawText);
  const parsed = HarnessConfigSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
    throw new Error(`Invalid harness config at ${configPath}:\n${message}`);
  }
  return parsed.data;
}
