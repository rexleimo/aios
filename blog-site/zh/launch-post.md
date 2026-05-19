# 终于等到了！我做了 Harness CLI，让 AI 编程工具不再互相"打架"

说出来你可能不信，我曾经被三个 AI 编程工具折磨到崩溃。

Claude Code 写代码确实强，但浏览器自动化配置太麻烦。
Codex 自动化是爽，但复杂代码重构总是差口气。
Gemini 查资料挺好，但让它干活就各种翻车。

**我就想不通了：为什么不能有一个工具，让我想要啥就有啥？**

于是我自己做了一个。

---

## 01. 我遇到了什么问题？

### 场景一：浏览器自动化

我想自动发小红书笔记。

用 Claude Code？好，先配 MCP。配了 3 个小时，终于跑起来了。结果第二天起来一看——账号被风控了。

用 Codex？开箱即用，真香。但做到一半想让 Claude 优化一下代码，切换工具后——**上下文全丢了，得重来**。

### 场景二：长任务中断

跑一个代码重构任务，2000 多行。中间去开了个会，回来继续——

Claude：记得在哪，但细节忘了。
Codex：记得在哪，但重构思路偏了。
Gemini：我是谁，我在哪？

**这就是当时我的日常：不是在切换工具，就是在重新配置。**

---

## 02. Harness CLI 是什么？

**Harness CLI = 让 Claude Code + Codex + Gemini 协同工作，不再互相打架。**

### 核心能力

| 能力 | 什么意思 |
|------|----------|
| 统一浏览器自动化 | 不管用哪个 CLI，都用同一套 `browser_*` 命令操作浏览器 |
| 跨 CLI 上下文记忆 | 切换工具不断档，任务进度自动保存 |
| Privacy Guard | 配置文件自动脱敏，API Key 不泄露 |

### 怎么做到的？

```
你输入 codex/claude/gemini
       ↓
Harness CLI 自动拦截
       ↓
判断：是该包裹还是透传？
       ↓
包裹：接入 ContextDB + Browser MCP
透传：直接传给原生工具
```

**你不需要改任何操作习惯。** 以前怎么用，现在还是怎么用。

---

## 03. 实际效果

### 效果一：浏览器自动化

```bash
# 以前：用 Codex
codex

# 现在：还是用 Codex，但能力不一样了
codex
```

区别在于，现在你可以用统一的 `browser_*` 工具：
- `browser_navigate` - 打开网页
- `browser_click` - 点击元素
- `browser_snapshot` - 获取页面内容
- `browser_screenshot` - 截图

**不管换到哪个 CLI，这些命令都能用。**

### 效果二：断点续跑

任务跑到一半，换个工具继续？

```bash
# 用 Codex 跑了一半
codex

# 换成 Claude 继续，上下文自动同步
claude
```

**不需要复制粘贴，不需要重新描述任务。**

---

## 04. 怎么安装？

```bash
# 1. 克隆
git clone https://github.com/rexleimo/rex-cli.git

# 2. 安装
cd rex-cli
./scripts/setup-all.sh --components all

# 3. 启动
codex
```

官网：[rexai.top](https://rexai.top)

文档：[cli.rexai.top](https://cli.rexai.top)

---

## 05. 为什么开源？

我知道你可能会问：市面上工具这么多，为什么还要自己做一个？

**因为没有人比我更懂这种"工具割裂"的痛。**

我每天在三个工具之间切换，上下文丢失、配置重复、密钥风险...这些问题折磨了我太久。

与其忍，不如自己动手。

**Harness CLI 是我的个人作品，也是我每天都在用的工具。**

---

## 06. 写在最后

**Harness CLI 不是要替代 Claude Code 或 Codex。**

它只是一个"粘合剂"，让现有的工具更好地协同工作。

如果你也有类似的痛点，欢迎来试试。如果觉得有用，点个赞，让更多人被解救。

**官网：[rexai.top](https://rexai.top)**

有问题？评论区见。
