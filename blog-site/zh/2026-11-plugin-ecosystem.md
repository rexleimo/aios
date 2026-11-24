---
title: "v8.2.0：AIOS 插件现在可以用一条命令从 GitHub 安装"
description: "AIOS 插件可以增加 Console 页面、集成、供应商、middleware、客户端连接、动作和用量聚合。现在直接从 GitHub 安装，固定到 commit，且不运行仓库构建脚本。"
date: 2026-11-24
tags: ["AIOS", "v8.2.0", "插件", "GitHub", "生态", "发布"]
---

# v8.2.0：AIOS 插件现在可以用一条命令从 GitHub 安装

插件系统先落地了运行时，却迟迟没有正门。系统能读 manifest、能把贡献投影到
app 各处，但用户没有指南，没有一条 GitHub 安装命令，也不知道怎么提交插件。
现在这个缺口补上了。

## 安装

在项目根目录运行：

```bash
aios plugin install github:owner/repo#v1.2.3
```

完整 GitHub HTTPS URL 也可以，`add` 是别名：

```bash
aios plugin add github:owner/repo#v1.2.3
aios plugin install https://github.com/owner/repo
```

AIOS 会把公开仓库克隆到 `.aios/plugins/<id>`，校验根目录 `manifest.json`，把
tag、分支或 SHA 解析成 commit，以 detached HEAD 检出该 commit，并注册进
`config/plugins.json`。

## 插件能增加什么

一份 manifest 可以贡献：

- Console 页面，包括 sandboxed 单文件 HTML UI；
- 通过现有固定版本集成注册表安装的 skill/MCP 集成；
- 通过独立子进程加载的模型/供应商数据；
- 有边界和超时的网关 middleware；
- 客户端连接、动作和用量聚合。

原有本地开发方式继续可用：

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

## 安全边界

Git 安装期间，AIOS **不会**运行仓库的 `build`、`prepare`、`install` 或其他包
脚本。作者必须交付可直接加载的文件。checkout 会固定到 commit，因此之后向
分支推送不会静默替换你审查过的代码。

但安装仍然是信任决定。Panel HTML 在 sandboxed iframe 中运行，middleware 在
带超时与回滚的受限 VM 中运行，provider entry 则由独立子进程以宿主的 OS 权限
执行。请审查 `permissions` 与 `contributes`，优先使用 release tag 或完整
commit SHA。

当前限制也写清楚了：只支持公开 GitHub HTTPS 仓库，manifest 必须在根目录；
尚无自动更新、市场搜索、npm 或 SSH 安装。

## 开发与贡献

新的[插件指南](https://cli.rexai.top/zh/plugins/)覆盖 manifest 契约、生命周期
命令、运行时边界、故障排查和 Pull Request 贡献路径。

提交社区插件只需：

1. 发布带根目录 `manifest.json`、README 和许可证的仓库；
2. 打 release tag，同时验证本地安装和 GitHub 安装；
3. 开 PR，在社区表格中补充仓库、已验证的 tag/commit、用途、权限和证据。

代码仍留在你的仓库。PR 只增加一个可发现的列表和一条别人可以直接复制的
安装命令。

## 验证

聚焦安装测试 9/9 通过。一次真实 Windows CLI 冒烟通过 GitHub 形态的来源从
临时 Git 仓库安装插件，核对了解析出的 commit、detached checkout、注册表
条目、panel 投影和 staging 清理。独立规范/规格审查在有边界的 diff 上零发现。

读[作者与贡献者指南](https://cli.rexai.top/zh/plugins/)，把 AIOS 缺的那个扩展
装上来。
