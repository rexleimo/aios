import { searchAiosProject } from './unified-search.mjs';

function renderText(payload) {
  const lines = [
    `AIOS search: ${payload.query}`,
    `Workspace: ${payload.workspaceRoot}`,
    `Sources: ${payload.sources.join(', ')}`,
    '',
  ];
  if (payload.results.length === 0) {
    lines.push('No matches.');
    return `${lines.join('\n')}\n`;
  }
  payload.results.forEach((item, index) => {
    const location = item.path || item.eventId || item.title || '';
    lines.push(`${index + 1}. [${item.source}/${item.kind}] ${location}`);
    if (item.text) lines.push(`   ${item.text}`);
  });
  return `${lines.join('\n')}\n`;
}

export async function runSearchCommand(options = {}, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const payload = await searchAiosProject(rootDir, {
    query: options.query,
    limit: options.limit,
    sources: options.sources,
    scope: options.scope,
    agent: options.agent,
    space: options.space,
    mode: options.mode,
    maxCharsPerMemory: options.maxCharsPerMemory,
    maxTotalChars: options.maxTotalChars,
  });

  if (options.json || options.format === 'json') {
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    stdout.write(renderText(payload));
  }

  return { exitCode: 0 };
}
