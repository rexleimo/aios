---
title: 官方案例库
description: 用可复现命令说明 RexCLI 在真实场景里能做什么。
---

# 官方案例库

这页是 `RexCLI` 的能力地图。

每个案例都包含：

- `何时使用`：决策触发点
- `运行`：可复制粘贴的命令
- `证据`：什么证明成功

## 推荐深度阅读

[在 GitHub 上 Star](https://github.com/rexleimo/rex-cli?utm_source=cli_rexai_top&utm_medium=docs&utm_campaign=english_growth&utm_content=case_library_featured_star){ .md-button .md-button--primary data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="github_star" }
[对比工作流](cli-comparison.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="compare_workflows" }
[案例：跨 CLI 接力](case-cross-cli-handoff.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_handoff" }
[案例：浏览器认证墙流程](case-auth-wall-browser.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_authwall" }
[案例：Privacy Guard 配置读取](case-privacy-guard.md){ data-rex-track="cta_click" data-rex-location="case_library_featured" data-rex-target="case_privacy" }

## 案例 1：新机器 5 分钟完成初始化

**何时使用**

你正在给新笔记本或队友配置环境，需要快速建立干净基线。

**运行**

```bash
scripts/setup-all.sh --components all --mode opt-in
scripts/verify-aios.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-all.ps1 -Components all -Mode opt-in
powershell -ExecutionPolicy Bypass -File .\scripts\verify-aios.ps1
```

**证据**

- `verify-aios` 退出码为 `0`
- `doctor-*` 检查无阻塞错误

## 案例 2：浏览器 MCP 安装与冒烟测试

**何时使用**

你需要浏览器自动化（`browser_*`）用于演示或 agent 工作流。

**运行**

```bash
scripts/install-browser-mcp.sh
scripts/doctor-browser-mcp.sh
```

然后在客户端对话中执行：

```text
browser_launch {"profile":"default"}
browser_navigate {"url":"https://example.com"}
browser_snapshot {"includeAx":true}
browser_close {}
```

**证据**

- `doctor-browser-mcp` 报告 `Result: OK`（警告可接受）
- 冒烟命令返回结构化工具响应，无运行时异常

## 案例 3：跨 CLI 接力

**何时使用**

你希望 Claude 分析、Codex 实现、Gemini 复核，且不丢失上下文。

**运行**

```bash
claude
codex
gemini
```

或确定性 one-shot：

```bash
scripts/ctx-agent.sh --agent claude-code --prompt "总结阻塞并提出下一步"
scripts/ctx-agent.sh --agent codex-cli --prompt "根据最新 checkpoint 实现首要修复"
scripts/ctx-agent.sh --agent gemini-cli --prompt "审查回归风险和缺失的测试"
```

**证据**

- `.aios/context-db/` 下有新的 session/checkpoint 产物
- 后续 CLI 运行可继续使用同一项目上下文

## 案例 4：认证墙处理（人机协同）

**何时使用**

自动化遇到登录墙（Google、Meta、平台认证），不应盲目绕过。

**运行**

```text
browser_launch {"profile":"local"}
browser_navigate {"url":"https://target.site"}
browser_auth_check {}
```

如果 `requiresHumanAction=true`，在同浏览器 profile 中手动完成登录，然后继续用 `browser_snapshot` / `browser_click` / `browser_type`。

**证据**

- `browser_auth_check` 返回明确的认证状态字段
- 手动登录后用同一 profile 恢复流程

## 案例 5：One-shot 审计执行链

**何时使用**

你需要一条命令产生可审计记录（`init -> session -> event -> checkpoint -> pack`）。

**运行**

```bash
scripts/ctx-agent.sh --agent codex-cli --project RexCLI --prompt "从最新 checkpoint 继续并执行下一步"
```

**证据**

- `.aios/context-db/index/checkpoints.jsonl` 有新 checkpoint 条目
- `.aios/context-db/exports/` 有导出 context packet

## 案例 6：Skills 生命周期运维

**何时使用**

你在多个 CLI 间管理共享 skills，需要可预测的生命周期操作。

**运行**

```bash
scripts/install-contextdb-skills.sh
scripts/doctor-contextdb-skills.sh
scripts/update-contextdb-skills.sh
# 需要回滚时
scripts/uninstall-contextdb-skills.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-skills.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-skills.ps1
# 需要回滚时
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-skills.ps1
```

**证据**

- Doctor 输出确认目标存在且健康
- 更新/卸载不产生悬空损坏链接

## 案例 7：Shell 包装层修复与回滚

**何时使用**

用户报告命令包装问题，需要安全的恢复路径。

**运行**

```bash
scripts/doctor-contextdb-shell.sh
scripts/update-contextdb-shell.sh
# 需要完全回滚时
scripts/uninstall-contextdb-shell.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-contextdb-shell.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update-contextdb-shell.ps1
# 需要完全回滚时
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-contextdb-shell.ps1
```

**证据**

- Wrapper doctor 不再报告阻塞问题
- 回滚后原生 `codex`/`claude`/`gemini` 命令正常工作

## 案例 8：发布前安全体检

**何时使用**

发布更新前，验证 skills/hooks/MCP 设置中无不安全配置漂移。

**运行**

```bash
scripts/doctor-security-config.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-security-config.ps1
```

**证据**

- Security doctor 退出 `0`
- 所有警告在发布前审查并解决

## 投稿新官方案例

提案格式要求：

1. 包含精确命令，无占位符。
2. 定义可衡量的证据（退出码、文件产物或工具响应）。
3. 必要时添加回滚/恢复步骤。
