import { joinMarkdownSections, readClientMarkdownSource, readSharedMarkdownParts } from './shared.mjs';

export function renderGeminiNativeOutputs({ rootDir }) {
  return {
    operations: [
      {
        kind: 'markdown-block',
        targetPath: 'GEMINI.md',
        content: joinMarkdownSections([
          ...readSharedMarkdownParts(rootDir),
          readClientMarkdownSource(rootDir, 'gemini', 'AIOS.md'),
        ]),
      },
    ],
    managedTargets: ['GEMINI.md', '.gemini/skills'],
  };
}
