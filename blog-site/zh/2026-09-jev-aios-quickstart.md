---
title: "Jev + AIOS 快速上手：不用关键词，后台自动判定（顺带澄清 JVM）"
description: "设置 TYPESAFE_API_KEY，跑 aios integration add typesafe 和 aios judgment enable typesafe，然后平时怎么聊还怎么聊，Jev（jev-latest）在后台自动判定。讲清为什么只安装永远不触发、aios_judge 与 rex 阶段闸门、预算，以及 JVM/MVC 到底是什么听错了。"
date: 2026-09-19
tags: ["AIOS", "TypeSafe", "Jev", "System One", "判定闸门", "MCP", "快速上手", "JVM"]
---

# Jev + AIOS 快速上手：不用关键词，后台自动判定

装完 TypeSafe 集成却什么都没发生？这是系统在按设计工作。安装只是让 agent 认识 Jev，**开启**才让 Jev 真正回答。本文四个命令带你从零走到第一次后台判定。

## 一句话答案

| 问题 | 答案 |
| --- | --- |
| 装了 TypeSafe，为什么 Jev 从不回答？ | 集成装的是**文档** MCP 服务，文档检索产生不了判断。请跑 `aios judgment enable typesafe`。 |
| 用户要喊“JVM”之类的关键词吗？ | 不用。开了之后平时怎么聊还怎么聊，闸门在后台自己触发。 |
| 大家说的“JVM”/“JVM MVC”是什么？ | 语音把 **Jev** 听成 JVM，又把 **MCP** 文档服务混在一起了。模型叫 `jev-latest`，服务叫 `typesafe-docs`。 |
| 花钱吗？ | 每次判定一次计量调用，默认每会话 20 次、输入 20000 字符封顶。 |

## 第 0 步——先分清两半

| 哪一半 | 是什么 | 能调 Jev 吗？ |
| --- | --- | --- |
| `aios integration add typesafe` | 钉住版本技能（`65a39f3`，sha256 校验）+ 九个客户端的 `typesafe-docs` MCP | 永不。只做文档检索。 |
| `aios judgment enable typesafe` | 往 `~/.aios/judgment/config.json` 写 `enabled: true` | 能——且必须同时有 `TYPESAFE_API_KEY`。 |

## 第 1 步——安装集成

```bash
aios integration add typesafe --dry-run   # 预演全部客户端改动，不写盘
aios integration add typesafe             # 装技能 + 注册文档 MCP
aios integration doctor typesafe          # 验哈希、验注册、验凭据是否存在
```

## 第 2 步——设凭据，重启客户端

`TYPESAFE_API_KEY` 是唯一的秘密。AIOS 只查它**是否存在**，从不读取、打印或存储它的值。

```powershell
# Windows，当前账号持久生效
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<你的key>', 'User')
```

```bash
# macOS / Linux
export TYPESAFE_API_KEY="<你的key>"                             # 仅当前 shell
echo 'export TYPESAFE_API_KEY="<你的key>"' >> ~/.bashrc         # 持久化
```

然后**重启你的 coding 客户端**。环境变量只在进程启动时读一次，已经开着的客户端永远看不到事后设置的值。

## 第 3 步——打开闸门

```bash
aios judgment status           # 预期：disabled，credential present
aios judgment enable typesafe  # 写入 ~/.aios/judgment/config.json
aios judgment status           # 预期：ENABLED，model jev-latest
```

可选的诚实检查（只花一次计量调用，且只因为你明确要了它）：

```bash
aios judgment enable typesafe --probe
```

## 第 4 步——正常聊天，Jev 在后台干活

不用关键词，不用喊“请用 JVM”。照常工作：

- 要做高风险改动。动手前闸门可以给严重程度打分，选 `strict-tdd` 还是 `tdd`，拿不准就先问你。
- 做完一轮实现。rex 阶段推进前，闸门只问 Jev 一道 `noul` 题：这份证据能不能证明活真干完了？置信度不够就 hold，并打印理由。

手动试一次，看看返回长什么样：

```bash
aios judgment ask --state "生产库 sessions 表删了，没有备份。" \
  --questions '{"severity":{"type":"score","instructions":"这次改动风险多大？","criteria":["可忽略","常规","有风险","可能丢数据"]}}' \
  --risk destructive --json
```

每个答案都是**提案，不是事实**：带着 `model`、`x-typesafe-request-id`、token `usage` 和置信度，被映射成 `act` / `confirm` / `abort`。破坏性动作比只读动作要更高的置信度；闸门说的话不能生成内容，也不能推翻一次拒绝。

## 必须知道的护栏

- **默认关闭，fail closed。** 凭据缺、开关没开、配置读不懂，效果都是：`tools/list` 里没有这个工具，零网络调用，拒绝信息里写着下一步。
- **两个面，都只能收窄。** `aios_judge` 只在开启时出现；rex 阶段闸门只有 `advance` / `hold`。谁都不能放宽动作。
- **花费可审计。** 每次调用都记 `requestId` + `usage` + 调用方。
- **厂商故障默认 hold**，因为闸门是你主动开的。宁愿放行就把 `onJudgmentError` 设成 `"allow"`。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 装了但从不触发 | 开之前都正常：`aios judgment enable typesafe` |
| `credential ... (NOT SET)` | 在客户端真实环境里设 `TYPESAFE_API_KEY`，然后重启客户端 |
| `ask` 报 `judgment-disabled` | 先开；退出码 3 表示“没开”，不是“坏了” |
| Agent 说“JVM 模型” | 它说的是 Jev（`jev-latest`）。不用管，照常用。 |

## 下一步

- [AIOS 中用 TypeSafe Jev——安装、开启判定闸门、后台运行](https://cli.rexai.top/zh/integrations/)——参考页。
- [v5.19.0：给判定闸门装上身体](2026-09-v519-judgment-gate-surfaces.md)——为什么关闭时工具直接缺席。
- [v5.18.0：默认关闭，是刻意的](2026-09-v518-judgment-gate.md)——fail closed 设计。
