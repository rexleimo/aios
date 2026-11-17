# apps/shell — AIOS Console（本机 AI 工具管理器 + 桌面壳）

当前界面提供 Agent 客户端管理、模型网关、项目记忆与资源库（MCP / Skills / Subagents）。旧接入矩阵控制台已退役。原有架构边界见 `docs/adr/0007-aios-perceived-surface-and-desktop-shell.md` 与 ADR 0008；迁移决定见 `docs/plans/2026-11-06-console-retire-legacy-ui.md`，网关工作台决定见 `docs/plans/2026-11-15-gateway-management-workspace.md`。

**当前数据状态：** 首页 `/`、Agent 客户端 `/tools`、资源库 `/mcp`、记忆 `/memory`、
活动记录 `/activity`、设置 `/settings` 按**当前选中的工作区**采集本机事实。模型网关 `/routing` 的运行状态、接入和决策日志属于本机网关，注册表属于服务启动根，不会因为切换 `ws` 变成另一套独立网关。页头显示选中工作区的名字与绝对路径，
实测一次采集 258–303ms：harness-cli 是 80 个服务实例 / 638 条记忆，切到 xsapp 是 52 个 / 365 条，rex-ai-tools 是 56 个 / 333 条——
**数字随根变化**才是真的按根取数；如果切换后数字不动，那就是装饰。**已删除** `demo-data.ts` 与 `flows/service-state.ts`，
`apps/shell/ui/src` 里没有任何指向它们的 import。MCP 向导第三步是真实 `aios mcp add --dry-run`（实测不改文件字节）。
网关工作台可显式保存模型注册表，也可在二次确认后启停网关或改写/还原客户端接入配置。MCP 向导先预览，再经单独授权安装；预览本身不写入。Skills 复用已有安装、同步和移除能力；Subagents 只提供目录与本地 doctor。

## 工作区切换：为什么交回来的是 key，不是路径

本机每个工程都有自己的 `.aios/memo`（实测 18 个）。清单来自 `aios workspaces list --json`：
注册表 `~/.aios/workspaces/<key>.json` ∪ 文件系统证据（子目录里真的有记忆仓）。
页面只交出 12 位 key（`workspaceKey(path)` 的摘要，所有者是 `registry.mjs`），**路径不作为查询参数存在**，
且 key 必须命中本次清单——所以这个界面不是任意目录读取器。不在清单里的 key 退回默认工作区并在页头说明原因：
静默退回会被读成「那个工程是空的」，那是假话。

注册表的写者是 `memory_write` / `memory_checkpoint`（MCP 面）与 `start-session`（会话钩子面）。
它自加入起只产了读端和测试、**零写者**，所以清单永远是空的——这就是项目下拉框当初只能在会话 meta 里猜名字的原因。
`AIOS_HOME` 开关是给测试隔离用的：不接它，一轮回归会往用户真实注册表里写 7 个临时沙箱名（`aios-session-start-*`），实测踩过，
现已由 `workspaces.test.mjs` 钉住。已安装的运行时（7.1.1）还没有 `workspaces` 动词，所以外部工作区在下次发布前只能靠证据发现。
## 开桌面应用（一条命令）

```sh
npm run app
```

它做三件事，别的什么都不做：

1. 端口上已经有服务就**复用**并说一句；没有就起 `scripts/aios-ui.mjs auto`。
2. `auto` 在这里只有一处判断：有生产构建（`ui/.next/BUILD_ID`）走 `start`，没有走 `dev`
   ——所以新克隆不需要先 `npm run ui:build`。
3. 有壳二进制就直接用（release 优先、debug 次之）；一个都没有时**可见地**编译一次。

窗口关掉时，`app` 只停掉它自己起的服务；复用的服务留给它的主人。
界面依赖没装时它只打印 `npm run ui:setup`，不偷偷装 200 MB。

其余入口的区别，避免再猜一遍：

| 命令 | 是什么 | 什么时候用 |
|---|---|---|
| `npm run app` | **桌面窗口** | 想体验产品 |
| `npm run ui` | 浏览器视图（`next dev`） | 改界面、看 HMR |
| `npm run ui:start` | 浏览器视图（跑已构建产物） | 验生产行为 |
| `npm run shell:dev` | `cargo run`，会先编译 Rust | 改壳的 Rust 代码 |
| `npm run shell:bundle` | 出 NSIS 安装包 | 出包 |

## 形状（目录预算 `directoryEntries=8` 硬约束）

```
apps/shell/                 ← 5 项
├── README.md
├── .gitignore
├── data/                   ← 5 项：事实装配（纯函数 + 进程入口）
│   ├── matrix.mjs / matrix.d.mts
│   ├── sources.mjs
│   └── load.mjs / load.d.mts
├── ui/                     ← 6 项：Next.js 界面（源文件在 src/ 下）
│   ├── src/                ← 4 项
│   │   ├── app/            (layout.tsx, (console)/page.tsx, (console)/[section]/page.tsx, globals.css)
│   │   ├── components/     (console/ 当前界面与 flows/，ui/ 共享组件)
│   │   ├── lib/            (console-navigation.ts, console-facts.ts, cn.ts, actions.mjs, trust.mjs)
│   │   ├── lib/config/     (host-capabilities.mjs：声明表的可编辑面，不是取数)
│   │   ├── lib/data/       (后端取数与动作：console-facts.mjs 首屏装配、mcp.mjs、sessions.mjs、memo-store.mjs 等)
│   │   └── proxy.ts        本地信任边界的 HTTP 翻译层（Next 16 已把 middleware 改名为 proxy）
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.mjs
│   ├── postcss.config.mjs
│   └── tsconfig.json
└── src-tauri/              ← 6 项：桌面壳（S1 窗口 + S2 收口 + 能力进程生命周期）
    ├── Cargo.toml / Cargo.lock
    ├── build.rs
    ├── tauri.conf.json
    ├── icons/              (32x32、128x128、128x128@2x、icon.ico)
    └── src/                (main.rs, lib.rs, sidecar.rs, job.rs)
```

`ui/` 只剩 6 项：`proxy.ts` 必须与 `app/` 同级，而 `ui/` 顶格是 8，所以源码整体搬进 `src/`
（Next 的一等目录布局，不是实验开关）：`src/` 4 项 + 4 个不可移动的配置文件 + `package-lock.json`。
`next dev` 会重写 `ui/AGENTS.md`，它按 `next-env.d.ts` 同档进 `.gitignore`。
`src-tauri/target/` 与 `src-tauri/gen/` 同样不计入预算。

