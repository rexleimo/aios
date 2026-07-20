---
title: Rex 工作流迁移
description: 安全地从已退役的 Superpowers 工作流迁移到仅使用 Rex 的 AIOS 工作流。
---

# Rex 工作流迁移

对于新的 AIOS 安装和受管工作流投影，`rex-harness` 是唯一默认的软件工程工作流。Superpowers 已从 AIOS 安装组件和工作流中退役。原有的 `/superpowers/` 地址保留为本迁移指南，使既有链接说明当前行为，而不是继续教授已退役的工作流。

## 有哪些变化

Rex 拥有软件工程控制循环：Facts、Capability 选择、Workflow Activation、Command、Evidence Contract 和恢复状态。AIOS 在 Rex 控制面周围提供宿主路由、客户端投影、ContextDB、安全检查、团队执行和长期 harness 支持。

新安装会为 Codex、Claude、Gemini、OpenCode、Hermes 和 Grok 安装 Rex 投影；在客户端支持时也会安装共享 `.agents` 投影。没有可启用的 Superpowers TUI 选项或独立 Superpowers 工作流。

## 安全升级行为

照常执行普通升级：

```bash
aios update
```

普通升级会安装并收敛仅使用 Rex 的工作流。缺少 AIOS 所属证明的历史 Superpowers 投影会被保留并报告为 conflict。这个默认的失败关闭策略避免 AIOS 仅因路径名称类似旧投影就删除用户管理的路径。

## 显式清理旧投影

如果希望 AIOS 接管并删除经精确识别的旧 Superpowers 投影，请先预览结果，再运行显式清理：

```bash
aios update --adopt-legacy-superpowers --dry-run
aios update --adopt-legacy-superpowers
```

对于不通过 `aios update` 升级的用户，同一显式选项也可用于：

```bash
aios init --all --adopt-legacy-superpowers
aios setup --adopt-legacy-superpowers
```

显式接管覆盖 Codex、Claude、Gemini、OpenCode、Hermes、Grok 和共享 `.agents` 投影中经识别的 AIOS 旧链接。它不会删除未知、已修改或没有所属证明的用户路径。确认所属关系后，请手动处理这些 conflict。

## 验证迁移

```bash
aios doctor --native --verbose
```

doctor 输出会显示客户端投影和工作流诊断。对于源码安装，还应确认已提供内置的 `rex-harness` 子模块：

```bash
git submodule update --init --recursive -- rex-harness
```

## 相关文档

- [工作流策略](workflow-policy.md) - 围绕当前 Rex Command 选择 `direct`、`guarded` 或 `planned` 宿主路由。
- [快速开始](getting-started.md) - 安装并初始化 AIOS。
- [更新日志](changelog.md) - 查看版本级迁移说明。
