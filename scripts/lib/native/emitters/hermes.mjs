/* 中文注释：Hermes Agent native emitter — 生成 AGENTS.md + MCP 配置。 */
import { getClientInstructionFileName } from '../../clients/registry.mjs';
import { composeNativeMarkdown } from './compose.mjs';
import { readClientJsonSource } from './shared.mjs';

export function renderHermesNativeOutputs({ rootDir }) {
  return {
    operations: [],
    managedTargets: ['.hermes/skills'],
  };
}