## 技术栈（用户裁定，不是默认偏好）

| 层 | 选择 | 理由 |
|---|---|---|
| 样式 | **Tailwind 4**（CSS-first，无 tailwind.config.js） | 不写原生 CSS；`@theme` 把 `--rex-*` token 挂进 utility |
| 交互 | **Radix UI**（`@radix-ui/react-popover` 1.3.1） | 无头组件里下载量最高的一族（实测上周：`react-dialog` 90.3M、`react-popover` 68.2M，`@headlessui/react` 9.8M 低一个量级） |
| 表格 | **TanStack Table 8.21.3** | 无头表格主流版本；v9（9.3.1）换了 API 形状（`createTableHook`/feature 注册），比 13 行的矩阵需要的机器更重，先用 v8 |
| 框架 | Next.js 16 + React 19 | 与 Cline 的壳同代，抄壳时结构对得上 |

## 五条不能破的约定

1. **页面里不许有伪造的事实。** 界面上的每一个数字都有真实出处：本机状态数字在 `console-facts.mjs` 的 `sources[]` 里
   找得到同名字段，首页路由观测的日志计数来自网关决策日志（`/api/model-routing/decisions`）——两者都不是示例；
   采集项各自报成功/失败（`degraded[]`），一项挂了不变成「用户没有东西」。
   这条门不用词级 grep 把关（否定式文案与用户真实 memo 里都会出现「示例」），而是由
   `shell-labels.test.mjs` 断言 fixture 文件不存在且无源文件 import 它。
   真实 API 的读取由 `lib/data/` 拥有，不把 `scripts/lib/**` 直接拖进客户端打包图。
   配置已写入、落点已验证与当前连接测试结果是三条不同事实，界面不得互推。
2. **token 只有一个所有者。** `@theme` 里的每个值必须等于 `docs-site/assets/redesign/tokens.css` 的对应
   `--rex-*`，由 `shell-tokens.test.mjs` 逐条比对。globals.css 里允许的选择器只有 `:root[data-rex-theme="dark"]` 和 `body`。
3. **选择必须驱动其声明的数据范围。** 工作区切换走 `?ws=<key>` → 服务端按该根重采集本机事实；模型目录与请求筛选在已读取的快照内过滤，界面明确最近 100 条的范围，不冒充全日志查询。
4. **服务端组件不从 `'use client'` 模块取数据。** 路由传递视图 ID 与服务端采集的 `ConsoleFacts`；路径、可读标签和旧链接迁移由 `lib/console-navigation.ts` 共享。网关运行态、配置与日志由客户端通过受 token 门保护的 API 读取。
5. **浮层共用一个焦点与遮罩注册表。** Dialog、Select 与 DropdownMenu 对齐 Radix 版本；`react-dismissable-layer` 和 `react-focus-scope` 显式固定为单份依赖。相同版本的嵌套副本也会割裂注册表，导致 Esc 误关父弹窗、关闭后页面仍被 `pointer-events: none` 锁住；开发浏览器测试同时检查锁文件拓扑与真实退出交互。
5. **一种交互只有一个形状。** 共享件是交互契约的唯一所有者：表面 `Panel`、徽章 `Badge`、按钮 `Button`、弹窗 `Modal`、
   输入 `Input`/`Select`/`Textarea`（`Input`/`Select` 以 `size` 为唯一变化轴，`Textarea` 高度由 `rows` 驱动）、空态 `Empty`、异步态 `Loading`/`ErrorState`/`InlineFeedback`，
   一律从 `components/console/console-ui` 取（它 re-export `components/ui/` 的原子件 `primitives.tsx`/`states.tsx`/`button.tsx`）。
   页面不许再手写第二套加载/错误/反馈态，也不许写裸 `input`/`select` 类名——那会让同一个交互在不同页长得不一样。
   圆角/颜色走 rex token（`rounded-rex-lg` 而非 `rounded-2xl`）；动效一律带 `motion-reduce:` 兜底
   （`shell-tokens.test.mjs` 对 console-ui/console-workspace 的双引号 className 逐条判定）。

## 当前入口与旧链接

`/` 是只读客户端路由观测：分开显示本机配置落点、最近 50 条日志内的请求及时间、实现角色的配置默认和日志计数。不从历史请求推断客户端在线、当前连接或网关健康。`/tools`、`/routing`、`/mcp`、`/memory`、`/activity`、`/settings` 是同一套 Console 的视图。导航保留 `ws`，支持刷新及前进后退。

### Agent 客户端、目标与资源库操作契约

`/tools` 的每个客户端分开显示程序安装/版本/来源、配置落点、网关配置观察和恢复记录。
找到配置文件不代表找到可执行程序；可执行程序存在不代表来源可验证；`connected: true`
只证明当前配置指向网关，不证明客户端在线、已加载配置或上游生成成功。

- 右侧接入开关只改该客户端配置，不启动或停止网关。Claude、Codex、Pi 有接入适配器；
  其他客户端显示不支持，不猜测配置格式。确认时捕获目录哈希和网关端口，提交后由 API、
  CLI 和写入运行时重新核对。目录变更需刷新并重新确认；缺少有效哈希禁止接入/应用目标，
  但不阻止对安全、受管配置执行断开还原。
  运行总览的旧接入入口使用同一 revision 门：GET 的 `configuredRevision` 与端口在打开
  确认时捕获，轮询更新不会替换这次批准；所有 connect 请求都必须提交有效 revision。
- 目标可选具体模型、路由组或 AIOS Auto。固定模型/组绕过角色和意图；Auto 进入既有分配链，
  并不保证一定调用分类器。空分配值表示继承，不等于 Auto。原生默认、清除固定目标与断开
  还原是不同动作；目前三个适配器均不能保证接入后安全清除默认，因此不提供原生选项。
- 接入工件携带客户端身份及保留的 `aios-*` 选择器。Pi 发布模型/组目录；Claude 的
  `availableModels` 不能证明支持任意模型选择器，Codex 自定义目录 schema 尚未验证，
  因此不会伪造这两种目录能力。可在此固定目标，或在客户端支持时使用已发布的 wire ID。
- `readback.target` 是配置观察，`defaultTarget` 是恢复日志中的请求值；归属、漂移和待恢复
  状态独立展示。不确定失败后关闭确认并重读，不能因 HTTP 200 或旧日志显示成功。断开只
  还原 AIOS 持有且未漂移的字段，保留用户新增内容，不清除网关进程或日志。
