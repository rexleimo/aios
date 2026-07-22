import {
  getClientInstructionFileName,
  getClientNativeProjectSourceFile,
} from '../../clients/registry.mjs';

import {
  joinMarkdownSections,
  readClientMarkdownSource,
  readNativePartials,
} from './shared.mjs';

// Keep the compact shared core deterministic across every AGENTS.md client.
const ALWAYS_LOADED_PARTIALS = Object.freeze(['core-instructions.md']);

// Append a project overlay only for a client-specific instruction file.
export function composeNativeMarkdown({ rootDir, client }) {
  const sharedSections = readNativePartials(rootDir, ALWAYS_LOADED_PARTIALS);
  // AGENTS.md is shared, so client-specific manuals cannot be included here.
  if (getClientInstructionFileName(client) === 'AGENTS.md') {
    return joinMarkdownSections(sharedSections);
  }

  const projectSource = readClientMarkdownSource(rootDir, client, getClientNativeProjectSourceFile(client));
  return joinMarkdownSections([...sharedSections, projectSource]);
}
