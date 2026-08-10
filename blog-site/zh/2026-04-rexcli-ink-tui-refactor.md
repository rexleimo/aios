---
title: "RexCli TUI 重构：基于 React Ink 的现代终端交互"
description: "RexCli 把 TUI 安装程序从手动字符串渲染迁移到 React Ink + Ink UI 组件架构，提升交互体验和代码可维护性。"
date: 2026-04-02
tags: [RexCli, TUI, Ink, React, Terminal, Onboarding]
---

# RexCli TUI 重构：基于 React Ink 的现代终端交互

之前的 TUI 安装程序用手动字符串拼接来渲染界面，代码维护成本高，交互体验也比较基础。这次重构把它迁移到 **React Ink + Ink UI** 组件架构，让终端交互更现代化。

## 为什么要重构

旧的 TUI 实现有几个问题：

- 手动拼接 ANSI 字符串来控制颜色、布局，改动一处很容易影响其他地方
- 缺少真正的组件抽象，状态管理分散在各处
- 没有路由概念，屏幕切换逻辑写得很散乱

Ink 是专为终端设计的 React 渲染器，能用 React 组件模型来写 CLI 交互界面。配合 Ink UI 的内置组件（Select、TextInput、ConfirmInput），可以大大简化开发。

## 新架构

```
scripts/lib/tui-ink/
├── App.tsx              # MemoryRouter + Routes 配置
├── index.tsx            # render() 入口
├── hooks/
│   └── useSetupOptions.ts  # 共享配置状态
├── screens/
│   ├── MainScreen.tsx      # 主菜单
│   ├── SetupScreen.tsx     # Setup 配置
│   ├── UpdateScreen.tsx    # Update 配置
│   ├── UninstallScreen.tsx # Uninstall 配置
│   ├── DoctorScreen.tsx    # Doctor 配置
│   ├── SkillPickerScreen.tsx # 技能选择器
│   └── ConfirmScreen.tsx   # 执行确认
├── components/
│   ├── Header.tsx          # 顶部标题栏
│   ├── Footer.tsx          # 底部快捷键提示
│   ├── Checkbox.tsx        # 勾选组件
│   └── ScrollableSelect.tsx # 滚动选择列表
└── types.ts               # 共享类型定义
```

### 路由导航

使用 `react-router` 的 `MemoryRouter` 来管理屏幕切换：

```
/ (MainScreen)
  → /setup
  → /update
  → /uninstall
  → /doctor

/setup → /skill-picker?owner=setup
/setup → /confirm?action=setup

/skill-picker → 返回上一屏
/confirm → 执行 → 显示结果 → 返回主菜单
```

### 状态管理

`useSetupOptions` hook 提供全局配置状态，各屏幕共享：

```typescript
interface SetupOptions {
  components: {
    browser: boolean;
    shell: boolean;
    skills: boolean;
    superpowers: boolean;
  };
  wrapMode: 'all' | 'repo-only' | 'opt-in' | 'off';
  scope: 'global' | 'project';
  client: 'all' | 'codex' | 'claude' | 'gemini' | 'opencode';
  selectedSkills: string[];
}
```

### 自定义组件

Ink UI 的 Select 不支持滚动窗口模式，所以自己实现了 `ScrollableSelect`：

- 键盘 ↑/↓ 导航
- Space 选择
- 支持分组显示（Core / Optional）
- 显示技能描述和已安装标记

## 依赖

```bash
npm install ink @inkjs/ui react react-router
```

- `ink` 4.x - React 终端渲染器
- `@inkjs/ui` - 内置交互组件
- `react` 18.x + `react-router` 7.x

Node 版本：项目要求 `>=22 <23`，Ink 4.x 支持 Node 18+，完全兼容。

## 视觉效果

- 当前项：粗体 + cyan 颜色
- 已安装标记：绿色 `(installed)`
- 描述文字：灰色 `dimColor`
- 分组标题：黄色或 inverse
- 错误/成功：红色/绿色

## 兼容性

非交互模式（无 TTY）保持原有 CLI 参数模式不变：

```bash
aios setup --components browser,shell --scope global
aios update --client codex
aios doctor
```

入口检测 TTY 后自动调用 Ink 版本。

## 相关链接

- Ink 文档：<https://github.com/vadimdemedes/ink>
- Ink UI 文档：<https://github.com/vadimdemedes/ink-ui>
- 设计文档：`docs/superpowers/specs/2026-04-02-ink-tui-design.md`
- 实现计划：`docs/superpowers/plans/2026-04-02-ink-tui-refactor.md`
## 相关文档

- [快速开始](https://cli.rexai.top/zh/getting-started/)
- [Quick Start](https://cli.rexai.top/zh/getting-started/) — 30 秒安装 AIOS
- [Workflow Policy](https://cli.rexai.top/zh/workflow-policy/) — direct / guarded / planned 路由
