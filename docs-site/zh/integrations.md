---
title: 第三方集成（TypeSafe / Jev）
description: "用一条钉住版本、校验哈希、可预演的命令接入第三方 Agent 技能与 MCP 服务。首个内置厂商为 TypeSafe（System One / Jev），九种 AIOS 客户端全部覆盖。文档给出安装、预演、校验与回滚的完整步骤，并说明版本固定与哈希校验如何在 CI 中落地。"
---

# 第三方集成（TypeSafe / Jev）

> **一句话答案：** `aios integration add <厂商>` 通过钉住的 commit、校验过的 sha256、逐客户端的注册计划和一次真实握手检查，来安装第三方 Agent 技能及其 MCP 服务。首个内置厂商是 **TypeSafe（System One / Jev）**。先跑 `aios integration add typesafe --dry-run`，在动任何磁盘内容之前看清每个客户端会发生什么。

## 为什么需要一条集成命令

多数厂商的接入方式是"复制这段提示词 / 把这段配置贴进你的 Agent"——这是一条供应链风险：文本没有版本、没有哈希、也没有针对你真实客户端集合验证过。

`aios integration` 把这段文字变成一条运维命令，带四道硬闸：

| 闸门 | 它证明了什么 |
| --- | --- |
| 钉住 commit | 技能来自不可变版本，而不是会漂移的分支 |
| 校验 sha256 | 内容与已审阅产物一致；被改过或过期的副本会被拒绝 |
| 逐客户端计划 | 九种 AIOS 客户端都有明确、可检查的注册步骤 |
| 真实握手 | 文档 MCP 服务确实可达，且暴露了预期工具 |

## 支持的模型

AIOS 把厂商的模型信息视为集成契约的一部分，因此路由和提示词可以直接点名。

| 厂商 | 模型 | 模型 ID | 凭据 | 文档 MCP |
| --- | --- | --- | --- | --- |
| TypeSafe（System One） | Jev | `jev-latest` | `TYPESAFE_API_KEY` | `https://docs.typesafe.ai/mcp` |

**TypeSafe System One** 提供可以像编程原语一样使用的小块 AI 智能：`Choice`、`Score`、`Noul`。**Jev** 把自然语言加应用状态转成带类型的判断与概率，让普通代码可以直接组合，从而把"提示词 + 解析"这一步变成结构化决策。

## 安装 TypeSafe 集成

```bash
# 1. 预演全部九种客户端的改动 —— 不写任何文件
aios integration add typesafe --dry-run

# 2. 安装技能并注册文档 MCP 服务
aios integration add typesafe

# 3. 用真实证据验证结果，而不是看一句成功提示
aios integration doctor typesafe
```

预演会打印客户端的注册步骤，并标出必须由人工完成的部分：

```text
TypeSafe integration: TypeSafe (System One / Jev) (typesafe) [dry-run]
  skill      planned @65a39f393687 sha256=71ea90d7906c
  claude     planned
             run: claude mcp add --scope user --transport http typesafe-docs https://docs.typesafe.ai/mcp
  codex      planned
             run: codex mcp add typesafe-docs --url https://docs.typesafe.ai/mcp
  gemini     manual step required  ~/.gemini/settings.json  (http-config-shape-unverified)
  probe      verified 2987ms
```

## 客户端覆盖

九种 AIOS 客户端全部覆盖。这里"覆盖"的意思是为**每个客户端都给出诚实、可执行的下一步**，而不是宣称每个客户端都有完全相同的 CLI。

