import { joinMarkdownSections, readClientMarkdownSource, readSharedMarkdownParts } from './shared.mjs';

export function renderOpencodeNativeOutputs({ rootDir, selectedClients = ['opencode'] }) {
  const codexSelected = new Set(selectedClients).has('codex');
  const operations = codexSelected
    ? []
    : [
        {
          kind: 'markdown-block',
          targetPath: 'AGENTS.md',
          content: joinMarkdownSections([
            ...readSharedMarkdownParts(rootDir),
            readClientMarkdownSource(rootDir, 'opencode', 'AIOS.md'),
          ]),
        },
      ];
  const managedTargets = codexSelected
    ? ['.opencode/skills']
    : ['AGENTS.md', '.opencode/skills'];

  return {
    operations,
    managedTargets,
  };
}
