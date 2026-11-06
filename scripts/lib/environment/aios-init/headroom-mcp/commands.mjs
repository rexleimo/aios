// scripts/lib/environment/aios-init/headroom-mcp/commands.mjs — headroom MCP 条目的**形状**（唯一所有者）。
//
// w5c（2026-11-05，人拍“AIOS 自写”）之后，这个模块不再构造厂商 CLI 调用：
//   旧的 `buildHeadroomMcpAddInvocation` / `buildHeadroomMcpRemoveInvocation` 已被删除，
//   因为注册/注销现在走通用写路径（`clients/mcp/server-writer.mjs`）。
//   留着它们等于留第二套“怎么注册 headroom”的说法：一套写文件、一套 spawn 厂商 CLI，
//   而后者正是 `missing-runner`（生产没注入 runner ⇒ 永远 failed）与假握手（`probeImpl` 默认报 registered）的栖身处。
import path from 'node:path';

const SERVER_NAME = 'headroom';

export const HEADROOM_MCP_SERVER_NAME = SERVER_NAME;

const RUNTIME_COMMANDS = Object.freeze({
  'gemini-cli': 'gemini',
  'hermes-agent': 'hermes',
  'grok-build': 'grok',
});

/**
 * AIOS 想写进客户端配置的那条条目（规范形状，不含任何客户端方言）。
 * 客户端方言（gemini 的 `timeout`、grok 的 env 子表、hermes 的 `enabled`/`tools`）由
 * 落点表 + 写路径决定，见 `lifecycle.mjs` 的 `toHeadroomLandingEntry`。
 */
export function buildDesiredHeadroomEntry(runtimeId, headroomPath) {
  if (!RUNTIME_COMMANDS[runtimeId]) throw new Error(`Unsupported Headroom MCP runtime: ${runtimeId}`);
  if (!headroomPath || !path.isAbsolute(String(headroomPath))) throw new Error('Headroom executable must be absolute');
  return Object.freeze({
    command: String(headroomPath),
    args: Object.freeze(['mcp', 'serve']),
    env: Object.freeze({ HEADROOM_MCP_CLIENT: runtimeId, HEADROOM_MCP_READ: 'off' }),
  });
}