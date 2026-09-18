---
title: "v5.18.0：AIOS 接入 TypeSafe Jev——默认关闭，是刻意的"
description: "四步配好 TYPESAFE_API_KEY，看懂为什么装了文档 MCP 也永远不会触发判断，以及为什么新的 aios judgment 闸门在你明确开启之前一直关闭。"
date: 2026-09-18
tags: ["AIOS", "TypeSafe", "Jev", "System One", "MCP", "供应链", "release", "v5.18.0"]
---

# v5.18.0：AIOS 接入 TypeSafe Jev——默认关闭，是刻意的

AIOS v5.18.0 新增了一个 opt-in 的**判定闸门**：让工作流向 TypeSafe 的 System One 模型（Jev）提出一个狭窄的、带类型的问题，并拿回一个带校准的答案。同一批还修掉了一个会静默弄坏整份 Gemini CLI 配置的缺陷，并堵住了一处会把内部键泄漏进客户端技能树的 frontmatter 漏洞。

这篇是诚实版，包括我们发现"上一个版本根本不可能做到它看起来做到的事"的那一段。

## 一句话答案

| 问题 | 答案 |
| --- | --- |
| 凭据怎么配？ | 把 `TYPESAFE_API_KEY` 设进客户端真正运行的环境，然后**重启客户端**。下面四条命令。 |
| 装了 TypeSafe 集成，Jev 就会回答问题了吗？ | 不会。它装的是**文档** MCP 服务，只检索文档，产生不了判断。 |
| 装完判定闸门就是开的吗？ | 不是。在你跑 `aios judgment enable typesafe` 之前它一直是关的。 |
| 凭据或开关缺失会怎样？ | 什么都不会发出。也不存在"就当作答案已知"的回退路径。 |

## 我们一开始搞错的地方

上一个版本我们发了 `aios integration add typesafe`：按 commit 钉住厂商技能、校验 sha256、在全部客户端注册 `typesafe-docs`。doctor 报 `verified`。它看起来已经完成了。

然后我们去测量已装的东西实际能干什么：

| 部件 | 它能干什么 |
| --- | --- |
| `typesafe-docs` MCP | 4 个工具：`search_type_safe_ai`、`query_docs_filesystem_type_safe_ai`、`submit_feedback`、`read_typesafe`。**全是文档检索，没有任何推理工具。** |
| 内置的 `typesafe-ai` 技能 | 它就是 TypeSafe 官方技能。`grep -c 'TYPESAFE_API_KEY\|POST\|curl\|systemone'` → **0**。它讲概念、指向线上文档。 |
| AIOS 运行期 | 零个调用点。 |

也就是说，上一个版本装的是 Jev 的**地图**，从没碰过 Jev 本身。这不是安装器的 bug——计划文档里明确写了"任何带凭据的 TypeSafe API 调用"不在范围内。这是叙事上的缺口，而这个版本把它补上了。

这个教训可以推广：**"集成装好了"和"这个能力能用"是两个不同的断言。** 只有第二个值得放进 doctor 检查。

## 配置凭据

`TYPESAFE_API_KEY` 是这里唯一涉及的凭据。AIOS 只检查它**是否存在**——从不读取、打印或存储它的值。你要把它设进编码客户端真正运行的那个环境里。

最常见的失败原因是作用域：在某个终端里 `export` 的变量，或写在另一个账号 *User* 作用域里的变量，对已经在运行的客户端是不可见的。

