# MkDocs 导航结构优化设计

**Date:** 2026-03-04
**Status:** Approved
**Author:** Claude

## 背景

当前文档站点 (`docs-site/`) 导航存在以下问题：
1. 所有页面平铺，缺少分组逻辑
2. `community/`, `monetization/`, `seo/` 子目录的页面未加入导航
3. Blog 引流入口不够显眼

## 目标

优化导航菜单结构，提升用户体验和引流效果。

## 设计方案

### 导航结构

```
Blog (引流 - 外部链接)
Getting Started
  ├── Quick Start
  ├── Windows Guide
  └── Troubleshooting

Core Features
  ├── ContextDB
  ├── Architecture
  └── CLI Workflows

Resources
  ├── Case Library
  ├── Changelog
  └── Friends

Community
  ├── Post Templates
  └── Posting Policy

External
  └── Project
```

### 关键变更

1. **Blog 提升为顶级 Tab** — 放在最前面，利于引流
2. **新增分组** — Getting Started, Core Features, Resources, Community
3. **Windows Guide** — 从独立页面移入 Getting Started 分组
4. **Community 页面加入导航** — Post Templates, Posting Policy
5. **SEO/Monetization 排除** — 内部文档，不展示

### 配置文件

修改 `mkdocs.yml` 的 `nav` 配置：

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
      - Posting Policy: community/posting-policy.md
  - External:
      - Project: https://github.com/rexleimo/aios
```

### i18n 适配

同步更新 `nav_translations`：
- zh: 快速开始、功能核心、资源、社区、引流
- ja: クイックスタート、コア機能、リソース、コミュニティ
- ko: 시작하기, 핵심 기능, 리소스, 커뮤니티
