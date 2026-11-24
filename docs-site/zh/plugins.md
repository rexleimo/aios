---
title: AIOS 插件——从 GitHub 安装、开发与贡献
description: "用一条命令从 GitHub 安装 AIOS 插件，管理生命周期，编写 manifest，理解信任边界，并通过 Pull Request 提交社区插件。"
---

# AIOS 插件——从 GitHub 安装、开发与贡献

> **一句话答案：** 在项目根目录运行 `aios plugin install github:owner/repo#v1.2.3`。AIOS 会把公开仓库克隆到 `.aios/plugins/<id>`，校验根目录的 `manifest.json`，把 checkout 固定到解析出的 commit，并注册进 `config/plugins.json`。`aios plugin add` 是别名。

## 插件能贡献什么

AIOS 插件是带有根目录 `manifest.json` 的目录。`contributes` 可以增加：

| 贡献类型 | 作用 |
| --- | --- |
| `panels` | Console 导航页，可选渲染沙箱化的单文件 HTML UI |
| `integrations` | 通过现有集成注册表投影 skill/MCP 集成 |
| `providers` | 由独立子进程通过 stdio JSON-RPC 加载的模型/供应商数据 |
| `middleware` | 在受限 Node VM 中运行的网关请求钩子 |
| `clients` | 复用现有 connect 系统的客户端连接声明 |
| `actions` | 声明式动作/工具贡献 |
| `onUsage` | 网关用量聚合 |

## 从 GitHub 安装

### 前置条件

- 在要扩展的**项目根目录**执行命令。
- `PATH` 中必须有 Git。
- 仓库必须公开，并在根目录包含 `manifest.json`。
- 直接交付可加载文件。AIOS **不会**运行 `build`、`prepare`、`install` 或其他包脚本。

### 一条命令安装

```bash
# 默认分支，安装时解析并固定
aios plugin install github:acme/demo

# tag、分支或完整 commit SHA
aios plugin install github:acme/demo#v1.2.3
aios plugin install --ref main github:acme/demo

# DSH 风格别名
aios plugin add github:acme/demo#v1.2.3

# 普通 GitHub HTTPS URL 也可以
aios plugin install https://github.com/acme/demo
```

JSON 结果会报告插件 id、归一化来源、解析出的 commit、manifest 路径和已应用的贡献：

```json
{
  "ok": true,
  "id": "demo-plugin",
  "source": "github:acme/demo#v1.2.3",
  "commit": "1111111111111111111111111111111111111111",
  "manifest": ".aios/plugins/demo-plugin"
}
```

AIOS 会以 detached HEAD 状态检出解析出的 commit。之后向分支或 tag 推送不会静默改变已安装文件。

### 安装本地插件

原有本地安装方式继续可用：

```bash
aios plugin install --id demo-plugin --dir ./plugins/demo
```

它适合插件开发，也适合本仓库的 `examples/hello-plugin`——该示例的 manifest 在子目录，不在 AIOS 仓库根目录。

## 管理已安装插件

| 命令 | 作用 |
| --- | --- |
| `aios plugin list --json` | 列出已注册插件及 manifest 路径 |
| `aios plugin disable <id>` | 保留安装，但撤回其贡献 |
| `aios plugin enable <id>` | 重新应用其贡献 |
| `aios plugin remove <id>` | 注销插件并撤回已投影贡献 |
| `aios plugin providers --json` | 查询内置与插件 providers |
| `aios plugin models --json` | 查询内置与插件模型 |

GitHub 安装会写入：

```text
<project>/
├── config/plugins.json                 # 生命周期注册表
└── .aios/plugins/<plugin-id>/          # 固定 commit 的源码 checkout
```

`remove` 不会删除源码目录。若要干净重装 GitHub 插件，请先 remove，再删除 `.aios/plugins/<plugin-id>`，然后重新安装。

## 开发插件

### 最小 manifest

```json
{
  "schemaVersion": 1,
  "id": "demo-plugin",
  "version": "1.0.0",
  "permissions": ["panel"],
  "lifecycle": {
    "install": "automatic",
    "upgrade": "manual",
    "disable": "toggle",
    "remove": "clean"
  },
  "contributes": {
    "panels": [
      {
        "id": "demo",
        "href": "/demo",
        "label": "Demo",
        "title": "Demo plugin",
        "ui": { "entry": "panel.html" }
      }
    ]
  }
}
```

