import { ALL_CLIENTS } from '../../clients/core/definitions.mjs';
import { getClientInstructionFileName } from '../../clients/native/index.mjs';

export const CRG_MCP_ALIAS = 'code-review-graph';
export const STATE_FILE_NAME = 'codemap.json';
export const STATE_DIR = '.aios';
export const CRG_DATA_DIR = '.code-review-graph';

export const AGENTS_MD_MARKERS = Object.freeze({
  begin: '<!-- AIOS CODEMAP BEGIN -->',
  end: '<!-- AIOS CODEMAP END -->',
});

// CRG 指令区块落哪个文件，按注册表的 instructionFileName 分组派生（组序/成员序=注册表顺序）。
function clientsByInstructionFile() {
  const groups = new Map();
  for (const client of ALL_CLIENTS) {
    const fileName = getClientInstructionFileName(client);
    if (!groups.has(fileName)) groups.set(fileName, []);
    groups.get(fileName).push(client);
  }
  return [...groups].map(([fileName, clientKeys]) => Object.freeze({
    clientKeys: Object.freeze(clientKeys),
    fileName,
  }));
}

export const CLIENT_INSTRUCTION_FILES = Object.freeze(clientsByInstructionFile());

export const CLIENT_MCP_ENTRY_OVERRIDES = Object.freeze({
  opencode: Object.freeze({ env: [] }),
});
