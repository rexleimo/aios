// apps/shell/ui/lib/labels.ts — 轴与证据标志的中文名。
//
// 为什么不放在 matrix-table.tsx 里：那个模块带 `'use client'`，服务端组件 import 它的
// 常量拿到的是客户端引用代理（实测：轴名退化成英文原文、证据列表渲染成空串）。
// 词表是数据，不是交互，所以它住在两边都能安全 import 的无指令模块里。
//
// 轴标识本身的所有者是 `scripts/client-capability-scorecard.mjs` 的 `CAPABILITY_AXES`；
// 这里只登记展示名，缺一个就少一个标签，不会多出假轴。

export const AXIS_LABEL: Record<string, string> = {
  sessionStartInjection: '会话注入',
  preToolRewrite: '请求改写',
  controlledShellRunner: '受控运行',
  mcpProxy: 'MCP 代理',
  compactPacket: '紧凑包',
  advisorySkills: '技能建议',
  metrics: '度量',
};

export const EVIDENCE_LABEL: Record<string, string> = {
  'pending-smoke': '待 smoke',
  'compatibility-only': '仅兼容层',
  'evidence-blocked': '证据阻断',
  'not-covered': '未覆盖',
};
