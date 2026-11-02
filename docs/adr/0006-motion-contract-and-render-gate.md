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

## 第二次修正（2026-11-02）：拍帧门不是「输入不存在」，是我判错了

**上一节的「未做」理由是错的，原文保留在上面以便对照。** 原话是「拍帧门需要的输入在这个仓库里还不存在——没有任何一个 UI 面有稳定的截图/拍帧基线」。这句话把两件事混成了一件：

- **视觉回归**要基线（和上一次的截图比对）；
- **动效正确性**不要基线（每帧记录元素 box，相邻帧位移 >2px 且前后都在就是跳变——这是当场可测的几何事实）。

用「没有基线」否掉「可以当场测量」，是一次推理错误。由此产生的后果是：交付了一份 116 行契约（44 条规则）+ 4 条正则，然后把它称为「动效有门禁了」。用本仓库自己的标准衡量，这是 `AGENTS.md` 明令禁止的形状——「hard gates 靠 runtime verification，never by prompt politeness and never by text heuristics」。**44 条规则里 40 条没有任何执行者。**

### 实证：同一个动画，两个门两个结果

构造一段有真实缺陷的 CSS（`49.95%` 12px → `50%` 8px，单帧 4px 跳变；480ms；无 `transition: all`；有 reduced-motion 兜底）：

| 判据 | 结果 |
|---|---|
| `check-motion-contract.mjs` | `blocking=0`，exit 0 —— **判绿** |
| upstream `jumps-core.mjs` 的 `record` + `analyse`，在我们的 CSS/HTML/Chrome 上跑 | `jump: card y -4.0px in one frame at 0.27s` —— **抓到** |

第一次实验把 4px 分摊到 2 帧（每帧 2px）时它**没有误报**，说明阈值是真的在起作用。

### 决策修正

1. **vendor upstream 而不是复述它。** `vendor/stageshow/` 保存 16 篇规范正文（1270 行原文）+ 4 个验证内核 + `LICENSE` + `NOTICE.md`，`MANIFEST.json` 用 sha256 钉住 21 个文件。本仓库的 `MOTION.md` 从此只做减法，不再充当「提炼过的替代品」。
2. **「有没有安装」由退出码回答，不由模型记忆回答。** `scripts/check-motion-kit.mjs` 区分三种失败：`ABSENT`（没装，要装）、`DAMAGED/missing`（被删，要恢复）、`DAMAGED/modified`（被就地改，要恢复并另开补丁）。把三者混成一个「不可用」会把 agent 引向错误的修法。
3. **把「没装什么」也当成事实输出。** `MANIFEST.json` 的 `notVendored` 记录 4 处刻意省略及理由，`--json` 一并返回。这是本次最关键的一处设计：如果只报「已安装」，agent 会以为 kit 可用，然后写出这个仓库根本无法渲染的组件。
4. **`check:motion` 变成两段**（声明级 + vendor 完整性），两者都 exit 0 才算材料可用。仍不进任何 `pretest` 链（决策 4 的理由未变）。

### 实测的取舍依据（不是偏好）

- **`kit/` 96 个文件不搬**：40 个 tsx `import ... from 'react'`，而覆盖的 4 个真实 UI 面是 mkdocs 静态 CSS、Astro+Tailwind（依赖里无 react）、单文件原生 JS。搬进来等于加一个没有任何面能加载的依赖。
- **`examples/` 69 个场景不搬**：是原则的插图而非产品代码，且含 CC0 照片与非 MIT 第三方标识。
- **`assets/app-icons.ts` 不搬**：其 `NOTICE.md` 明确图标不在 MIT 内。
- **`film-checks.mjs` 1920 行 / 48 个检测器暂不搬**：写在 kit 的 `.ss-*` DOM 约定上（`.ss-camera` / `.ss-caret` / `[data-snap]` 剔除规则）。`jumps-core` 只需把这几条约定映射过来即可用于本仓库页面；48 个检测器等某个面真的采用 kit CSS 再接。

### 第三次修正：帧级门已经接上真实页面

`scripts/check-motion-frame.mjs`（`npm run check:motion:frame`）已经接上 `packages/debug-hub/src/ui.html`：

```
[frame] packages/debug-hub/src/ui.html 145 frames over 1200ms — clean
  3 same-origin request(s) unreachable from file:// — the page rendered without its data
  no snap (>2px in one frame while present before and after), no drift
```

**为什么选它而不是 `site/index.html`**：`site/assets/` 是空的（mkdocs 生成物不完整），`genealogy-gui/index.html` 在运行时从 `esm.sh` 拉 React/xyflow/dagre（网络依赖，不可重复）。`debug-hub/src/ui.html` 是唯一自包含的真实面。

**两个教训都当场抓到并修了**：

1. **报红却 exit 0**。第一版退出码表达式写成 `ok || ...`，fixture 明明报出 `jump: card y -4.0px` 却返回 0。这是和「声明级门判绿」完全同型的错误，只是换了一层。现在 exit 0 要求四个条件同时成立：无缺陷、录制无异常、`measured.maxItems > 0`、无 recorder error。
2. **「干净」必须能区分「没缺陷」和「没看到东西」**。选择器没匹配上、页面没渲染、录制器抛错，都会得到 `findings: []`。因此报告里带 `measured.maxItems / emptyFrames`，值 0 时就地判红而不是报 clean。

**双向锁定**：`scripts/tests/foundation/standards/motion-frame.test.mjs` 同时钉住红绿两个方向——带 4px 单帧缺陷的 fixture 必须 exit 1 且点名 `jump: card y -4.0px`，干净页面必须 exit 0 且 `measured.maxItems > 0`。只钉一个方向的门可以用「永远失败」或「永远通过」通过测试。

### 仍未闭合的

- **只接了一个面**。`site/index.html` 与 `genealogy-gui/index.html` 各有阻碍（生成物不完整 / 运行时网络依赖），要在门里覆盖它们，得先解决这两个前提，不是加一行配置。
- **`film-checks.mjs` 的 48 个几何检测器仍未接**（已声明在 MANIFEST 的 `notVendored`）。它们写在 kit 的 `.ss-*` 约定上，而本仓库用 `.motion-*` 映射，逐个验证后才能接。
- `vendor/stageshow/references` 15 个文件超 `directoryEntries` 预算 8，已按「上游形状不可拆」豁免，理由记在 `config/standards.json`。
- 44 条规则里，声明级覆盖 4 条、帧级覆盖「跳变/漂移」2 类，其余仍靠人眼。**不要把这条写成「已全部可判定」。**
