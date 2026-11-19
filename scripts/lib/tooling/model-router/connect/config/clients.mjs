// 中文注释：可就地接入网关的客户端单一事实源。CLI/GUI/测试共用，避免各处各抄一份白名单。
export const CONNECT_CLIENTS = Object.freeze([
  'claude', 'codex', 'pi', 'opencode', 'zcode', 'qoder', 'gemini', 'hermes', 'grok', 'workbuddy',
]);
