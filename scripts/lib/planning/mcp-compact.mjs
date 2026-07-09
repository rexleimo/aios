/**
 * A4 — MCP tool description compact mode (OpenViking-inspired).
 * Shrink list_tools descriptions so always-on planning + multi-MCP does not blow context.
 */

export const MCP_DESC_MODES = Object.freeze(['full', 'compact', 'minimal']);

/**
 * Resolve mode from env AIOS_MCP_TOOL_DESC or argument.
 */
export function resolveMcpDescMode(raw = process.env.AIOS_MCP_TOOL_DESC || 'full') {
  const mode = String(raw || 'full').trim().toLowerCase();
  if (mode === 'compact' || mode === 'minimal' || mode === 'lean') {
    return mode === 'lean' ? 'compact' : mode;
  }
  return 'full';
}

/**
 * @param {string} description
 * @param {'full'|'compact'|'minimal'} mode
 */
export function compactToolDescription(description = '', mode = 'full') {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (!text || mode === 'full') return text;
  const max = mode === 'minimal' ? 80 : 160;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Map tools array with optional compact descriptions.
 */
export function applyMcpToolDescriptionMode(tools = [], mode = resolveMcpDescMode()) {
  const resolved = resolveMcpDescMode(mode);
  if (resolved === 'full' || !Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!tool || typeof tool !== 'object') return tool;
    return {
      ...tool,
      description: compactToolDescription(tool.description, resolved),
      // keep inputSchema property descriptions in full mode only; compact does not strip schema
    };
  });
}
