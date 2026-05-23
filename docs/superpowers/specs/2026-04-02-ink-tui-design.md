# TUI Ink 重构设计文档

## 概述

使用 React Ink + Ink UI 组件库完全重构 AIOS TUI 安装程序，提升交互体验和代码可维护性。

## 目标

- **视觉体验**：颜色、样式、Flexbox 布局
- **交互流畅性**：内置 Select、TextInput、ConfirmInput 等组件
- **代码可维护性**：React 组件化替代手动字符串拼接

## 项目结构

```
scripts/lib/tui-ink/
├── App.tsx              # 主入口，MemoryRouter 配置
├── index.tsx            # render() 入口
├── hooks/
│   └── useSetupOptions.ts  # 共享配置状态 hook
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
│   ├── ScrollableSelect.tsx # 滚动选择列表
│   └── ResultDisplay.tsx   # 执行结果展示
└── types.ts               # 共享类型定义
```

删除旧的 `scripts/lib/tui/` 目录。

## 技术依赖

```bash
npm install ink @inkjs/ui react react-router
```

- `ink` (4.x) - React 终端渲染器
- `@inkjs/ui` - 内置交互组件
- `react` (18.x) + `react-router` (7.x)

Node 版本兼容：项目 `engines.node >=22 <23`，Ink 4.x 支持 Node 18+。

## 屏幕导航流程

```
┌─────────────┐
│  / (Main)   │
└─────────────┘
       │
       ├── Enter → /setup
       ├── Enter → /update
       ├── Enter → /uninstall
       ├── Enter → /doctor
       └── Enter (Exit) → 退出程序

┌─────────────┐
│  /setup     │
└─────────────┘
       │
       ├── "Select skills" → /skill-picker?owner=setup
       ├── "Run setup" → /confirm?action=setup
       └── Back → /

┌─────────────────────┐
│  /skill-picker      │
│  ?owner=setup       │
└─────────────────────┘
       │
       ├── Done → 返回上一屏
       └── Back → 返回上一屏

┌─────────────┐
│  /confirm   │
│  ?action=   │
└─────────────┘
       │
       ├── 确认 → 执行 → 显示结果 → Back → /
       └── Back → 返回配置屏
```

路由参数通过 `useSearchParams` 获取 `owner` 和 `action`。

## 组件设计

### MainScreen

- 使用 `@inkjs/ui Select` 组件
- 选项：Setup、Update、Uninstall、Doctor、Exit
- 选择后自动导航到对应路由
- Exit 选项直接退出程序

### SetupScreen / UpdateScreen / UninstallScreen

- 多个 `@inkjs/ui Select` 处理 Mode、Scope、Client 切换
- 自定义 Checkbox 组件处理 Components 勾选
- "Select skills" 按钮 → SkillPickerScreen
- "Run xxx" 按钮 → ConfirmScreen
- Back 按钮 → 返回 MainScreen

### SkillPickerScreen

- 自定义 `ScrollableSelect` 支持滚动窗口
- 分组显示：Core / Optional
- 显示技能描述（`dimColor`）
- 已安装标记（绿色 `(installed)`）
- 底部：Select all、Clear all、Done

### ConfirmScreen

- 显示配置摘要（Components、Mode、Client、Scope、Skills）
- `@inkjs/ui ConfirmInput` 确认/取消
- 执行时显示 Spinner
- 完成后显示成功/失败结果

### 自定义组件

**ScrollableSelect**：
- 支持滚动窗口模式（页面显示 N 个技能）
- 基于 Ink Box + Text + useInput
- 键盘 ↑/↓ 导航，Space 选择，Enter 确认

**Checkbox**：
- 简单勾选状态显示
- `[x]` / `[ ]` 标记
- 当前项高亮

## 状态管理

### useSetupOptions Hook

提供全局配置状态：

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
  skipPlaywrightInstall: boolean;
  skipDoctor: boolean;
}
```

保留现有状态结构，各屏幕通过 hook 访问和修改。

### 执行请求

ConfirmScreen 确认后：
1. 生成 `{ action, options }` 请求对象
2. 调用 `onRun(action, options)` 回调
3. 显示执行结果

## 视觉风格

- 当前项：`bold` + `color="cyan"`
- 已安装：`color="green"` + `(installed)` 标记
- 描述文字：`dimColor` 灰色
- 分组标题：`color="yellow"` 或 `inverse`
- 错误信息：`color="red"`
- 成功信息：`color="green"`

## 兼容性

- 非交互模式（无 TTY）保持 CLI 参数模式不变
- `aios.mjs` 入口检测 TTY 后调用 Ink 版本
- 现有 CLI 命令行参数功能不受影响

## 迁移步骤

1. 安装依赖
2. 创建 `tui-ink/` 目录结构
3. 实现 `App.tsx` + 路由配置
4. 实现 `MainScreen`
5. 实现 `SetupScreen` / `UpdateScreen` / `UninstallScreen`
6. 实现 `SkillPickerScreen` + `ScrollableSelect`
7. 实现 `ConfirmScreen`
8. 修改 `aios.mjs` 入口调用新版本
9. 删除旧 `tui/` 目录
10. 更新测试文件

## 风险

- Ink UI Select 不支持滚动窗口模式，需要自定义 ScrollableSelect
- React Router 在终端环境下的导航体验需要验证
- 需确保退出时正确清理 stdin raw mode

## 参考

- Ink 文档：https://github.com/vadimdemedes/ink
- Ink UI 文档：https://github.com/vadimdemedes/ink-ui
- 当前 TUI 实现：`scripts/lib/tui/`
