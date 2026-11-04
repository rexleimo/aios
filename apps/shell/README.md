# apps/shell — AIOS 自有感知面（接入矩阵 + 桌面壳）

决策来源：`docs/adr/0007-aios-perceived-surface-and-desktop-shell.md`。
本文件只记录**目录形状、技术栈与约定**，不重复 ADR 里的决策理由。

## 形状（目录预算 `directoryEntries=8` 硬约束）

```
apps/shell/                 ← 5 项
├── README.md
├── .gitignore
├── data/                   ← 5 项：事实装配（纯函数 + 进程入口）
│   ├── matrix.mjs / matrix.d.mts
│   ├── sources.mjs
│   └── load.mjs / load.d.mts
├── ui/                     ← 8 项顶格：Next.js 界面
│   ├── app/                (layout.tsx, page.tsx, globals.css)
│   ├── components/         (matrix-table.tsx，'use client')
│   ├── lib/                (labels.ts, matrix-loader.ts)
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.mjs
│   ├── postcss.config.mjs
│   └── tsconfig.json
└── src-tauri/              ← 6 项：桌面壳（S1 窗口 + 能力进程生命周期）
    ├── Cargo.toml / Cargo.lock
    ├── build.rs
    ├── tauri.conf.json
    ├── icons/              (32x32、128x128、128x128@2x、icon.ico)
    └── src/                (main.rs, lib.rs, sidecar.rs)
```

`ui/` 已是 8 项顶格：`next dev` 会重写 `ui/AGENTS.md`，所以它按 `next-env.d.ts` 同档进 `.gitignore`；
否则一个由 next 自己生成的文件就把预算顶成 9。`src-tauri/target/` 与 `src-tauri/gen/` 同样不计入。

## 技术栈（用户裁定，不是默认偏好）

| 层 | 选择 | 理由 |
|---|---|---|
| 样式 | **Tailwind 4**（CSS-first，无 tailwind.config.js） | 不写原生 CSS；`@theme` 把 `--rex-*` token 挂进 utility |
| 交互 | **Radix UI**（`@radix-ui/react-popover` 1.3.1） | 无头组件里下载量最高的一族（实测上周：`react-dialog` 90.3M、`react-popover` 68.2M，`@headlessui/react` 9.8M 低一个量级） |
| 表格 | **TanStack Table 8.21.3** | 无头表格主流版本；v9（9.3.1）换了 API 形状（`createTableHook`/feature 注册），比 13 行的矩阵需要的机器更重，先用 v8 |
| 框架 | Next.js 16 + React 19 | 与 Cline 的壳同代，抄壳时结构对得上 |

## 三条不能破的约定

1. **视图不含事实。** `ui/` 里唯一的取数通道是 `lib/matrix-loader.ts`，它跑 `data/load.mjs` 读 stdout。
   不 import 装配代码：实测 import 会把 `scripts/lib/**` 拖进打包图，Turbopack 因此要求整仓 trace。
   页面里出现任何数字字面量都是缺陷，由 `scripts/tests/tooling/shell/matrix-sources.test.mjs` 判定。
2. **token 只有一个所有者。** `@theme` 里的每个值必须等于 `docs-site/assets/redesign/tokens.css` 的对应
   `--rex-*`，由 `shell-tokens.test.mjs` 逐条比对。globals.css 里允许的选择器只有 `:root[data-rex-theme="dark"]` 和 `body`。
3. **服务端组件不从 `'use client'` 模块取数据。** 实测踩过：`page.tsx` 从 `matrix-table.tsx` import
   `AXIS_LABEL` 时拿到的是客户端引用代理，轴名静默退化成英文、证据列表渲染成空串。词表因此住在 `lib/labels.ts`。

## 能力层暴露的两个实测事实（界面必须如实显示）

- 逐轴的原因为**不存在**：配置只有行级 `limits[]` 与可选 `subagents.evidenceRef`，所以单元格只表达「是否声明」。
- 配置声明 13 个客户端，`aios status` 只覆盖 10 个 ⇒ 未覆盖显示为 `not-covered`，**不等于「好」**。

## 验证

```sh
node --test "scripts/tests/tooling/shell/*.test.mjs"    # 37 用例（含壳与启动器的端口一致性）
node scripts/aios-standards.mjs --root . --rule directoryEntries
npm run shell:test                                      # cargo test（6 用例：端口、参数、cwd、等待）
```

## 桌面壳（S1：窗口）

壳只做两件事：开一个窗口，并决定背后的**能力进程**是启动还是复用。它不持有任何事实——
页面自己去问 `data/load.mjs`。

```sh
npm run shell:dev    # = cargo run --manifest-path apps/shell/src-tauri/Cargo.toml
npm run shell:build  # = cargo build --release --manifest-path …
```

启动顺序（`src-tauri/src/lib.rs`）：

1. **端口**：`AIOS_UI_PORT`，否则 `DEFAULT_UI_PORT`。后者与 `scripts/aios-ui.mjs` 的
   `UI_DEFAULT_PORT` 是同一个事实，由 `shell-sidecar.test.mjs` 钉住两值相等；`tauri.conf.json`
   的 `devUrl` 也受同一条测试约束。
2. **安装根**：`AIOS_SHELL_ROOT`，否则从当前目录、可执行文件所在目录逐层向上找
   `scripts/aios-ui.mjs`。仓库里直接跑因此不需要任何环境变量。
3. **接上还是拉起**：端口已经有响应就**复用**（开发时 `npm run ui` 已经在跑），否则
   `node scripts/aios-ui.mjs start --port <port>` 起进程，等它真的 accept 再开窗口。
   先开窗口再等的话，用户看到的是「连接被拒绝」，而**回不来**。
4. **工作目录**：能力进程的 CWD 必须落在安装树之外（`resolve_work_dir` 是这条判断的唯一所有者）。
   实测依据见 ADR：CWD 在安装树内的进程会让 `aios update` 的目录替换 `EPERM/EBUSY`。

实测（2026-11-05）：`next start -p 3126` 默认同时绑 `0.0.0.0` 与 `[::]`，等于把能力进程发布到
局域网。启动器现在显式传 `-H 127.0.0.1`，绑定的端口上只剩 `127.0.0.1:3126`。

**S1 明确没做的**（S2 或之后）：打包成安装包（`bundle.active=false`）、签名/公证、托盘与自启、
本地端口信任令牌（随机 token + 拒绝带 `Origin`/`Sec-Fetch-*` 的请求）、强杀壳体时子进程的回收。
最后一条是实测缺陷：`RunEvent::Exit` 会停掉自起的能力进程，但 `taskkill /F` 不走该路径，
留下孤儿 node 进程；等做 S2 时用 job object / 进程组收口。

## 从仓库根启动（不需要 cd 进 apps）

```sh
npm run ui:setup      # 第一次：装 apps/shell/ui 的依赖
npm run ui            # 开发模式 → http://127.0.0.1:3126
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
## 归属

桌面壳结构抄自 Cline（`apps/examples/desktop-app/`，Apache-2.0）。引用其代码时保留其 LICENSE/NOTICE
并逐文件标注来源与修改；本仓为 MIT。