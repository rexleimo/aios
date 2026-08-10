# MkDocs 导航结构优化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修改 mkdocs.yml 导航配置，实现分组式导航结构

**Architecture:** 直接修改 mkdocs.yml 的 nav 配置，定义分组式导航结构

**Tech Stack:** MkDocs YAML 配置

---

## Task 1: 修改 mkdocs.yml 导航配置

**Files:**
- Modify: `mkdocs.yml:127-139`

**Step 1: 备份当前配置**

```yaml
# 当前配置 (行 127-139)
nav:
  - Overview: index.md
  - Blog: https://cli.rexai.top/blog/
  - Friends: friends.md
  - Project: https://github.com/rexleimo/aios
  - Quick Start: getting-started.md
  - Changelog: changelog.md
  - CLI Workflows: use-cases.md
  - Case Library: case-library.md
  - Architecture: architecture.md
  - ContextDB: contextdb.md
  - Troubleshooting: troubleshooting.md
```

**Step 2: 写入新配置**

```yaml
nav:
  - Blog: https://cli.rexai.top/blog/
  - Getting Started:
      - Quick Start: getting-started.md
      - Windows Guide: windows-guide.md
      - Troubleshooting: troubleshooting.md
  - Core Features:
      - ContextDB: contextdb.md
      - Architecture: architecture.md
      - CLI Workflows: use-cases.md
  - Resources:
      - Case Library: case-library.md
      - Changelog: changelog.md
      - Friends: friends.md
  - Community:
      - Post Templates: community/post-templates.md
      - Posting Policy: community/postting-policy.md
  - External:
      - Project: https://github.com/rexleimo/aios
```

注意: community/posting-policy.md 文件名是 posting-policy (没有 i)

**Step 3: 验证配置语法**

```bash
cd /Users/molei/codes/aios
python3 -c "import yaml; yaml.safe_load(open('mkdocs.yml'))"
```

Expected: No error (valid YAML)

**Step 4: 构建文档站点**

```bash
mkdocs build
```

Expected: 成功生成 site/ 目录

---

## Task 2: 同步更新 i18n 导航翻译 (可选)

**Files:**
- Modify: `mkdocs.yml:58-69` (zh)
- Modify: `mkdocs.yml:75-86` (ja)
- Modify: `mkdocs.yml:92-103` (ko)

如果需要多语言版本同步更新导航翻译，否则跳过此任务。

**Step 1: 更新中文导航翻译**

```yaml
nav_translations:
  Overview: 概览
  Project: 项目地址
  Blog: 博客
  Friends: 友情链接
  Quick Start: 快速开始
  Windows Guide: Windows 安装指南
  Changelog: 更新日志
  CLI Workflows: CLI 工作流
  Case Library: 官方案例库
  Architecture: 架构
  ContextDB: ContextDB
  Troubleshooting: 故障排查
  Getting Started: 快速开始
  Core Features: 功能核心
  Resources: 资源
  Community: 社区
  Post Templates: 发布模板
  Posting Policy: 发布规范
  External: 外部链接
```

**Step 2: 验证构建**

```bash
mkdocs build
```

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-03-04-mkdocs-navigation-redesign.md`.**

Two execution options:

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