| 客户端 | 注册方式 | AIOS 如何报告 |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http` | verified |
| Codex | `codex mcp add --url` | verified |
| OpenCode | `opencode mcp add --url` | verified |
| Grok | `grok mcp add -t http` | verified |
| Pi | 写入 `~/.pi/agent/mcp.json` | verified |
| Gemini CLI | 有 CLI 时用 `--transport http`，否则配置文件 + 人工步骤 | verified，否则人工步骤 |
| Hermes | `hermes mcp add --url` | 需要交互式终端 |
| WorkBuddy | 配置文件 + 人工步骤 | 需要人工步骤 |
| ZCode | 配置文件 + 人工步骤 | 需要人工步骤 |

两处行为是刻意的：

- **Hermes** 会交互式追问认证方式，且没有非交互开关。AIOS 不会去猜一个答案、也不会让脚本挂住；它打印出确切命令并标记为 `pending-interactive`。
- **WorkBuddy 和 ZCode** 的配置文件位置已知，但 AIOS 未验证其 HTTP transport 键名。AIOS 会给出文件路径和一份 JSON 骨架，把未知键名留成 `<transport-key>`，而不是编造字段名。

客户端没安装时会报告为 `client-missing` 并给出二进制名，绝不会静默算作成功。

## 命令

| 命令 | 用途 |
| --- | --- |
| `aios integration list` | 列出已知厂商及其安装内容 |
| `aios integration add <厂商> [--dry-run] [--clients a,b] [--skip-skills] [--skip-mcp]` | 安装技能并注册 MCP 服务 |
| `aios integration doctor <厂商> [--json]` | 校验技能哈希、客户端注册、凭据是否存在、以及实时 MCP 握手 |
| `aios integration remove <厂商> [--dry-run]` | 只注销和删除 AIOS 自己写下的内容 |

常用参数：

- `--dry-run` 打印完整计划，不写任何内容。
- `--clients claude,codex` 只跑指定客户端；默认是全部九种。
- `--skip-skills` 或 `--skip-mcp` 在只需要一半集成时隔离单一平面。
- `doctor` 的 `--json` 输出机器可读证据，便于接 CI。

## skill 平面装了什么

技能先进入 AIOS catalog（`skill-sources/`），随后由现成的技能分发器铺到全部客户端——这与 AIOS 自己技能的路径完全相同，所以第三方技能和内置技能不会走散。

AIOS 会在 catalog 副本里补上内部 frontmatter 键，用它决定分发目标，并在写入任何客户端技能树之前把这些键剥掉。你的客户端只会看到厂商自己的 `name`、`description` 和 `license` 字段。

不是 AIOS 持有的同名 catalog 目录绝不会被覆盖。如果 `skill-sources/typesafe-ai` 里已有你自己的改动，安装会以 `unmanaged-existing-catalog-directory` 拒绝，并告诉你去看哪里。

## 安全性质

- **凭据只查存在性。** doctor 只报告 `TYPESAFE_API_KEY` 是否已设置，从不读取、打印或存储它的值。
- **归属被记录。** `~/.aios/integrations/<厂商>.json` 记录 AIOS 写下的每个条目的指纹，因此后续运行能区分 `owned` / `external` / `conflict`，并拒绝覆盖你自己加的条目。
- **卸载有边界。** `aios integration remove` 只注销 AIOS 注册过的条目；同一文件里别人写的 MCP 服务会被保留。
- **改动前先备份。** 配置文件在重写前会备份为 `.bak-<时间戳>`。

## 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `manual step required` | 该客户端的 HTTP 配置形状未经验证 | 打开打印出的文件，对照客户端文档确认 transport 键名 |
| `needs a terminal` | 客户端的 `mcp add` 会交互式提问 | 你自己在真实终端里跑打印出的命令 |
| `client not installed` | 客户端二进制不在 `PATH` 上 | 安装该客户端后重跑 |
| `probe unreachable` | 文档 MCP 端点未完成握手 | 检查网络或代理设置，然后重跑 `doctor` |
| `unmanaged-existing-catalog-directory` | `skill-sources/<名称>` 不属于 AIOS | 把你的改动移开，再重跑安装 |

## 下一步

- [模型路由器](model-router.md) —— 声明 `task-type` 并把任务路由到指定模型面。
- [ContextDB](contextdb.md) —— 集成技能读取的项目记忆。
- [工作流策略](workflow-policy.md) —— AIOS 如何在 direct / guarded / planned 之间决策。
