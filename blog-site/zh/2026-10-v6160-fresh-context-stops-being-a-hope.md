---
title: "v6.16.0：新鲜上下文不再靠碰运气——AIOS 把它测量、声明、注入，并让 fork 变得无害"
description: "v6.16.0 把「fresh context, not a fork」从「我们起进程时碰巧成立」变成被测量、被声明、被注入、被测试钉住的合同。AIOS 自己起的 worker 本来就有结构性新鲜（一次性 prompt、RESERVED_FLAGS 封锁 --resume）；宿主自己的 Task/Agent 工具却零约束、零本地证据。于是先测量：nonce 探针（aios agents probe --client <id>）在父会话埋入 AIOS-NONCE-<16 hex>，再让子代复述——codex 带回 fork 并有直接证据，pi 是 not-applicable（它声明没有 subagent 工具面），unknown 依然是合法结论且必带 reason。config/host-capabilities.json 新增 subagents 旁挂块（不是评分轴——加轴会改总分并逼着同批改报告），角色卡指令收敛到单一 owner，38/38 张生成卡片各只含一份 Output Contract，每次派发都注入自包含的 ## Dispatch Brief——这才是让 fork 无害而不是禁止 fork 的那一步：worker 缺事实就回 blocked，而不是去靠继承来的上下文。给 fs.readFileSync 装探针之后，也推翻了我们自己的文档假设：十个 shared native partial 里只有一个（core/core-instructions.md）真被 loader 读取，因此现在每个 partial 必须显式表态 composed 或 documentation-only，并由行为在两个方向上验证。顺带修掉 stripManagedTables：它按文本拼写比较 TOML 表名，会写出重复的 [projects.*] 键、让每一次 codex 调用都 exit 1；而它那个单一的跳过标志会一路吞掉人类手写的配置直到 MANAGED_END——一条潜在的数据丢失路径。"
date: 2026-10-30
tags: ["AIOS", "v6.16.0", "子代理", "新鲜上下文", "Dispatch Brief", "能力声明", "测试", "release"]
---

# v6.16.0：新鲜上下文不再靠碰运气——AIOS 把它测量、声明、注入，并让 fork 变得无害

> **一句话：** 继承了你对话的子 agent，也会继承你的**错误前提**。我们有一个干净的派发面，
> 和一个完全裸奔的派发面；而现场最响的那句断言（「Codex 默认 fork」）是别人的说法，本地零证据。
> 这个版本把它测量出来、声明出来、把约束写进**我们自己生成的产物**，然后消灭在乎它的理由：
> 自包含 brief。`unknown` 仍然是合法答案。没有任何门禁默认变红。

## 我们拒绝照抄的那个前提

Matt Pocock 的 skills 线给「新鲜上下文」提供了一个具体的工程理由：继承父对话的实现者，会一起继承父对话的
**错误前提**，而且拿不到自己真正该看的上下文。很好。但「Codex 默认 fork」进入我们会话时是一条外部断言，
而本仓库的规矩是：**没测的东西就记成没测**。所以在写任何一条指令之前，我们先做了探针。

```
父会话   →  埋入 AIOS-NONCE-A8AF556CF1934014，然后要求子代复述它
子代回答 →  复述成功        → fork
           明确复述不出    → fresh
           其他一切        → unknown + reason
```

`aios agents probe --client codex --json` 在真实 headless codex 上返回：

```
verdict=fork  reason=child-reported-parent-nonce  confidence=indirect
```

……存储的答案里 banner 仍然带着 session `01a18ae5-a4a8-7882-988d-60e1e98bdb53`，任何人都可以复核。
pi 的答案不一样：它根本没有 subagent 工具，所以声明是 `surface: none` / `contextMode: not-applicable`，
confidence `direct`。还有 8 个客户端仍是 `unknown`，这是**刻意的**。

## 两个派发面，区别对待

| 派发面 | v6.16.0 之前 | 现在的 owner |
|---|---|---|
| AIOS 自己 spawn 的 worker | 结构性新鲜——但纯属构造上的巧合 | `one-shot.mjs` 只传一次性 prompt；`RESERVED_FLAGS` 拒绝 `--resume` / `--continue` |
| 宿主自己的 Task/Agent 工具 | **零约束**：无声明、无测量、卡片里一句话都没有 | 探针 → 声明 → 卡片条款 → Dispatch Brief |

三条规则让这件事在整个实现过程中保持诚实：

- **`unknown` 是合法结论。** 绝不默认成 `fresh`，也绝不变成阻塞项。
- **旁挂块，不是能力轴。** `CAPABILITY_AXES` 是固定 token 集，加一根轴会移动 scorecard 总分、
  逼着同批改报告。`subagents` 从旁边挂上去，于是 `client-capability-scorecard.mjs --check` 保持零漂移。
- **模型自述只能印证，不能创造。** pi 说「我没有 subagent 工具」之所以是 `direct` 证据，
  **前提是配置里已经声明了 `surface: none`**。未声明的客户端说同一句话，仍然只是
  `unknown / no-subagent-spawned`。散文造不出能力事实。

## 我们假设过的投递面——以及假设错的地方

方案里写的是：把纪律放进共享 native partial，所有客户端就都收到了。于是我们不再相信目录结构，
而是给 `fs.readFileSync` 装上探针、真跑十个客户端的完整投影，去测**投递**：

```
core/core-instructions.md   →  被 composeNativeMarkdown() 读取，10/10 客户端
其余 9 个 partial            →  没有任何东西读过它们，零调用者
```