- 客户端更新先读取 PATH、真实路径、元数据和版本，再显示具体程序与参数。当前仅对来源
  可验证的受支持 npm-global 安装提供更新；Homebrew、原生 Claude、应用商店、Windows
  shim 和未知来源不猜更新命令。写入需 `confirm: true` 和精确预览 revision，运行前再次
  核对来源；失败/超时或读回无法验证时保留锁供检查，不自动重试或重启客户端。

模型分配与组编辑共用原有草稿和底部「保存全部修改」。角色/意图可选择组，分类器只能
选择合资格的具体模型。组成员是原始具体模型 ID，不是嵌套组或 advertised wire ID；可排序、
启停和编辑，存在实际分配引用时禁止删除（包括角色、规则及意图后备和嵌套环境分配）。
失效引用与未知元数据保留，不按目录猜测或静默修复。

持久化分配采用 `targetRefVersion: 1`：`model:<encodeURIComponent(id)>`、
`group:<encodeURIComponent(id)>` 和 `auto`。未版本化字符串一律是字面模型 ID，
即使名字为 `auto`、`group:x` 或 `model:foo`。迁移仅处理真实分配字段，保留大小写、空白、
非 record 角色值及扩展元数据；分类器和组成员仍是原始具体模型 ID。
浏览器本地角色方案也保存版本标记并支持模型、组和 Auto。应用旧方案时只迁移副本，
不改写原存储；无效引用/版本拒绝应用，损坏或不可读的存储不允许被新方案覆盖。

路由组按成员顺序优先，不提供权重、成本优化或负载均衡。派发前跳过不合资格候选；派发后
只有该模型的全部派发账号明确返回 `401`、`402` 或 `429` 才允许切到下一模型。
网络异常、`408`、`5xx` 不默认跨模型重放；输出已提交、取消或截止后不重试。每个候选从
原始请求重新翻译、脱敏、认证和解码；成功后的会话亲和绑定目标、模型、provider、协议、
账号和配置指纹，不把一组中所有模型视作可互换的工具续轮。

`/mcp` 是资源库，不是向量文档知识库。三个页签复用现有能力：

| 页签 | 已提供 | 安全边界 |
| --- | --- | --- |
| MCP | 清单、落点、真实 dry-run、确认安装、本机 Search/Fetch 预设 | 不覆盖外部/冲突条目；安装不启动服务或调用付费工具 |
| Skills | 清单、来源/版本/归属、预览后安装/同步/移除 | 精确 revision 和受管内容保护；显示共享落点及影响客户端 |
| Subagents | 规范角色、投影/验证证据、只读 doctor | 不提供增删改、启动、smoke 或 probe；投影不等于已安装/验证 |

**MCP 安装确认：** 先选择可写落点和服务配置，再执行真实 `add --dry-run`。安全预览才会
获得服务端保存的短期、一次性 opaque `previewId`，绑定规范化 argv、运行时、项目及当前
配置/ownership ledger revision。勾选授权并确认写入；浏览器不直接决定 revision。
服务端在异步执行前消费批准，再经 `AIOS_MCP_EXPECTED_REVISION` 传给 CLI，运行时在锁内
检查配置与 ledger，并在 rename 前重新检查字节和 revision。取消、编辑、过期、失败、
重复提交或服务重启后都需重新预览授权；跨 worker 不共享批准时失败关闭。
写入成功或结果不确定时均刷新清单，不把预览的 `planned` 当成安装成功。
协作锁及 rename 前检查不等于对任意外部编辑器提供 OS 级 compare-and-swap；有并发冲突时
检查当前文件、备份和 ledger，不盲目重试旧批准。
备份以 `0600` 权限、防碰撞文件名和独占创建写入。若 ledger 保存失败，补偿只恢复/移除
仍与本次提交字节一致的配置；发现外部修改时保留它及备份，返回 `rollback-incomplete`
和恢复信息，不宣称已回滚完成。ledger 自身也在替换前核对读取快照。
损坏、较新版本或不支持记录形态的 ledger 只提供诊断，不按空账本覆盖；预览与写动作会
返回 `ledger-invalid`，需先由所有者检查并恢复账本。

**DeepSeek 联网搜索：** 资源库的 Search/Fetch 预设使用所选 AIOS 运行时旁的
`scripts/aios-search-mcp.mjs`，不是项目目录中同名脚本。把 `DEEPSEEK_API_KEY` 设置在
启动客户端的安全环境中，由 MCP 子进程继承；预设不在浏览器收集或落盘密钥。
启动、初始化、工具发现、预览和安装都不发起付费请求；只有实际调用 `deepseek_search`
或 `deepseek_fetch` 才向 DeepSeek 发送查询或 URL。它独立于生成模型，不会替换所有客户端
原生 Web 工具，也不代表任意账号已获权限。官方文档价为成功且非空的 Search/Fetch
各每千次人民币 5 元（英文站美元 0.75），`count` 不影响单次价格；以官方现价为准。
完整参数、计费、出站数据、响应限制及离线测试见
[`scripts/lib/tooling/search/README.md`](../../scripts/lib/tooling/search/README.md)。

**边界决定：** 路由语义由 CLI/runtime 拥有，Next API 只翻译受校验的结构化 argv，UI 不另做
路由执行。UI 目标语法镜像通过 parity 测试与权威 helper 保持一致，避免把 CLI 运行时拖入
浏览器包。资源库复用既有 MCP/Skills/Subagents，而非另造管理后端；Search 使用现有 MCP
SDK 和受限本机 stdio 入口，而非额外常驻搜索 daemon。取舍是保守暴露已验证能力，不以
虚构目录、自动更新命令或免费搜索承诺填补客户端/供应商能力缺口。

`/routing` 使用一个持久挂载的 `GatewayWorkspace`，按任务分为四区：

| 分区 | 深链 | 职责 |
|---|---|---|
| 运行总览 | `/routing` | 网关启停、客户端接入/还原、只读客户端观测 |
| 供应商与模型 | `/routing?section=providers` | 供应商编辑、模型目录搜索/来源筛选、自定义模型、确认后发现目录 |
| 模型分配 | `/routing/config` | 模型/组目标、全局角色默认、客户端继承/覆盖、意图规则、路由组及浏览器本地角色覆盖方案 |
| 请求记录 | `/routing?section=requests` | 日志总计、最近 100 条筛选/详情、模型请求分布 |

所有配置区共用 `model-routing/use-routing-config.ts` 的一份草稿。切分区或 Console 视图不丢草稿；保存全部修改才写注册表。放弃/重新读取均需确认；有草稿时禁用发现目录，离开文档时提醒。保存失败或 409 保留草稿，不静默覆盖外部修改。写入前备份已有注册表，首次从内置配置创建时没有旧文件可备份；适配器保留未暴露的供应商、模型与路由组元数据。