规则：

- `id` 必须小写，并匹配 `^[a-z][a-z0-9._-]*$`。
- `version` 使用类 SemVer，例如 `1.2.3` 或 `1.2.3-beta.1`。
- `ui.entry` 是插件目录内的相对 `.html` 文件，最大 256 KiB。
- provider 的 `entry` 路径相对于插件目录。
- integration 声明仍要通过现有 pinned-commit 与 sha256 校验。

### 运行时与信任边界

| 界面 | 执行模型 | 信任说明 |
| --- | --- | --- |
| manifest 与 panel 数据 | 宿主读取并投影 | 不运行外部安装脚本 |
| Panel HTML | `iframe sandbox="allow-scripts"` | 不能同源访问宿主 DOM、Cookie 或 API |
| Middleware | 受限 Node VM、超时、clone/rollback、fail-open | 不是硬安全边界，只安装可信钩子 |
| Provider entry | 独立 Node 子进程、stdio JSON-RPC | 以宿主进程的操作系统权限执行插件代码 |

安装插件是信任决定。优先使用 tag 或完整 commit SHA，审查 `permissions` 与 `contributes`，启用前检查 provider 或 middleware 代码。

## 通过 Pull Request 贡献插件

目前还没有中心化市场，但欢迎社区插件 PR。

1. 发布插件仓库，包含根目录 `manifest.json`、README 和许可证。
2. 打一个 release tag，并同时验证本地安装与 GitHub 安装。
3. 开 PR，在下方社区表格增加一行，写明：
   - 插件名与仓库 URL；
   - 已验证的 tag 或 commit；
   - 一句话用途；
   - 所需权限；
   - 安装/测试证据。
4. 插件继续直接从 GitHub 安装；列表 PR 不会把你的代码搬进 AIOS 仓库。

从[插件指南编辑页](https://github.com/rexleimo/aios/edit/main/docs-site/zh/plugins.md)开始，或[开 issue](https://github.com/rexleimo/aios/issues)。

### 社区插件

| 插件 | 来源 | 安装方式 |
| --- | --- | --- |
| 官方 `hello-plugin` 示例 | [AIOS 仓库](https://github.com/rexleimo/aios/tree/main/examples/hello-plugin) | 在 AIOS checkout 中：`aios plugin install --id hello-plugin --dir examples/hello-plugin` |
| 你的插件在这里 | 欢迎 PR | `aios plugin install github:owner/repo#tag` |

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `GitHub source must name owner/repo` | 简写不受支持或 URL 路径过多 | 使用 `github:owner/repo` 或 `https://github.com/owner/repo` |
| `git clone failed` | Git 缺失、网络/代理问题或私有仓库 | 安装 Git、检查连通性，或改用公开仓库 |
| `plugin manifest ... is not valid JSON or missing` | 根目录没有 `manifest.json` | 在仓库根目录添加合法 manifest |
| `manifest id ... != requested ...` | `--id` 与 manifest 不一致 | 省略 `--id` 或使用 manifest 中的 id |
| `plugin target already exists` | 旧 checkout 仍存在 | 先 `aios plugin remove <id>`，删除 `.aios/plugins/<id>` 后重装 |
| `plugin ... already installed` | id 已注册 | 禁用，或先移除再重装 |
| TypeScript 插件无法加载 | Git 安装不会构建源码 | 提交可直接加载的 JS，或发布预构建文件 |

## 当前限制

- 只支持公开 GitHub HTTPS 仓库；不支持 SSH、私有仓库、npm 包或内嵌凭据。
- 尚无自动更新、市场搜索或签名注册表。
- manifest 必须在仓库根目录。
- AIOS 从不授权或运行仓库构建脚本。

## 下一步

- [发布博客：一条命令从 GitHub 安装插件](https://cli.rexai.top/blog/zh/2026-11-plugin-ecosystem/)
- [第三方集成](integrations.md)——固定版本的 skill 与 MCP 集成管理。
- [模型路由器](model-router.md)——在多个模型供应商之间路由任务。
- [架构](architecture.md)——插件在 AIOS 运行时中的位置。
