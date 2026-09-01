/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
const MAX_DESCRIPTION_CHARS = 180;

/* 中文注释：工具列表压缩保留“能不能调用”和“是否危险”两类信息，完整 schema 需要时再看上游文档。 */
export function shrinkToolsList(result) {
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return {
    tools: tools.map(shrinkTool),
    fullCatalogRequired: tools.some(tool => isLargeToolDefinition(tool)),
  };
}

/* 中文注释：每个工具只留下调用决策需要的字段，避免庞大的 JSON Schema 被直接注入模型上下文。 */
function shrinkTool(tool) {
  const schema = tool?.inputSchema ?? tool?.input_schema ?? {};
  const properties = schema?.properties && typeof schema.properties === 'object'
    ? Object.keys(schema.properties)
    : [];
  return {
    name: String(tool?.name || ''),
    description: compactDescription(tool?.description || ''),
    required: Array.isArray(schema?.required) ? schema.required.map(String) : [],
    optional: properties.filter(name => !(schema?.required || []).includes(name)),
    safety: explicitSafetyNotes(tool),
  };
}

/* 中文注释：描述用于路由，不用于当完整文档；超长描述截断能显著降低启动上下文。 */
function compactDescription(description) {
  const oneLine = String(description).replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_DESCRIPTION_CHARS
    ? `${oneLine.slice(0, MAX_DESCRIPTION_CHARS - 1)}...`
    : oneLine;
}

/* 中文注释：安全提示只读工具显式声明的字段（safetyNotes / mutation），
 * 不靠扫描名字/描述里的关键词猜"这个工具危险"。是否危险由工具 schema 声明、
 * 模型自行判断，程序只透传显式信息，避免把名字里带 delete/write 的正常工具误判。 */
function explicitSafetyNotes(tool) {
  const notes = Array.isArray(tool?.safetyNotes)
    ? tool.safetyNotes.map(String)
    : Array.isArray(tool?.safety_notes)
      ? tool.safety_notes.map(String)
      : [];
  if (typeof tool?.mutation === 'string' && tool.mutation.trim()) notes.push(tool.mutation.trim());
  return notes;
}

/* 中文注释：大 schema 不直接返回，但用 fullCatalogRequired 告诉调用方“这里有被压缩过的完整定义”。 */
function isLargeToolDefinition(tool) {
  return Buffer.byteLength(JSON.stringify(tool ?? {}), 'utf8') > 1024;
}