**并发写入边界：** UI 保存、CLI 发现/分组/供应商导入及 connect/disconnect 共用注册表旁的 `model-registry.json.write-lock` 目录锁。锁内重新读取、核对快照哈希并原子替换；发现等待网络期间发生保存时，拒绝过期结果，不覆盖新配置。接入/还原也在锁内读取，只修改自己的 codex 默认值，保留其它新配置。写后验证若读到不同字节，保留外部版本并报冲突；不能确认磁盘状态时不盲目回滚或删除首次创建的文件。外部编辑器若不遵守锁协议，仍可能与写入冲突，应重新读取核对，不能把目录锁视为任意文件编辑的事务隔离。

锁等待最多 5 秒，不按锁年龄或 PID 自动抢占。进程异常退出可能留下锁：先确认所有相关写入进程已停止，再检查当前注册表与备份，最后手工删除残留的 `.write-lock` 空目录并重新读取。不要在仍有写入者运行时删除锁，也不要直接重试旧草稿覆盖磁盘。

**落盘不等于运行中已加载。** 网关在启动时读取注册表，不热更新。保存配置或刷新模型目录后，应在运行总览停止并重新启动托管网关；外部前台进程需在原终端重启。界面展示的「配置默认」是磁盘快照，不是运行中进程的加载确认。

**默认空接入。** 新安装的网关注册表没有供应商、模型或默认策略，不会隐式连接 relay。原生 CLI 的模型参考资料单独保存在 `native-model-templates.json`，不进入网关候选。已有用户注册表原样读取，不重置、不与空默认值深合并。只有显式绑定到供应商且声明了共同协议的模型才进入目录与策略；旧 curated 条目的 `provider` 只是启动器元数据，除非供应商的 `models` 列表唯一显式绑定它。

先添加供应商，选择厂商预设（有地区或套餐时按密钥所属选项选择）或自定义渠道。主要 API 配置其 Base URL，其他 API 地址独立填写；未填写的 API 不会自动启用。Chat Completions、Responses、Anthropic Messages 和 Gemini 可分别使用不同域名、版本或路径前缀。供应商预设仅填连接，不读取密钥、不发起请求、不自动添加模型；保存后发现目录或手动添加真实上游模型 ID。模型的本地路由标识与 `upstreamModel` 分开，真实 ID 保留大小写，同名模型可分属不同供应商。需要凭据是默认行为；只有明确选择 `authMode: none` 才允许不带密钥请求。缺少凭据时本地拒绝，不把空密钥当作匿名授权。发现目录只证明读取过模型列表，不证明生成请求可用。

供应商的 `protocolBaseUrls` 显式保存各 API 地址；存在时为权威配置，不回退到 `baseUrl` 拼接其他 API。Chat/Responses 在 Base URL 下使用 `/chat/completions`、`/responses`，裸域名才补 `/v1`；Anthropic 在地址下使用 `/v1/messages`（已有 `/v1` 不重复），Gemini 使用 `/models/{model}:generateContent`，裸域名才补 `/v1beta`。Gemini 模型 ID 保留命名空间分隔符并逐段转义，空段、`.`、`..` 在转发前拒绝。不同 API 的模型列表在相同 API 基址下读取。地址不得携带用户密码、查询参数或片段。没有 `protocolBaseUrls` 的已有配置继续按原 `endpointStyle` 解析；读取、取消和未编辑保存都不迁移旧地址。

第三方 Anthropic 可选择 `authHeader: x-api-key|bearer|both`；省略时保持已有的 x-api-key 行为。`headers` 支持额外非敏感请求头及 `env:VARIABLE` 引用；认证头只能用环境变量引用，禁止连接/报文长度/Cookie 等受保护头。声明无需认证时不能另配凭据头。发现、分类和转发共用认证规则。修改或新增任一 API 地址后，带凭据的供应商需确认密钥发送范围；仍只加入共享草稿，统一保存才落盘。本表单不冒充已支持 Magpie 的订阅登录、插件、Vertex/Bedrock 签名或自动生成探测。

`/health` 的 `ok: true` 只表示监听进程正常，`ready` 单独表示当前启动快照存在可转发的显式路由。无可路由模型时请求本地返回 `503 NO_ROUTE_CONFIGURED`，不调用分类器或任何上游。单个已启用且具备凭据的模型可直接路由；多个模型需要显式角色/默认选择或就绪的意图分类策略。Console 在运行但未就绪时禁用新接入，已有接入仍可还原。

启用脱敏时，意图分类与生成请求都先经过同一个请求级脱敏边界；协议翻译后再次脱敏，共用原映射，覆盖工具参数序列化产生的敏感字符串。只有显式 `x-gateway-session` 才复用该会话的工具续轮意图；未提供会话标识时，从当前请求自己的用户轮历史重新分类，不把客户端名称当作会话缓存键。重新分类仍可能产生供应商费用，因此仅适用于用户已显式启用的就绪意图策略。

### Gateway protocol compatibility

The routing gateway (CLI default `http://127.0.0.1:8686`, not the Console on
3126) accepts these inference paths:

| Client wire protocol | POST path |
| --- | --- |
| Anthropic Messages | `/v1/messages` |
| OpenAI Responses | `/v1/responses` |
| OpenAI Chat Completions | `/v1/chat/completions` |
| Gemini JSON | `/v1/models/{model}:generateContent` |
| Gemini SSE | `/v1/models/{model}:streamGenerateContent?alt=sse` |

Native Gemini SDK `/v1beta/models/...` paths are aliases. The path chooses the
client wire protocol; `x-gateway-client`/`x-gateway-role` select routing identity,
not protocol. Ordinary client model aliases retain the existing assignment
behavior. Only reserved `aios-auto`, `aios/model/<encoded-id>` and
`aios/group/<encoded-id>` selectors explicitly choose Auto, a registered model or
a registered group. Explicit headers, body and Gemini path selectors must agree;
malformed, unknown or contradictory reserved selectors fail with 400 rather than
falling through.

All four upstream protocols have JSON and incremental SSE adapters to all four
client protocols. This includes text, function tools, multi-turn tool results,
usage and terminal events, not just rewriting the outbound request body. A bound
model/provider offering the native client protocol prefers native forwarding,
preserving vendor extensions. Standard Gemini streaming selects
`:streamGenerateContent?alt=sse` and puts neither `model` nor `stream` in its body;
legacy relay endpoint semantics remain separate.

