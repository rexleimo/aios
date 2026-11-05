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
├── ui/                     ← 6 项：Next.js 界面（源文件在 src/ 下）
│   ├── src/                ← 4 项
│   │   ├── app/            (layout.tsx, page.tsx, globals.css)
│   │   ├── components/     (matrix-table.tsx，'use client')
│   │   ├── lib/            (labels.ts, matrix-loader.ts, trust.mjs)
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
npm run shell:test                                      # cargo test（10 用例：端口、参数、cwd、等待、job、token）
```

## 桌面壳（S1 窗口 + S2 收口与门）

壳只做两件事：开一个窗口，并决定背后的**能力进程**是启动还是复用。它不持有任何事实——
页面自己去问 `data/load.mjs`。S2 在同一个壳上补了三件事：进程收口、本地信任边界、打包。

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

**S2 仍未做**：签名/公证、托盘与自启、面板动作（现在页面只读，写操作接上之前这道门是唯一的
写入面保护）、强杀后残留 token 文件的清理（下次启动会被新 token 覆盖，不构成安全面）。

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
## 归属

桌面壳结构抄自 Cline（`apps/examples/desktop-app/`，Apache-2.0）。引用其代码时保留其 LICENSE/NOTICE
并逐文件标注来源与修改；本仓为 MIT。