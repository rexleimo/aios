import { joinMarkdownSections, readClientMarkdownSource, readSharedMarkdownParts } from './shared.mjs';

export function renderOpencodeNativeOutputs({ rootDir }) {
  return {
    operations: [
      // OpenCode reads AGENTS.md (managed by Codex emitter) and GEMINI.md.
      // No separate AIOS.md file needed — shared content is already in AGENTS.md.
    ],
    managedTargets: ['.opencode/skills'],
  };
}
