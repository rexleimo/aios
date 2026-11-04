# apps/shell — AIOS 自有感知面（接入矩阵 + 桌面壳）

决策来源：`docs/adr/0007-aios-perceived-surface-and-desktop-shell.md`。
本文件只记录**目录形状、技术栈与约定**，不重复 ADR 里的决策理由。

## 形状（目录预算 `directoryEntries=8` 硬约束）

```
apps/shell/                 ← 4 项
├── README.md
├── .gitignore
├── data/                   ← 5 项：事实装配（纯函数 + 进程入口）
│   ├── matrix.mjs / matrix.d.mts
│   ├── sources.mjs
│   └── load.mjs / load.d.mts
└── ui/                     ← 8 项：Next.js 界面
    ├── app/                (layout.tsx, page.tsx, globals.css)
    ├── components/         (matrix-table.tsx，'use client')
    ├── lib/                (labels.ts, matrix-loader.ts)
    ├── package.json
    ├── package-lock.json
    ├── next.config.mjs
    ├── postcss.config.mjs
    └── tsconfig.json
```

`src-tauri/` 是 S1 阶段（窗口）要加的第四项，加之前这里必须是 4 项，加完 5 项，仍在预算内。

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
node --test "scripts/tests/tooling/shell/*.test.mjs"    # 30 用例
node scripts/aios-standards.mjs --root . --rule directoryEntries
```

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