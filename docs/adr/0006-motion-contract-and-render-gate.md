# ADR 0006：动效判据独立成 `MOTION.md`，并由宿主侧渲染门验证

日期：2026-11-02
状态：已实施（决策 1/2/4/5 已落地；决策 3 的部分见「后果」）

## 背景

用户看到 Benji Taylor 的 `stageshow` skill（MIT，`github.com/benjitaylor/skills`）后，提出让后续 agent 开发时「至少不会再做出一套没有设计规范和动画效果的交互逻辑」，方向定为 **B：要它管真实产品 UI 的交互与动效规范**（不是搬演示/插图 skill）。

查证到的事实（决定了决策形状）：

- 本仓库「真实 UI」技术面只有 CSS/HTML：`docs-site/`（mkdocs 源，`site/` 是生成物）、`rex-harness/website/`（Astro）、`packages/debug-hub/src/ui.html`、`scripts/lib/memory/genealogy-gui/index.html`。`apps/desktop/` 只有 `dist/` 与 `node_modules/`，无源码，不能作为落点。
- 现有 `DESIGN.md`（51 行、2 个 commit）标题为 "Documentation Interface Design Contract"，`Scope` 写死 `docs-site style refresh only`，`Mode: Restyle`；其 Motion 章节是两条**禁令**（只过渡颜色/背景/边框；不要装饰性 glow/sweep/大位移）。
- `rex-harness/src/standards/check.mjs:79` 的 `CONTENT_RULES` 只含 `fileLines` / `duplicateLines`，`measureForRule()` 只处理 4 条规则，全部是文本/路径级；`rg browser|playwright|screenshot|visual rex-harness/src/standards/` 零命中。**现有引擎没有任何渲染级判定能力。**
- 根 `package.json` 无 `playwright`；Playwright 只存在于 `mcp-server/`。`pretest:scripts` 已包含 `node scripts/aios-standards.mjs --root . --rule directoryEntries`，即门禁脚本已接入基线链。
- `stageshow/scripts/` 全部是独立 CLI（`film.mjs` 663 行、`film-checks.mjs` 1920 行，`playwright-core`），不依赖其 React kit 即可在任意 URL 上运行。

## 决策

1. **动效判据独立成根级 `MOTION.md`**，`DESIGN.md` 保持只管视觉语言与 `docs-site`（不改其 51 行现有内容，只在需要时加一条互指）。理由：动效判据是**时序协议**（第几毫秒发生什么、能否被测），与配色/字体不是同一类事实，混在一个文件会互相伤害（撞 `rex-engineering-standards` 的文件粒度原则）。
2. **判据来源分层**：从 `stageshow/references/motion.md`、`framing.md`、`craft.md` 只**提炼可客观判定**的部分（时长/easing/进出场顺序/循环接缝/光标因果/减动效），作者个人品味（配色、风格取向）不进入契约，需我们独立裁决。
3. **验证门放在宿主侧**（`scripts/`），**不扩展 `rex-harness` 引擎**。理由：`standards/check.mjs` 首行注明「目标根由调用方决定；取不到 tracked 列表时返回 skip」，其输入契约是 git worktree；渲染门需要起服务 + 浏览器，与内核的可移植纯函数定位冲突。等渲染级规则在宿主侧稳定后，再按 ADR 0001/0002 的「唯一 owner」原则决定是否下沉为 `rex-harness` 的第五条规则。
4. **不作为 `pretest:scripts` 的默认步骤**，与 `duplicateLines` 同样的理由：存量未处置就接门 = 门被静音，不是被修好。先跑出基线并给出 disposition 计划，再接线。
5. **skill 投影**：新增 `skill-sources/motion-*` 一类薄 skill 指向 `MOTION.md`；同时修 `frontend-design` 的一处真实缺口——它只在 description 里说「没有 `DESIGN.md` 才去找」，从未要求实现前读它，导致 DESIGN 漂移不被发现。

## 后果

- 需要新增：`MOTION.md`（契约正文）、`scripts/` 下的渲染门脚本 + 单测、一个薄 skill 及其投影、`frontend-design` 的读取要求。
- `MOTION.md` 若只管 CSS/HTML，则 React/Remotion 面的判据需要单独说明适用范围，避免被误读成通用前端规则。
- 渲染门引入浏览器依赖，但**只作为显式命令**运行，不进基线链，因此不改变 CI 的既有耗时与稳定性。
- 未决：门的具体阈值与存量处置方式，留待 `MOTION.md` 起草后以实测数据定，不在本 ADR 内拍板。

## 实施结果（2026-11-02）

**已落地**：

- `MOTION.md`：契约正文，含「判据分层」表把可机器判定与人眼判定分开，覆盖范围/非目标/来源取舍各一节。
- `scripts/check-motion-contract.mjs`：只执行第一类判据（`transition: all`、`transition-animation` 时长上限 1000ms、`infinite` 无 `prefers-reduced-motion` 兜底、有动效但无兜底）。处置四态：`exempt` / `baseline` / `violation` / `baseline-stale`，基线只许收缩。取不到 tracked 列表时 SKIP 并退出 0，与 `aios standards check` 同形。
- `scripts/tests/tooling/tools/motion-contract.test.mjs`：10 个用例，含**在真实源码树上跑一次实测**的断言（`scanned > 0`，否则说明发现逻辑坏了而不是仓库干净）。已接入 `scripts/test-suites.json` regression。
- `config/motion-contract-baseline.json`：实测存量 8 条（4 个 `docs-site` CSS 无 reduced-motion 兜底、`debug-hub/ui.html` 超时 + infinite 无兜底、`genealogy-gui/index.html` `transition: all` + infinite 无兜底）。门当前 exit 0。
- `package.json`：新增 `check:motion` / `test:motion-contract` 两个**显式**入口，未进任何 `pretest` 链（决策 4）。
- `skill-sources/frontend-design/SKILL.md` 新增「Read the project's contracts first」一节，并已 `sync-skills` 投影到 8 个客户端（`check-skills-sync` exit 0）。
- `DESIGN.md` 头部加一条互指（未改动其既有 51 行实质内容）。

**与决策 3 的偏差**：原计划另写一个「渲染门」脚本（起服务 + 浏览器拍帧）。实施时把它拆成两件事，只做了其中能诚实完成的那件：

1. 已做：声明级门（本 ADR 决策 4 的「先出基线不接门」），它不依赖浏览器，可进 CI。
2. 未做：拍帧门。理由不是「没时间」，而是**它需要的输入在这个仓库里还不存在**——没有任何一个 UI 面有稳定的截图/拍帧基线，也没有既有 Playwright 依赖在根 `package.json`。先建一个拍帧门等于先建一套无基线的检测，它会立刻变成噪声或被静音。

因此「渲染门」目前只以**人工复核协议**的形式存在（`MOTION.md`「验证」一节的四类证据：固定间隔 ≥8 帧、60ms 接缝采样、390px 宽度、减少动效模式）。把拍帧门做成可执行命令需要一个新工作项，前置条件是先给至少一个 UI 面建立拍帧基线。