Cross-protocol compatibility is not an assertion that every vendor feature is
equivalent: unsupported stateful Responses references, built-in hosted tools,
thinking/signatures, audio/video or other unrepresentable content/options are
rejected explicitly rather than discarded. Representable images and common
generation options are mapped by the request codec. Same-protocol forwarding
remains opaque and preserves provider-specific extensions.

Translated Responses requests explicitly disable response persistence with
`store:false`. A Responses function tool with omitted/null `strict` retains its
effective strict guarantee: OpenAI targets receive the normalized strict schema;
Claude/Gemini targets require an explicit `strict:false` opt-out instead of
silently weakening it. Function names and image formats must be valid for the
target API; the gateway does not rename tools, transcode GIFs for Gemini, or fetch
remote images to guess their contents.

Explicit token-limit finishes preserve incomplete tool-argument strings in
Chat/Claude/Responses SSE, including through masking restoration. Native Chat
and Responses JSON can also preserve them. Cross-protocol JSON requires complete
argument JSON, and Gemini requires a complete argument object; those unsupported
truncated forms fail rather than receiving invented closing bytes.

Unsupported requests fail locally before classifier/generation calls. Upstream
HTTP errors keep their status in the client's error envelope; invalid upstream
JSON or mismatched stream modes return 502. Translation errors/truncation become
client-protocol error events (HTTP headers may already be 200), never a fabricated
successful completion. Deadlines and cancellation cover response consumption,
not only time to upstream headers.

Response masking restores parsed JSON values and the extra JSON-string layer of
tool arguments, not raw serialized SSE text. Standard text/tool delta channels
can carry a placeholder across events without buffering the full response.
With an empty mask mapping, native SSE is byte-opaque; a nonempty mapping requires
JSON SSE data (or `[DONE]`) and bounds frames, channels and nesting. Unknown JSON
extension fields restore within their event, not across extension-specific delta
formats. Restoration/parser failures terminate the stream without inventing a
successful terminal event.

This is still a loopback/local-trust service, not a public multi-tenant API.
Installing code does not reload an already-running gateway; loading a new runtime
requires a separately authorized restart. Protocol tests use fixture upstreams,
not live paid model calls.

Verification snapshot (2026-11-16): the expanded isolated runtime/fixture checks
pass 1300/1300. The wider dirty-worktree regression reports 3787 pass, 32 fail and
15 skip, with the same 32 failure identities as its retained baseline; this is
not a clean-HEAD or release-gate pass. Final evidence, the blocked standards gate
and module-budget tradeoffs are recorded in
`docs/plans/2026-11-15-gateway-management-workspace.md`.

可先运行 `aios model-router connect --dry-run`（也支持 `--isolated`）检查显式路由资格；演练不修改客户端、注册表或接入状态，也不调用上游。它不是实际生成探针，不证明供应商可用。其它子命令收到 `--dry-run` 会明确拒绝，不会忽略标志后执行操作。Codex 不再填入内置默认模型，使用显式模型选择或已配置的可用路由。

多客户端就地接入会先预检全部编辑，并在首次改写前持久化恢复日志。修改 Codex 注册表默认值前另写入命令级恢复状态，最终状态写入失败也能重试或还原，不把已接入值当作原始默认值。已接入 A 后切换 B 失败时，恢复状态同时保留最初默认值、修改前的 A 和目标 B；不会把仍在磁盘上的 A 误判为外部冲突，也不会覆盖最初备份。中途写入失败后保留原始值；受管理字段被外部修改时拒绝覆盖，非受管理的用户新增内容保留。重复还原仅清理接入自有工件，不删除网关 PID、决策日志或未知状态文件。

角色覆盖方案只快照角色矩阵，存于当前浏览器 localStorage；应用只改草稿，不包含供应商、密钥或意图规则，也不与 CLI 同步。路由组执行真实的顺序优先与安全后备，不提供未实现的权重、成本优化或负载均衡。请求没有记录的状态、耗时和 tokens 显示「未记录」，不填成成功、零耗时或零成本。

意图规则默认显示「描述摘要 → 目标模型」，点击规则行或「编辑」后行内展开，一次编辑一条；收起只隐藏控件，不撤销草稿。新增规则自动展开并聚焦描述，删除后焦点回到相邻规则（无规则时回到添加入口；不能添加时回到启用开关）。未选择或已失效的目标模型显示「待选择目标模型」，不展示失效 ID，也不自动修复引用。内部 ID 与规则编辑身份分离；所有配置仍经底部「保存全部修改」统一保存。

请求明细的行标识在 JSONL 读侧、倒序及截取最近 100 条之前生成；新增日志不会因数组下标变化重挂载已有行，键盘焦点保留在原请求上。筛选和轮询均不改写日志。

`/routing/config` 仍是二级策略深链，不增加一级导航项；`/gateway` 保留 `ws` 重定向到 `/routing`，不再维护第二套应用外壳。

**网关控制卡（`model-routing/gateway-control.tsx`）**：一键启停本机网关 + 如实显示运行态 + 每客户端一键接入/还原。它经 `/api/model-routing/gateway` 调 CLI（`gateway-status`/`gateway-start`/`gateway-stop`/`connect`/`disconnect`），进程管理与就地接入的单一事实源在 `scripts/lib/tooling/model-router/lifecycle/daemon.mjs`（pidfile + 端口探测 + 安全停止，CWD 挪出安装树、detached 托管、SIGTERM→SIGKILL）与 `connect/inplace.mjs`。启停/接入/还原都是副作用 → 先弹 `Modal` 确认再 POST `confirm:true`，缺确认 409、未知动作 400、非法客户端 400；状态只读，2.5s 轮询且仅在运行总览激活时。运行态诚实区分：`running`（端口在答）/`managed`（界面托管的 pid 还活着）/`stale`（残留 pidfile 但端口没答，绝不冒充运行）；外部前台进程启动的网关如实标注「界面无法替它停机」。未运行时阻止新接入；停机不自动还原客户端，仍接入时显示警告。接入默认「就地」：每客户端一个「接入/还原」按钮，确认后把网关地址外科改写进客户端真实配置（claude `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL/AUTH_TOKEN`、codex `~/.codex/config.toml` 的 `model_provider`+`[model_providers.aios-gateway]`、pi `~/.pi/agent/{settings,models}.json`），只动网关需要的 key、保留注释/顺序/缩进、原子写、备份原值供还原。接入状态不等于模型连接测试通过。隔离模式（`connect --isolated`，生成隔离工件 + 特殊启动命令、不碰真实配置）在可折叠说明内，命令构造单一源为 `connect/artifacts.mjs` 的 `connectLaunchCommand`。前台 `aios model-router gateway`（Ctrl+C 停）不变。

