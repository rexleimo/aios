---
title: "v5.4.1：为什么 Windows 上 'aios update' 会坏，以及我们怎么修好的自更新"
description: "v5.4.1 修复了一个 Windows 专属的自更新失败：从安装目录内运行 'aios update' 会锁住安装器必须删除的目录，静默嵌套新版本并让后续更新以 MODULE_NOT_FOUND 崩溃。本文讲根因和三层修复。"
date: 2026-08-02
tags: ["Harness CLI", "自更新", "Windows", "安装器", "发布", "bug 修复"]
---

# v5.4.1：为什么 Windows 上 "aios update" 会坏，以及我们怎么修好的自更新

> **快速回答：** v5.4.1 修复了一个 Windows 专属的自更新失败。如果你从安装目录内运行 `aios update`，进程工作目录会钉住安装器需要删除的目录——Windows 无法删除被进程 cwd 占用的目录——删除静默失败，新版本被嵌套到 `<install>/harness-cli/`，后续更新以 `MODULE_NOT_FOUND` 崩溃。修复方案：先把工作目录移出安装树、让安装器验证旧目录确实被删除（失败时显式报错而不是嵌套）、重执行入口缺失时给出清晰错误。

## 这个 bug：Windows 上自更新可能弄坏安装

release 安装（无 git 工作树）的 `aios update` 会原地重跑 release 安装器。在 Windows 上，**正在运行的进程 cwd 所在的目录无法被删除**。当你从 `~/.rexcil/harness-cli` 里运行 update——这是最自然的操作——进程 cwd 就钉住了安装树：

1. 安装器的删除步骤静默失败（`-ErrorAction SilentlyContinue` 吞掉了错误）。
2. `Move-Item` 发现目标目录仍然存在，把新版本**嵌套**到 `<install>/harness-cli/`。
3. 更新后的重执行找不到 `scripts/aios.mjs`，以裸 `MODULE_NOT_FOUND` 崩溃，留下一个半替换的安装。

这正是一种看起来像"工具坏了"、实际只是一条 Windows API 规则的 bug：你不能删除自己正站在里面的目录。

## 修复：三层

1. **先移出。** 运行 release 安装器之前，更新器把自身工作目录迁移到安装树之外（`ensureWorkingDirectoryOutsideInstallTree`），没有任何东西钉住必须被替换的目录。
2. **大声验证。** `aios-install.ps1` / `aios-install.sh` 现在会检查旧目录确实被删除，失败时给出清晰信息（"文件可能被运行中的 aios/node 进程锁定"），而不是静默继续嵌套安装。
3. **守卫重执行。** 更新后的进程检查入口点是否存在，替换出错时打印具体的修复指引，而不是晦涩的模块错误。

更新器还优先用本地 `scripts/aios-install.ps1` 执行 release-installer 更新，防御性安装器修复立即生效，不再等远程拉取。

## 你应该做什么

- 如果你在 5.4.0 或更早版本、且 `aios update` 后见过 `MODULE_NOT_FOUND`：先重跑一次安装器（`irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex`），之后 `aios update` 就安全了。
- 如果你的 `~/.rexcil/harness-cli/harness-cli/` 有奇怪的嵌套目录（来自失败的更新），删掉它（或重装）——那是旧失败模式的遗留。

## FAQ

### 非 Windows 安装受影响吗？

不受。Unix shell 不会以同样的方式钉住 cwd，该失败是 Windows 目录锁行为特有的。防御性检查现在在所有平台运行。

### 只有 `aios update` 受影响吗？

任何对 release 安装的原地替换都走同一条路径。工作目录迁移适用于整条路径。

### 细节在哪里看？

[更新日志](https://cli.rexai.top/changelog/)记录了 v5.4.1；修复本身在发布资产里——你升到 5.4.1 后，更新就是安全的。

一个会弄坏自己安装的自更新器，比没有更新器更糟。v5.4.1 让最常见的情况——从安装目录内更新——成为被测试过的安全路径。
