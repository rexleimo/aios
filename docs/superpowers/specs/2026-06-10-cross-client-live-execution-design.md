# 全客户端真正适配执行 — 设计文档

> 日期: 2026-06-10
> 范围: cross-client live execution, focused on `crush` and `antigravity`

## 背景

目标不是“让 6 个客户端都出现在配置里”，而是让运行时行为与真实 CLI 契约一致。

这一轮复核后得到两个关键事实：

- `crush` 的真实非交互用法是 `crush run [prompt...]`
- `antigravity` 目前没有本机安装与 smoke evidence，因此只能保留占位状态

## 设计原则

1. 真实 CLI 优先于类比实现
2. 未验证客户端必须显式 `pending-smoke`
3. 阻断要覆盖所有执行入口，不只覆盖 `ctx-agent`
4. 文档必须反映真实状态，不能把“未来打算”写成“当前能力”

## 当前设计

### Crush

- one-shot: `crush run <prompt>`
- subagent/harness strategy: `run` 子命令风格
- smoke probe:
  - help: `crush run --help`
  - task: `crush run "reply with OK"`

### Antigravity

- 不注册 live one-shot handler
- 不注册 harness/subagent invocation strategy
- 不声明 unattended args
- 不加入自动 smoke probe

### Pending-smoke gating

`pending-smoke` 必须同时挡住：

- `ctx-agent` one-shot
- harness/subagent runtime

否则会出现“表面未启用，实际仍可执行”的错误状态。

## 本轮已修正的问题

- 修正了 `crush` 的错误 `-p` 假设
- 把 `crush` smoke 改为真实 `run` 契约
- 给 subagent runtime 加上 `pending-smoke` 阻断
- 修复了 workspace memory session id 被对象参数污染的问题

## 后续放开条件

只有同时满足以下条件，才允许放开 `antigravity`：

1. 本机已安装可执行 CLI
2. 已采集 `--help` / 非交互调用证据
3. 已核实技能根、指令文件、MCP 配置路径
4. 已补 smoke probe
5. 已通过对应测试

## 非目标

本轮不做这些事：

- 不宣称 `antigravity` 已支持 live execution
- 不凭猜测补回 `--yolo` / `-p` / handler
- 不修改 capability rollout 到 supported

## 当前结论

- `crush`: 已修正为真实 CLI 契约，可继续保持 gated-until-smoke 的保守策略
- `antigravity`: 继续 placeholder-only，等待真实证据