**模型来源（`model-routing/model-source-section.tsx`）**：目录只展示已显式接入的模型，不把内置资料当成可调用资源。「刷新模型」经 `/api/model-routing/models` 调 CLI `model-router models --refresh`，只读取已配置且认证就绪的供应商。显式 API 地址在各自基址下读取模型列表；旧供应商保持原路径规则。某协议 404/超时按来源报告部分失败，密钥只进请求头。新模型保存协议、供应商、来源与真实 ID；跨供应商及大小写冲突分配不同本地标识，不覆盖 native/curated 元数据、不自动填写 active/default/意图策略。自定义模型与供应商通过共享草稿保存，未知元数据保留。刷新会写注册表，因此需要 `confirm:true`。CLI `model-router models [--refresh] [--json]` 同源。

接入客户端时，界面提交状态端点返回的实际端口，API 再次核对网关仍在该端口运行后才调用 `connect --port`；不能把展示的非默认端口悄悄写成 `8686`。发现结果按供应商/协议提示部分读取失败，并明确已有目录保留，不把部分成功说成全部成功。

`/prototype` 和 `/overview` 跳转首页；`/sessions`、`/usage` 跳转活动记录；`/matrix` 跳转 AI 工具。它们仅用于旧书签迁移，不再渲染旧页面。原矩阵、会话、记忆和 MCP 后端接口继续保留，未删除数据。

## 能力层暴露的两个实测事实（界面必须如实显示）

- 逐轴的原因为**不存在**：配置只有行级 `limits[]` 与可选 `subagents.evidenceRef`，所以单元格只表达「是否声明」。
- 配置声明 13 个客户端，`aios status` 只覆盖 10 个 ⇒ 未覆盖显示为 `not-covered`，**不等于「好」**。

## 验证

```sh
node --test "scripts/tests/tooling/shell/**/*.test.mjs"   # interface/ 含真实 HTTP 入口与旧链接迁移；desktop/ 是壳
node scripts/aios-standards.mjs --root . --rule directoryEntries
npm run shell:test                                      # cargo test（10 用例：端口、参数、cwd、等待、job、token）
node --test scripts/tests/tooling/shell/model-routing-config-api.test.mjs # 临时根中的真实配置 handler
node --test scripts/tests/tooling/shell/model-routing-concurrency.test.mjs # 临时根中的跨进程锁与真实隔离接入
AIOS_GATEWAY_TEST_ARTIFACTS=/tmp/aios-gateway-check node --test scripts/tests/tooling/shell/interface/dev-server-trust.test.mjs
npm run ui:build && node scripts/tests/tooling/shell/browser/gateway-motion.mjs # 生产 UI 只读拍帧
```

真实 dev-server 测试复用同一 token 门运行网关浏览器回归，所有浏览器 API 均拦截，未知请求失败关闭；不改真实客户端配置、不发起扣费模型调用。需要已有 Playwright Core 与 Chrome；缺失时报告 SKIP，不计作通过。浏览器截图由 `AIOS_GATEWAY_TEST_ARTIFACTS` 指定目录，帧级命令使用独立生产服务与只接受 GET 的临时认证转发，不改产品信任门。

### 网关工作台上一轮验收（2026-11-15，默认空接入改动之前）

- 配置/API/供应商运行时/路由/网关/接入等聚焦回归 **232/232 通过，零跳过**；其中恢复与并发子集 **43/43**，覆盖真实锁超时重试、旧状态恢复、重复/顺序接入和跨进程接入/还原。
- 独立浏览器验收 **8/8 通过，零跳过**，并在最终完整回归中再次通过；覆盖草稿、失败/409、确认、导航、请求焦点、390px、短屏、深浅主题与减少动效。四区生产帧级样本分别 **107/107/106/108 帧**，均零 findings、零页面/录制错误。
- 类型检查、生产构建、脚本语法、设计与动效声明门通过；构建仍有 **6 条动态文件系统 tracing 警告**，不算无警告构建。
- 完整回归正常结束：**318 个文件、2822 项测试，2775 通过、32 失败、15 跳过、零取消**。剩余 32 个失败身份均见于保留的较早完整日志，但没有干净 HEAD 对照，不能据此保证与全部改动无关，更不能声称全仓通过。当前诊断包括 Rex 公开导出/标准转发、上下文编排、训练认证 baseline 和 `llms.txt` 版本漂移；标准入口仍因缺少 `runStandardsArgs` 在测量前失败。

完整回归使用凭据清空的隔离环境、中性且规范化的临时 HOME，以及显式 `AIOS_CLI=<repo>/scripts/aios.mjs`，避免把本机安装定位或路径命名依赖混作产品回归。完整命令、逐区帧数/元素数、比较边界见[工作台计划与验收证据](../../docs/plans/2026-11-15-gateway-management-workspace.md)。本机截图与帧报告位于 `/tmp/aios-gateway-acceptance/`，完整结果与比较位于 `/tmp/aios-gateway-regression-final.log`、`/tmp/aios-gateway-regression-comparison.md`；这些是临时验收材料，不是发布产物。

### 默认空接入本轮验收（2026-11-15）

- 最终模型/路由/网关/脱敏/接入及原生 CLI 组合 **360/360 通过**；Shell 配置/API/供应商/布局、网关控制 API 与清单组合 **140/140 通过**，均零跳过。重叠的接入/显式配置/并发子集 **142/142**；A→B 切换故障专项经独立只读复核 **14/14**。
- Token 门后的 Console 浏览器验收 **9/9**、延迟加载布局 **11/11**、动效门测试 **39/39** 通过。原 390px 溢出用例在最终全仓运行中再次通过；已查看桌面/手机、空态/错误态、供应商对话框与短屏保存条截图。
- 类型检查和生产构建通过，仍有 **6 条动态文件系统 tracing 警告**。四区生产拍帧为 **109/109/108/108 帧**，全部零 findings、零页面/录制错误；未放宽验收阈值或以隐藏 overflow 掩盖布局问题。脚本语法 **1430 文件零失败**，设计/动效声明与材料/路径门通过。
- 最终全仓 **323 文件、2994 项测试：2947 通过、32 失败、15 跳过、零取消**，exit 1。运行前后核对 **5390 个输入文件无漂移**；记录结果后仅更新本 README 与工作台计划。32 个失败身份均见于保留的 dirty-tree 对照，未发现新增身份，但不是干净 HEAD 基线，**不能宣称全仓通过**。标准入口仍缺 `runStandardsArgs`，在测量前阻塞。

