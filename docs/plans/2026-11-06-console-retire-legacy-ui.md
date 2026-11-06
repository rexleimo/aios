# Console 旧界面退役与默认入口迁移

日期：2026-11-06。用户已明确要求删除旧版界面，沿用已确认的本机 AI 工具管理器设计。

## 工作项

- id: console-retire-legacy-ui
- type: implementation
- failureClass: routing-regression
- targets: apps/shell/ui/src/app/(console), apps/shell/ui/src/app/prototype, apps/shell/ui/src/components
- allowedWrites: apps/shell/ui/src/**, scripts/tests/tooling/shell/**, apps/shell/README.md, DESIGN.md, docs/plans/2026-11-06-console-retire-legacy-ui.md
- disposition: planned；路由命令选择 rex-test-design，以本文件作为显式工作项，后续仅执行当前命令。

## 已接受的范围

1. 默认 `/` 打开新版工具管理器；移除旧版页面组件、导航与“返回正式控制台”入口。
2. 原型组件迁入 `components/console`，改为当前 Console 的唯一界面实现。
3. 新导航拥有可刷新、可前进后退的地址；现有 `/memory`、`/tools`、`/mcp`、`/settings` 可直接访问；`/prototype`、`/overview`、`/sessions`、`/usage`、`/matrix` 迁到当前对应入口；未知路径仍为 404。
4. 只删已确认无剩余调用者的旧 UI 和专属适配层。后端 API、CLI、配置写入、证据、会话和记忆存储保留，不删除用户数据。
5. 示例数据/模拟结果标注保留。移除旧界面不等于真实后端已经接入。

## 非目标

真实私人项目访问、原型后端接线、扩展记忆共享权限、全盘扫描、发布、提交/推送均不在本轮。

## 安全与迁移决策

工作树大量既有改动，当前 main/upstream origin/main；不 pull/stash/reset。删除前将范围内旧 UI 和被替换页面逐文件备份到会话临时目录，保护未提交与未跟踪的旧 MCP 视图。回滚用原始字节恢复即可。CRG impact 返回 low，影响 ConsoleLayout；实际调用者与测试以 rg 和导入检查补足。

不保留可访问的旧版副本，避免双套实现继续漂移。`/prototype` 作为兼容跳转保留，不是第二套页面。路由和浏览器导航共享视图路径表；真实后端模块保留自己的职责，不随旧视图一起删除。

## 测试范围契约与公共缝

- HTTP 根入口显示新界面与示例标签，不再出现旧导航与静态“能力进程已连接”。
- HTTP 每个新入口正确选中对应视图；旧入口有明确跳转；未知入口 404。
- 浏览器导航更新 URL，刷新和前进后退得到相同视图；MCP/记忆主流程可用，未调用生产写 API。
- 现有后端测试仍执行；移除专门断言已退役 DOM 的用例时，替换为新路由、状态标签和边界检查，保留 auth/token、argv 安全与证据状态测试。
- TypeScript、Next build、test:shell、test:regression、相关设计/标准检查；真实浏览器宽屏和窄屏走查。
- RED 公共场景：对当前已认证 HTTP `/` 要求新版标题且无旧导航；迁移前失败、迁移后用同一脚本通过。

不得通过跳过测试或放宽预期掩盖回归。旧矩阵页面已从用户范围中退役，数据层矩阵契约继续测试。

## 进度

- [x] 依赖审计、范围与迁移决策。
- [x] RED 记录，替换默认入口并删除旧实现。
- [x] 路由、导航、浏览器交互与后端兼容验证。
- [x] 全量回归复跑与最终审查。
- [x] 更新文档与交付记录。

## 实施与测试差异审查

删除 21 个旧 UI/专属适配文件；备份包含旧 MCP 页面未提交内容，临时备份位置记录在 `E:/Temp/console-retire-backup.json`。原型代码迁入 `apps/shell/ui/src/components/console/`，只保留 `/prototype` 的兼容跳转。共享 `apps/shell/ui/src/lib/console-navigation.ts` 拥有当前路径、标签和旧路径目的地，浏览器原生 history 与服务端使用同一张表。

以删除前的快照逐字节对比：所有 API 文件与继续保留的 `lib/data/` 模块没有改变；仅删除无调用者的 `matrix-loader.ts`。冻结差异与哈希位于 `.aios/planning/console-retire.review.diff` 与 `.aios/planning/console-retire.files.json`，包括未跟踪文件，未改共享 Git staging。

测试差异按新契约审查：

- MCP 数据层的证据优先级、真实落点状态、所有权、argv 白名单与非法输入断言继续执行。将旧 PAGES/registry 静态断言替换为当前路径及旧链接的完整映射、跳转无环和 404 检查。
- 保留矩阵取数的来源、路径归一化、缺失证据、离线降级和动态数据断言；退役的矩阵 DOM 检查改为当前服务端入口与慢速矩阵收集解耦。
- 旧页面中文标签检查改为可读导航、未知来源保留、跨项目同 ID 夹具，以及示例标签持续可见、旧入口不复活。没有跳过或删除后端行为断言。
- 真实 HTTP 测试保留 token/cookie、静态资源鉴权、跨 origin、cross-site 和真实 MCP API 状态断言；增加所有当前入口、五个旧入口跳转和未知路径 404。旧表格渲染断言随页面退役，由新首页与每个视图选中检查替换。
- 同一 HTTP 根入口脚本 RED receipt `614536a8-150d-4a99-9a84-0b22c8726548` exit 1；GREEN receipt `38f66043-d932-47e4-9aa0-9cd7bde8070e` exit 0；聚焦重构检查 receipt `14ed6676-172b-43bc-9ff4-ac568e6f0c07` exit 0；同一 HTTP 场景的重构 receipt `6d9ec4d0-49f8-40ff-925a-68edc0c14ab1` exit 0。

## 验证记录

- `npm --prefix apps/shell/ui run typecheck`：PASS。
- `npm --prefix apps/shell/ui run build`：PASS，保留当前首页、动态视图、兼容入口和全部原有 API 路由。
- `npm run test:shell`：95 tests，95 pass，0 fail，0 skipped。
- `node E:/Temp/console-retire-browser.mjs`：PASS。默认首页、新路径、刷新、前进后退且记忆选中项目保留；MCP 带空格参数预览→写入未测→失败→重试成功；旧路径迁移；390px 无横向溢出。runtime errors=0，production writes=0。截图/结果在 `temp/console-retire/`。
- `node scripts/design.mjs check` 与 `node scripts/check-motion-contract.mjs --json`：PASS，motion blocking=0。
- `~/.aios/bin/aios doctor --json`：exit 0，`[ok] verify-aios complete`，effective_warn=85；包含已有 codemap/projection drift 警告，并非零警告。
- 临时复制 Git index 纳入未跟踪文件：directoryEntries measured=838/blocking=0；fileLines measured=1569/blocking=6（均在本项外）；duplicateLines blocking=625，相比此前631减少6。此次新增/修改文件没有标准违规；已有后端重复项不在本项改动范围。
- 首轮全量回归：2758 tests，2744 pass，2 fail，12 skipped；两个失败均由 DESIGN.md 内导航文件短路径导致。已改为完整仓库路径，针对两文件的 release checks 17/17 通过。未将首轮失败记录为通过。
- 最终 `node scripts/run-test-suite.mjs regression`（即 `npm run test:regression`）：2758 tests，2746 pass，0 fail，12 skipped；286 files，elapsed_ms=520876，temp_sandbox=removed。默认临时环境，最终日志 `E:/Temp/console-retire-regression-final.log`。

实际最终输出：

```text
ℹ tests 2758
ℹ pass 2746
ℹ fail 0
ℹ skipped 12
[test-suite] regression: files=286, concurrency=4, elapsed_ms=520876, temp_sandbox=removed
```


CRG 变更检查混入了既有 MCP 工作树改动（106 symbols / risk0.665），因此不把图上的总风险当作本项隔离证明；使用冻结差异、调用者搜索、保留后端字节对比与实际路由检查确定范围。

## Standards 审查

固定点 `08fc6a6ebfaf25953080b9bd3bbd1dd8e82c20f4` 可解析，尚未提交，commit range diff 为空；审查使用删除前完整快照到当前工作树的非空冻结差异（51 个源代码/测试文件、345947 bytes，另含 README/DESIGN 差异），没有把空提交差异当作审查证据。改动后的文件哈希复核无漂移，最大源文件387行，目录预算通过。

按工程基线逐项审查：Mysterious Name 未见；Duplicated Code 未见新增（路径表单一所有者）；Feature Envy 未见；Data Clumps 未见；Primitive Obsession 未见；Repeated Switches 未见；Shotgun Surgery 未见（迁移导入与地址表有明确边界）；Divergent Change 未见；Speculative Generality 未见；Message Chains 未见；Middle Man 未见（兼容页只负责旧书签迁移）；Refused Bequest 未见。保留 API/data 与快照一致，原有标准存量不归到本项。Standards findings=0。

## Spec 审查

规格源为本工作项已接受范围与用户“原来的删除掉”指令。逐项检查：首页切换；旧导航/页面/返回入口移除；原型组件归入当前唯一实现；现有路径可访问且旧路径跳转、未知路径404；导航 history/刷新一致；示例标签、模拟结果和配置/测试分离持续可见；API/CLI/存储保留且没有生产写请求。已在桌面和窄屏实际验证，原始后端测试保留。真实后端接线明确不在本项，未把模拟场景当作真实连接证据。Spec findings=0。最终全量回归通过，审查 capability 完成，nextCapability=null。

## 交付状态

当前已认证的本机预览为 `http://127.0.0.1:3146/`，已用新构建启动并重新打开可见窗口。`npm run app` / `npm run ui:start` 继续从根入口打开当前唯一界面。改动未提交、推送或发布；推荐版本影响沿用此前新增能力的 minor 建议，未改 VERSION。

真实项目记忆读取与配置写入仍待后端接线。当前结果只证明旧 UI 退役、新 UI 成为默认、接口与数据保留以及示例流程可用。

VERDICT:
retry_budget: 3 remaining: 2
FILES_REVIEWED:
  - apps/shell/ui/src/app/(console)/page.tsx: lines 1-6 (changed)
  - apps/shell/ui/src/app/(console)/[section]/page.tsx: lines 1-13 (changed)
  - apps/shell/ui/src/app/prototype/page.tsx: lines 1-7 (changed to redirect)
  - apps/shell/ui/src/app/layout.tsx: lines 1-15 (metadata changed)
  - apps/shell/ui/src/lib/console-navigation.ts: lines 1-30 (added)
  - apps/shell/ui/src/components/console/console-workspace.tsx: lines 1-289 (moved and changed)
  - apps/shell/ui/src/components/console: all 10 source files and flows reviewed, 7-387 lines each (moved)
  - 21 legacy UI/adapters (deleted, reviewed in pre-edit snapshot; list at E:/Temp/console-retire-deleted.json)
  - scripts/tests/tooling/shell: five changed test files, full path/status/hash manifest at .aios/planning/console-retire.files.json
  - apps/shell/README.md and DESIGN.md (changed; current entry, paths and fixture/backend boundary)
CHECKS:
  - npm --prefix apps/shell/ui run typecheck: PASS
  - npm --prefix apps/shell/ui run build: PASS
  - npm run test:shell: PASS (95/95)
  - node scripts/run-test-suite.mjs regression: PASS (2746 pass, 0 fail, 12 skipped)
  - node E:/Temp/console-retire-http.mjs: PASS (same public scenario as RED)
  - node E:/Temp/console-retire-browser.mjs: PASS (navigation/history/refresh, MCP and memory, legacy routes, mobile, zero production writes)
  - design and motion checks: PASS (blocking=0)
  - release contract checks: PASS (17/17 after path correction)
  - directoryEntries: PASS; changed files fileLines/duplicateLines: PASS
  - repository fileLines/duplicateLines: FAIL on existing unrelated stock (6 / 625); no new task violation
  - aios doctor: PASS exit 0, 85 existing effective warnings retained
CODE:
  > const destination = legacyDestination(pathname);
  > if (destination) redirect(destination);
  > const view = viewForPath(pathname);
  > if (!view) notFound();
  > return <ConsoleWorkspace initialView={view} />;
VALIDATION:
  APPROVED — score: 1.0, complete: true, missing: []

## 用户授权提交后的版本准备

用户随后明确要求 commit + push。本批按 cap 流程包括工作树中此前已完成的 MCP/TUI 工作，版本影响 minor，准备 `7.0.1 -> 7.1.0`。已同步 CHANGELOG、四语言发布说明、生成的 llms 索引，以及 `aios-project-system` 的 canonical / 客户端技能投影；Codex 与 Claude 的相关文件逐字节一致。

新增准备检查：skills-sync / llms-txt / release-pipeline 36/36 通过，生成索引校验、技能投影校验、发布内容路径与 diff whitespace 检查通过。首轮 llms-txt 检查发现 minor 缺少版本文章，补齐四语言说明后通过，没有放宽测试。

站点全局同步检查仍报告24份历史翻译缺失；对照原 HEAD 的 Git tree，全部为当时已存在的英文文章缺少旧版翻译，本次7.1.0四语言文章没有缺口。该存量未并入此次提交工作扩展。



