---
title: v5.10.0 — 发布可信与仓库减负：回归全绿、门禁加固、供应链钉死
date: 2026-09-06
description: "v5.10.0 不发布新特性，专修可信：Windows 回归套件首次全绿、v5.9.0 白跑事故的制度化修复、全部 GitHub Actions 按 SHA 钉死并加上 gitleaks 与 npm audit 门禁、461 个可再生成文件出库、提示词撰写规范落地。"
---

# v5.10.0 — 发布可信与仓库减负：回归全绿、门禁加固、供应链钉死

> 2026-09-06 · 一个不发新特性、专修"可信"的版本

## 为什么发这个版本

v5.10.0 没有新特性。它来自一次发布前的全量审计：把近期变更和整个项目材料里的优点缺点逐条核实（子代理逐文件比对 file:line 证据），然后只做一类事——**让既有承诺变真**。

审计结论先说：清单里没有虚构，但有 3 处低估了我们自己（evidence 回执校验早已存在、merge-gate 本就是代码级 block、model-router 已部分接线）。真正的问题集中在三处：**验证闭环靠提示词约定、Windows 两个"习惯性红测"、发布证据的时序陷阱**。

## 核心变更

### 1. Windows 回归套件首次全绿

两个慢性红测（orchestrator agent 导出 drift guard、codemap 指令 drift guard）的根因不是代码漂移，而是 Windows `core.autocrlf` 检出 CRLF 工作树、生成器产出 LF 的伪影。修复分三层：

- drift guard 对比前做行尾归一化（守卫的是内容漂移，不是平台字节）；
- `.gitattributes` 把 `agent-sources/**`、`scripts/lib/specs/*.json`、根指令文件钉为 LF；
- codemap 注入器在"无变化"判定上也做归一化，不再因行尾把整个文件重写一遍。

从此 Windows 本地跑 `npm run test:scripts` 与 Linux CI 过同一套门，且跑测试不再弄脏生成的 spec 文件。

### 2. 发布证据门的时序修复（v5.9.0 白跑事故的制度化）

v5.9.0 发布时踩过：证据提交只在本地 main、tag 指向旧 commit，CI 全量测试跑完才在证据门失败——整轮白跑。这次：

- release 工作流把"变更 Skill 训练证据"门**前移到全量测试之前**（快速失败）；
- `release-preflight.sh` 在 `docs/evidence/skill-training/` 存在未提交变更时**拒绝通过**，并直接输出 annotated tag 的确切命令——证据必须在被 tag 的 commit 里，而不是只在工作树。

### 3. 供应链钉死

- 全部 GitHub Actions（checkout / setup-node / upload-artifact / cache / pages 全家桶 / github-script / CodeQL）从 `@v4` 这类浮动引用改为**完整 commit SHA**；
- ci-main 新增 **gitleaks** 密钥扫描 job；
- 根目录与 mcp-server 新增 `npm audit --omit=dev --audit-level=critical` 门（当前基线 0 critical，已有的 high 有专门跟踪，不在本版阻塞）；
- `windows-shell-smoke` 从 `npm install` 改为 `npm ci`。

### 4. 仓库减负 461 个文件

`pptx-ai-coding-share` 把 351 个 node_modules 文件提交进了 git；`.cache/` 里 110 个 mkdocs 字体同样如此——都可再生成。全部出库并正确 ignore；根目录 4 个调试日志删除。附带修掉一个自相矛盾：根 `opencode.json` 被 native sync 生成、有测试断言其形态，却同时出现在 ignore 规则里——保留跟踪、删过时规则。

### 5. 提示词撰写规范落地

这是本版最重要的软性资产。此前多次踩坑：提示词里用大量正则和硬编码判断去猜模型/用户意图，而不是用提示词引导模型。规范固化为一句话判据 + 三条规则：

> **代码只校验客观事实（退出码、sha256、schema）；猜测意图（关键词表、正则、语义分类）都是反模式。**

1. **契约优先**：SKILL 声明输入前提与结构化输出契约，路由靠模型显式声明 `intent`/`task-type` 字段查表，不靠关键词分支；
2. **自报告而非猜测**：语义判断（完成？卡住？只读？）写成模型在结构化输出里自报告的字段（ReAct 式），代码只计数校验；
3. **硬门槛即验证协议**：保证类声明（测试通过、证据存在）必须落成 evidence 引用真实执行回执，提示词礼貌不能替代 runtime 门禁。

全文见 `docs/prompt-authoring-norms.md`，rex-harness 子模块同步 `skill-sources/PROMPT-AUTHORING.md`，AGENTS.md 注入精简条款。

### 6. 叙事对齐

AGENTS.md 仍写着仓库"以浏览器自动化为中心"——README 却只字未提浏览器；mkdocs 四语言站点描述还是上一代"Graph Engine"叙事。全部统一为：**AIOS 是套在编码客户端之上的本地优先编排控制平面**（记忆、路由、多 Agent、可恢复长任务、可验证证据），浏览器 MCP 是其中的 legacy 组件。

## 升级说明

- 无破坏性行为变更：本版以 CI、文档与仓库卫生为主。
- CI 现在会对 critical 级 npm 通告与密钥扫描直接失败，打 tag 前先本地 `npm audit --omit=dev`。
- Windows 开发者拉取后请重新检出，让 `.gitattributes` 完成行尾归一。