本轮完整证据与复现命令见[工作台计划的最终显式接入验收](../../docs/plans/2026-11-15-gateway-management-workspace.md#final-explicit-access-evidence-2026-11-15)。最终日志、输入哈希及失败比较位于 `/tmp/aios-explicit-regression.log`、`/tmp/aios-explicit-regression-input-hashes.json`、`/tmp/aios-explicit-regression-comparison.json`，四区帧报告位于 `/tmp/aios-explicit-gateway-acceptance/`。这些是临时验收材料，不是发布产物。既有改动与暂存状态保留，未提交、未推送、未修改真实客户端配置，原 `127.0.0.1:3126` 服务仍在运行。

## 桌面壳（S1 窗口 + S2 收口与门）

壳只做两件事：开一个窗口，并决定背后的**能力进程**是启动还是复用。它不持有任何事实——
页面服务端自己去问 `ui/src/lib/data/console-facts.mjs`（旧矩阵入口 `data/load.mjs` 仍在，只服务 CLI/CI 与旧路由）。
S2 在同一个壳上补了三件事：进程收口、本地信任边界、打包。

```sh
npm run shell:dev    # = cargo run --manifest-path apps/shell/src-tauri/Cargo.toml
npm run shell:build  # = cargo build --release --manifest-path …
```

启动顺序（`src-tauri/src/lib.rs`）：

1. **端口**：`AIOS_UI_PORT`，否则 `DEFAULT_UI_PORT`。后者与 `scripts/aios-ui.mjs` 的
   `UI_DEFAULT_PORT` 是同一个事实，由 `shell-sidecar.test.mjs` 钉住两值相等。`tauri.conf.json`
   里的 `devUrl` 已删除：窗口 URL 带 token，由代码生成，配置里再写一份就是第二个事实，
   且那份事实不带 token（`shell-sidecar.test.mjs` 断言它保持删除）。
2. **安装根**：`AIOS_SHELL_ROOT`，否则从当前目录、可执行文件所在目录逐层向上找
   `scripts/aios-ui.mjs`。仓库里直接跑因此不需要任何环境变量。
3. **接上还是拉起**：端口已经有响应就**复用**（开发时 `npm run ui` 已经在跑），否则
   `node scripts/aios-ui.mjs start --port <port>` 起进程，等它真的 accept 再开窗口。
   先开窗口再等的话，用户看到的是「连接被拒绝」，而**回不来**。
4. **工作目录**：能力进程的 CWD 必须落在安装树之外（`resolve_work_dir` 是这条判断的唯一所有者）。
   实测依据见 ADR：CWD 在安装树内的进程会让 `aios update` 的目录替换 `EPERM/EBUSY`。

实测（2026-11-05）：`next start -p 3126` 默认同时绑 `0.0.0.0` 与 `[::]`，等于把能力进程发布到
局域网。启动器现在显式传 `-H 127.0.0.1`，绑定的端口上只剩 `127.0.0.1:3126`。

### 进程收口：子进程不会比壳活得久

`RunEvent::Exit` 只覆盖「正常退出」，而任务管理器、崩溃、注销都不走它。所以保证来自操作系统：

- **Windows**：能力进程被放进一个 `KILL_ON_JOB_CLOSE` 的 Job Object。壳以**任何方式**结束时内核
  关闭 job 句柄，job 随之杀掉成员——不需要任何处理器被调用。
- **Unix**：子进程自带进程组（`process_group(0)`），收尾时对整组发 `SIGKILL`。

赋值失败不静默：`is_supervised()` 为假时壳会打印「强杀将留下孤儿」的警告。实测（2026-11-05）：
`taskkill /F` 掉壳体后端口立即释放，`node` 进程数归零。

### 本地信任边界：token 换 cookie

页面在 loopback 上，「只有本机能访问」不是边界——本机上每个进程、每个标签页都在本机。
要挡的是**另一个 origin 驱动这一个**。

1. **谁起服务谁持有钥匙**：`scripts/aios-ui.mjs` 生成 128 位 token，写进易失目录
   （`<tmp>/aios-ui-token-<port>`，POSIX 0600），并把带 token 的 URL 打到 stderr。
   所以 shell 自起与开发态手动起走同一条协议，不存在「忘了设环境变量就没有门」的状态。
2. **窗口打开的是交换地址** `http://127.0.0.1:<port>/t/<token>/`：`src/proxy.ts` 校验通过后
   种一个 `HttpOnly; SameSite=Strict; Path=/` 的 cookie 并 307 到 `/`。资源请求带不了查询串，
   所以靠 cookie 认证。
3. **判定顺序**（`src/lib/trust.mjs`，纯函数，决定表在 `shell-trust.test.mjs`）：没有声明 token
   → 拒；`Sec-Fetch-Site: cross-site` → 拒；`Origin` 不是本机同端口 → 拒；token 交换路径 →
   发 cookie；cookie 命中 → 放行。第二、三条之所以必须有，是浏览器把「同主机的不同端口」算作
   same-site，光靠 `SameSite` 挡不住 `127.0.0.1:8080` 上的页面。
4. **拿不到 token 就不开窗**：壳拒绝展示一个没有门的页面，而不是降级成无 token 模式。

实测请求矩阵：裸 `/` → `403 missing-token`；错 token → 403；对 token → 307 + `Set-Cookie` →
200 且页面渲染；带 cookie 但 `Origin: http://127.0.0.1:8080` → `403 foreign-origin`；
`Sec-Fetch-Site: cross-site` → `403 cross-site`；`/_next/static/*.js` 无 cookie 403、有 cookie 200。

### 打包（S2-3，不签名）

```sh
npm run shell:bundle     # = tauri build --bundles nsis
```

产物：`apps/shell/src-tauri/target/release/bundle/nsis/AIOS_0.1.0_x64-setup.exe`（1.84 MiB）。
`bundle.active=true`、`targets=["nsis"]`，**不签名**。

`frontendDist` 指向 `src-tauri/resources/`（一个说明性 index.html），不是 `../ui/.next`：
实测前者产出 1.84 MiB 安装包，后者把 125 MB 的 Next 产物塞进一个永远不会读它的安装包，
安装包涨到 90.16 MiB。窗口加载的是能力进程渲染的页面（`force-dynamic`，静态导出表达不了）。

**安装包能做什么、不能做什么**：它是一个窗口，启动时向上找 `scripts/aios-ui.mjs` 决定安装根。
因此它要求目标机器上有一份装好依赖并构建过界面的 AIOS 树（`npm run ui:setup && npm run ui:build`）。
**本机未执行安装验证**：安装会写 Program Files 与注册表，属于系统级副作用，留给所有者决定。
「壳要不要自带运行时」是 S2-3 之后仍未关闭的产品决定，写在
`docs/plans/2026-11-05-shell-s2-plan.md`。

**S2 仍未做**：签名/公证、托盘与自启、强杀后残留 token 文件的清理（下次启动会被新 token 覆盖，不构成安全面）。网关、Agent 客户端和资源库的写动作经 token 门及各自的预览/确认/revision 保护，不是桌面壳直接写配置。

## 从仓库根启动（不需要 cd 进 apps）

```sh
npm run ui:setup      # 第一次：装 apps/shell/ui 的依赖
npm run ui            # 开发模式；打开的地址是启动器打印的 http://127.0.0.1:3126/t/<token>/
npm run ui:build      # 产物构建
npm run ui:start      # 跑已构建的产物
npm run ui:typecheck  # 只过 tsc
npm run test:shell    # 只跑界面层的测试
```

端口用一个**声明**，不用参数透传：`npm run ui -- --port 3300` 或 `AIOS_UI_PORT=3300 npm run ui`。
实测 `npm run ui -- --port 3131` 会把 3131 当位置参数塞给 `next dev`，当成项目目录直接报错；
而且 Windows 上 `spawnSync('npm', …)` 会 ENOENT（npm 是 `npm.cmd`），所以 `scripts/aios-ui.mjs`
直接 `node node_modules/next/dist/bin/next <mode> -p <port>`，三个平台形状一致。

根脚本只是入口，实现在 `scripts/aios-ui.mjs`（它是 ADR 决策 3 里能力进程入口的雏形，
以后 `aios ui` 接在这里）。端口不写在 `apps/shell/ui/package.json` 的脚本里，只有一个所有者。

`dev` 与 `start` 都会在启动时把 token 打进 stderr：**直接打开 `http://127.0.0.1:3126/` 会得到
`403 missing-token`**，这是门在工作，不是故障。壳不读这行文字，它读
`<tmp>/aios-ui-token-<port>` 这个文件——同一个事实，两条不同的消费路径。

### 构建与取数是两件事

| 阶段 | 工具 | 实测耗时 |
|---|---|---|
| 打包 | **Turbopack**（Next 16 默认，`next dev` / `next build` 都没有 `--webpack`） | build ~0.5 s，dev 首次按需编译 ~0.9 s |
| 取数 | 子进程跑 `aios status --json` | **~2.7 s**（2026-11-07 重测；旧文档的 9.3 s 已被去重优化消掉） |

所以「慢」不在打包器上：换掉 Turbopack 不会让首屏变快，反而更慢。采集慢的真正原因是证据审计：
实测 `aios status` 用度的 64% 在 `readMetricsRecordsUncached` + `hasBidirectionalMetrics`，
它们把 `.aios/interception/metrics`（29 MB / 549 个 JSONL）整份读进来逐行 `JSON.parse`。
**首屏因此不再跑 `aios status`**：它不展示 agent 证据审计，就不该为那 1.6 s 付钱。
首屏取数改由 `lib/data/console-facts.mjs` 并行采集，实测 273ms（`mcp list` 263ms 是最慢一路）——
数字与命令见 `docs/plans/2026-11-07-stage0-real-data-measurement.md`。
三件事把它从关键路径上挪开：骨架先出（0.09 s）、快照直出 + 后台刷新（stale-while-revalidate，
命中 0.014 s）、启动即预热（服务一应答就自己把首页取一遍）。第一次的那次采集仍然要花它该花的
时间——要压它得改 `aios status` 本身。

### 为什么第一次会先看到骨架（实测，2026-11-05）

| 现象 | 原因 | 处理 |
|---|---|---|
| 窗口开了但一片空白 | 页面在**同步** spawn 里跑 `aios status`，Node 事件循环被占住，Next 无法先把外壳刷出去 | 取数改为异步 `execFile`，`loading.tsx` 的骨架在 **0.09s** 出现，数据随后流式到达 |
| 总览比别的页更慢 | 页面同时跑了矩阵和 `aios status`**两次**，数字却来自同一次采集 | 只跑一次：矩阵 payload 已经带 blockers / coverage / overallStatus |
| 每次翻页都重新等 | 动态页每请求都 spawn | 30s 文件快照（`<tmp>/aios-shell-cache`），命中时 **0.013s**；页头显示「数据 Ns 前 / 刚刚采集」 |
| 「重新采集」红着收场 | `aios status --json` 判定 blocked 时退出码是 **1** | 每个动作自带 `okExitCodes`；退出码照实显示，但不再当成失败 |

### dev 态怎么验

```sh
npm run ui          # 1) 起 next dev，把带 token 的 URL 打出来
# 2) 另开一个终端（可选）：壳直接接上这个端口，不另起服务
npm run shell:dev
node --test scripts/tests/tooling/shell/interface/dev-server-trust.test.mjs   # 3) 自动验
```

`dev-server-trust.test.mjs` 起的是**真的 dev server**：随机端口 → 等 token 文件出现 →
裸请求必须 403 → token 交换必须发 cookie → 页面必须渲染出矩阵 → 资源无 cookie 403、有 cookie
200 → 异源 Origin 与 `Sec-Fetch-Site: cross-site` 必须 403。缺 `ui/node_modules` 时它
**带原因跳过**（`ui dependencies are not installed`），因为一个什么都没问就通过的检查是这份
测试存在的理由的反面。实测一次约 14 秒（首次请求要按需编译路由）。

dev 态的已知差异（实测 2026-11-05，`/` 与随机路径的 upgrade 请求）：

| 路径 | dev（`next dev`） | 生产（`next start`） |
|---|---|---|
| `/_next/hmr` | **101 升级成功，不过门** | 不存在该端点 |
| `/`、随机路径 | 无响应（门只在 HTTP 请求层生效） | 无响应 |

也就是说 `proxy.ts` 只判定 HTTP 请求，WebSocket 升级不经它。生产态没有 HMR 端点，所以这条
差异只存在于开发机；要在 dev 态也挡住，得在壳前面加一层真正的反向代理，当前不做。
## 归属

桌面壳结构抄自 Cline（`apps/examples/desktop-app/`，Apache-2.0）。引用其代码时保留其 LICENSE/NOTICE
并逐文件标注来源与修改；本仓为 MIT。