`readSharedMarkdownParts`——唯一本会把它们拉进来的函数——在仓库代码和已安装运行时里都**没有调用点**。
而我自己第一版数错了两次：用 basename 去 grep 报出「7 个孤儿」，因为它把 docs 和 blog 里的**提及**
当成了引用。真数是 9。**「文件被写下来了」和「模型读到了它」是两个不同的事实。**

所以投递面恰好只有两处，而且两处都在我们手里：

- **worker 侧** —— 三条固定条款，一个 owner（`emitters/shared.mjs`）：不继承父对话；只凭 brief 与它
  点名的 refs 工作；缺事实就回 `blocked`；不许让父会话把 transcript 贴过来。生成的卡片现在实测
  **38/38** 命中三条条款且**恰好只有一份** Output Contract；19 张角色卡源文件里手抄的过期字段表
  （`agentId/blockers/evidenceRefs`）与 enforced schema 互相矛盾，已换成指向 schema 的一行指针。
  旧的字段表在**渲染期剥离**而不是在源文件删掉，因为 `REQUIRED_PROMPT_MARKERS` 仍然要求
  `## Output contract` 这个标题存在。
- **派发侧** —— `## Dispatch Brief`：由一个纯函数构造、一个渲染器渲染，注入到**已存在的那个** prompt
  组装器里。没有新增第二个组装器。

fork 到这里就不再是正确性问题：如果每个必需事实都在 brief 里，继承父上下文对 worker 毫无收益，
只浪费 token。

## 一扇只报告的门，一扇会红的门

`aios status` 现在给出的是可分的实测事实，而不是一个含糊的词：

```
subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
```

`fork` 被单列为风险情形，而不是被吸收进「已测量」这个中性计数；整块内容留在 `blockers` 之外——
本仓库已经在 `duplicateLines` 上学过：**没有处置计划的默认红门禁，最后会被静音而不是被修好**。
真正会红的是**投递声明**：`native-partial-delivery.test.mjs` 要求每个 partial 显式表态
`composed` 或 `documentation-only` + 理由，然后用行为证明标 `composed` 的确实被 loader 读到**且**
出现在最终产物里，并证明标 `documentation-only` 的**没有**被读到。两个方向都靠「对门禁说谎」实测过：
谎称 composed 变红，悄悄投递了却没改声明也变红。

## 探针路上撞翻的东西

- **`stripManagedTables` 按拼写比较 TOML 表名。** 同一个路径写成 `"C:\\Users\\..."` 和
  `'C:\Users\...'`，就产生两个 `[projects.*]` 表指向同一个解码后的键，codex 于是彻底不可用：
  `duplicate key`，exit 1，每一条命令都是。同一个函数里还藏着一个更糟的缺陷——只用一个布尔量表示
  「在管理块里」，于是遇到无标记的遗留 AIOS 表时会一路吞到 `MANAGED_END`，**把人类手写的配置删掉**。
  现在表的身份是**解码后的键**并用 `path.resolve()` 比较，块状态也拆成两个。
- **宿主 banner 骗过了分类器。** 一次真实的 codex 回答被记成 `answer-not-json`，因为解析器从第一个 `{`
  切到最后一个 `}`，而 banner 回显的 prompt 破坏了它。现在它只扫描平衡的 JSON 对象，并且只接受带
  `subagentSpawned` 的那一个——同时明确：**回显的 nonce 不算 fork 的证据**。
- **pi 的 JSON 事件流会回显 prompt**，nonce 也在里面。拿原始 stdout 判定会得到一个永久的假 `fork`，
  所以判定只读解析后的 `assistantText`。
- **证据文件加了尺寸上限。** 一次宿主流实测 208,782 字符；答案现在截断存储，并带
  `answerLength` / `answerTruncated` 两个字段。
- **Windows shim 取不到版本号。** `spawnSync('pi', …)` 穿过 npm shim 拿不到版本，这让版本漂移检测
  **永久静默失效**。现在版本探测走平台 spawn spec——和这里其他一切一样，单一 owner。

## 这个版本里诚实的缺口

- 完成定义 **D3 未达成**：把一次 hermetic 空白会话**只**喂 brief、要求它交出符合 schema 的 handoff，
  这件事**从未真跑过**。现有测试证的是结构性可用，我不会让静态断言冒充模型运行。
- 10 个客户端里还有 8 个未测量，每个都需要一次真实宿主调用。
- 9 个 partial 里带着纪律文字却没有投递面。把这些内容写进共享 `AGENTS.md` 会把 subagent 指令
  泄漏给根本没有 subagent 工具的客户端，所以那是另一个独立设计决策——本版本只钉死一条：
  **写文件不等于投递**。
- 已安装运行时里的 `stripManagedTables` 仍是修复前的版本；在它被更新之前，从那里做一次 native install
  可能重新制造出重复键。

## 试一下

```bash
aios agents probe --client <id> --json      # 测一个宿主的上下文继承行为
aios agents probe --client <id> --dry-run    # 只说会跑什么，一次模型调用都不花
aios status                                  # subagent-context=incomplete measured=2/10 fork=1(codex) unknown=8
node scripts/aios.mjs standards --root . --rule directoryEntries
```

本版本的担保证据：全量回归 2484 tests / 2475 pass / 0 fail / 9 skipped；探针 + 声明 + 运行器三套
28/28；38/38 生成卡片各只含一份合同；`check-syntax` 1296 文件 / 0 失败；`scorecard --check` 在 13 个
客户端上 ok 且零漂移；`check-doc-citations` 的 invalid 保持 335 → 335，而 refs 从 542 → 563。
