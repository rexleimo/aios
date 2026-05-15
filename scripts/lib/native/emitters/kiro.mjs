import { joinMarkdownSections, readClientJsonSource, readClientMarkdownSource, readSharedMarkdownParts } from './shared.mjs';

function replaceRootPlaceholders(value, rootDir) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceRootPlaceholders(item, rootDir));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceRootPlaceholders(item, rootDir)]));
  }
  if (typeof value === 'string') {
    return value.replace(/\{\{ROOT_DIR\}\}/g, rootDir);
  }
  return value;
}

export function renderKiroNativeOutputs({ rootDir }) {
  const mcpTemplate = replaceRootPlaceholders(readClientJsonSource(rootDir, 'kiro', 'mcp.json'), rootDir);

  return {
    operations: [
      {
        kind: 'managed-file',
        targetPath: '.kiro/steering/AIOS.md',
        content: joinMarkdownSections([
          ...readSharedMarkdownParts(rootDir),
          readClientMarkdownSource(rootDir, 'kiro', 'steering.md'),
        ]),
      },
      {
        kind: 'json-merge-object',
        targetPath: '.kiro/settings/mcp.json',
        targetKey: 'mcpServers',
        content: mcpTemplate,
      },
    ],
    managedTargets: ['.kiro/steering/AIOS.md', '.kiro/settings/mcp.json', '.kiro/agents', '.kiro/skills'],
  };
}
