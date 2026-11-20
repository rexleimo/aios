// core/ports.mjs — 依赖倒置的端口定义（纯契约，无实现）。
// 领域层定义它需要的外部能力；外层 adapter 实现这些端口并注入。
//
// 端口（每个都是普通函数签名，不 import 任何外层模块）：
//   validateIntegration(id, raw) -> normalized integration   // 由 integrations adapter 提供真实硬门
//   writeIntegrationEntry(id, normalized) -> void            // 真的写 config/integrations.json
//   removeIntegrationEntries(source) -> void                 // 按来源移除（sidecar 记录，不污染领域对象）
//   resolveProviderSource(pluginId, entry) -> string         // 插件 provider 脚本路径
//   runProviderRpc(source, method, params) -> object         // 子进程 RPC
//   registerAction(action) -> void
//   registerClientKind(kind) -> void
//   applyMiddleware(body, ctx, hooks) -> body
//   onUsage(row) -> void
//
// 网关层不 import 本目录；它通过 createGatewayServer({ pluginHooks }) 接受一个满足上述端口的对象。

export const CONTRIBUTION_KINDS = Object.freeze([
  'panels', 'integrations', 'providers', 'actions', 'middleware', 'clients', 'onUsage',
]);