**Windows —— 对你的账号持久生效：**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<你的密钥>', 'User')
```

**Windows —— 对全部账号生效（需要管理员终端）：**

```powershell
[Environment]::SetEnvironmentVariable('TYPESAFE_API_KEY', '<你的密钥>', 'Machine')
```

**macOS / Linux：**

```bash
export TYPESAFE_API_KEY="<你的密钥>"                                # 仅当前 shell
echo 'export TYPESAFE_API_KEY="<你的密钥>"' >> ~/.bashrc            # 持久化
```

然后**重启你的编码客户端**。环境变量只在进程启动时读一次。已经打开的客户端永远看不到你之后设置的值——而这正是"集成明明装对了，却一直报没有凭据"的第一大原因。

查看客户端将看到什么：

```bash
aios integration doctor typesafe
```

凭据那一行只报告 `present` 或 `unset`，不会显示值。

## 打开闸门

```bash
aios judgment status                    # 在你表态之前一直是 disabled
aios judgment enable typesafe           # 写入 ~/.aios/judgment/config.json
aios judgment enable typesafe --probe   # ……并只发一次计量调用
```

在任何一个字节离开你的机器之前，三个条件必须同时成立：

| # | 条件 | 默认 |
| --- | --- | --- |
| 1 | 进程环境中存在 `TYPESAFE_API_KEY` | 未设置 |
| 2 | `~/.aios/judgment/config.json` 中 `enabled: true` | `false` |
| 3 | 会话调用数与输入长度预算未超 | 20 次、20000 字符 |

任一条件不成立，这个调用面就不存在。不会发出请求，也不存在"回退成当作答案是肯定的"代码路径。`--probe` 是 AIOS 里唯一会在你不直接使用 `ask` 的情况下花钱的东西，而且它只因为你亲手敲了它才运行。

## 判断是提案，不是事实

这是最要紧的设计决定。Jev 没有权限写任何东西。每个结果都带着它的模型、`x-typesafe-request-id`、token 用量和置信度——而运行时被允许做的唯一一件事，就是拿它去和你配置的阈值比较。

| 裁决 | 条件 | 含义 |
| --- | --- | --- |
| `act` | 置信度 ≥ `actFloor` | 不必询问，可以推进 |
| `confirm` | 落在两个门槛之间 | 先问人 |
| `abort` | 低于 `confirmFloor` | 不要动手 |

两条规则防止它变成一个权威：

- **风险只会抬高门槛。** 破坏性改动需要比只读动作更高的置信度。不存在任何一条路径能让一个判定让 AIOS 去做本该被闸门拒绝的事。
- **`Noul` 按设计不携带置信度。** API 本来就不返回它，所以闸门直接使用概率本身并如实说明，而不是造一个看起来像置信度的数字。

形状先于取值被校验。如果某个 `choice` 答案给出了从未声明过的选项，或者答案的 `type` 与发出的问题不匹配，那就是错误——绝不会被强转成一个能用的值。

## 同批还修了什么

- **Gemini CLI 配置修复。** AIOS 曾把 `startupTimeoutSec`（秒）写进 `~/.gemini/settings.json`。Gemini 对 MCP server 条目做严格模式校验，而它真正接受的字段是 `timeout`，单位是**毫秒**——所以一个错误的键会静默让**整份**配置失效，Gemini 直接拒绝启动。现在有了带显式字段白名单的归一化器（沿用既有的 ZCode 路径），并就地迁移了两份已经被写坏的配置，附带备份。
- **CRLF 文件上的 frontmatter 泄漏。** `parseFrontmatter` 用 `lines[0] !== '---'` 判断文件有没有 frontmatter。在 CRLF 文件里那一行是 `'---\r'`，判定失败，解析器原样返回，于是 AIOS 的内部键（`clients`、`scopes`、`repoTargets`……）直接漏进了客户端技能树——恰好是文档承诺绝不会发生的事。解析器现在在入口处归一化行尾并恒定输出 LF。AIOS 自己的哈希校验一直没报警，因为它在计算哈希**之前**就归一化了行尾。
- **诚实的客户端覆盖行。** Gemini 现在是已验证的 `cli` transport。ZCode 被查明是没有 `PATH` CLI 的 Electron 客户端——AIOS 把 stdio server 写进 `~/.zcode/cli/config.json` 的 `mcp.servers`，ZCode 从那里读取；但它的 HTTP 条目还需要一个 AIOS 目前不写入的 `url` 字段，所以那部分仍是人工步骤。文档不再暗示相反的说法。
- **两处与版本绑定的站点门禁。** `check:site-sync` 要求每个语言都有一篇发布博客。在本次发版之前，它是失败的。

## 证据

闸门是对着真实端点端到端验证的，不是 mock：

```text
POST https://api.typesafe.ai/v1/systemone
date: Fri, 18 Sep 2026 11:54:33 GMT
HTTP/1.1 200 OK
x-typesafe-request-id: req_01a0b45e4b9d76d6b5346020c5df7aa9
{"model":"jev-1.13.0",
 "answers":{"severity":{"type":"score","score":2.94,"confidence":0.94,
            "probabilities":{"0":0.0,"1":0.01,"2":0.05,"3":0.94}}},
 "usage":{"input_tokens":325,"output_tokens":17}}
```

`x-typesafe-request-id` 由服务器签发，响应还带着 `istio-envoy` 的上游耗时头——这个请求确实穿过了 TypeSafe 的网关并被计量。

关闭态同样被验证了：在没有配置、没有开启开关的情况下，测试套件断言传输层从未被调用。那是我们最在意的性质，所以它被断言，而不是被描述。

## 我们还回答不了的那部分

我们的 TypeSafe 控制台对这把凭据显示**零请求**，尽管每一次调用我们都有服务器签发的 request-id。没有可查询的用量 API（`/v1/me`、`/v1/account`、`/v1/usage` 全是 404），而 `Spend $0.00` 什么都证明不了：325 输入 token 按 $0.042/MTok 算是 $0.0000137。

最可能的解释是这把 key 属于另一个组织，而不是我们正在看的那个控制台。我们把这一点公开，而不是藏起来，因为"看板显示为零"恰好是那种会被忽略到出事为止的信号。如果你正在把计量型厂商接进自己的工作流：**每一次调用都记下厂商自己的 request id**——那是唯一能在账单争议中活下来的证据。

## 升级

```bash
aios update
aios judgment status
```

升级之后闸门依然是关的。这正是重点。

## 延伸阅读

完整参考随文档发布，提供英文、中文、日文、韩文四种语言：

- `docs-site/integrations.md` —— 凭据配置、逐客户端覆盖情况，以及判定闸门参考。
- `docs-site/workflow-policy.md` —— AIOS 如何在 direct / guarded / planned 之间决策。
