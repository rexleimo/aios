# AIOS 网关 × magpie 产品形态 全量对齐计划

## 北极星
把 AIOS 本地 LLM 网关与控制面的体验对齐到 magpie（https://usemagpie.ai/）的产品形态：
每个 agent 一行 → 点击模型直接切换 → 供应商一次添加 → 隐私遮蔽 → Usage 可观测 → Profiles 一键切换 → TUI/CLI → 订阅共享。

## 已完成（本会话及此前）
- P0 透传/路由/协议翻译/可用性/流式硬切
- P1 供应商注册表 + 客户端×角色矩阵 + GUI 设置面
- P2 请求级路由 + HTTP 入口 + 流式翻译 + 脱敏
- P3 编排器网关执行器
- P4 GUI 供应商面板 + 角色矩阵表
- ADR 0010 就地外科改写真实配置（magpie 式接入）
- magpie 式 per-agent ModelPicker + Profiles + Usage 聚合
- 隐私遮蔽基础 + 网关请求/响应/流式接入

## 剩余工作项图

### WI-1 供应商订阅与导入（高优先）
- 订阅登录即 provider：Claude/ChatGPT/Copilot/Gemini sign-in → provider 条目
- 从 claude settings.json / codex config.toml 导入供应商（只读、不改原文件）
- 测试连接（Test it）+ 模型发现（已有 refreshModels，扩展到订阅）
- 验收：`aios model-router providers import` + GUI「导入」按钮

### WI-2 路由组与规则（高优先）
- routing groups：多模型/账号 behind 一个 name，Smart/In order/... 策略
- Rules：long/image/reasoning/agent/folder/hours/intent/compact
- intent classifier 接入（已有 intent.mjs，补 group 级）
- nested groups + groups-in-groups（防环）
- 验收：`magpie` 风格 `group add/set/rule` CLI + GUI Routing tab

### WI-3 Usage 深化
- 网关记录 tokens/cost/cache（扩展 decision log schema）
- Usage tab：Today/7d/30d/All 聚合、图表、per agent/model
- Context window 分析（system/tool/instruction/files/conversation）
- 验收：Usage 面板展示 tokens + cost + cache hit

### WI-4 Streaming masking 完善
- 已完成基础；补 SSE 文本字段级还原测试
- 已完成

### WI-5 TUI/CLI 对齐
- `aios model-router ls/providers/model set/profiles/usage` 命令族
- `aios model-router tui`（终端 UI）
- 验收：CLI 可完成全部 magpie 基础操作

### WI-6 Menu bar / Tray / Daemon
- 托盘图标 + 快速切换
- daemon 模式（serve + web）
- 验收：`aios ui --tray`

### WI-7 订阅共享与多账号
- 多账号 per provider、Smart 路由（reset-aware）
- 验收：多账号 failover 测试

## 执行顺序
WI-1 → WI-2 → WI-3 → WI-5 → WI-6 → WI-7（WI-4 已完成）

## 验收总门
- 全量测试套件通过
- typecheck + build 通过
- 手动冒烟：启动网关 → 接入 claude → 切换模型 → 遮蔽生效 → Usage 显示