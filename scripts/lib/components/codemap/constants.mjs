export const CRG_MCP_ALIAS = 'code-review-graph';
export const STATE_FILE_NAME = 'codemap.json';
export const STATE_DIR = '.aios';
export const CRG_DATA_DIR = '.code-review-graph';

export const AGENTS_MD_MARKERS = Object.freeze({
  begin: '<!-- AIOS CODEMAP BEGIN -->',
  end: '<!-- AIOS CODEMAP END -->',
});

export const CLIENT_INSTRUCTION_FILES = Object.freeze([
  Object.freeze({ clientKeys: ['codex', 'opencode', 'crush', 'hermes'], fileName: 'AGENTS.md' }),
  Object.freeze({ clientKeys: ['claude'], fileName: 'CLAUDE.md' }),
  Object.freeze({ clientKeys: ['gemini', 'antigravity'], fileName: 'GEMINI.md' }),
]);

export const CLIENT_MCP_ENTRY_OVERRIDES = Object.freeze({
  opencode: Object.freeze({ env: [] }),
});
