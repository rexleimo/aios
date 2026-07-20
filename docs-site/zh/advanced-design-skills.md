---
title: 高级设计技能
description: 通过 DESIGN.md + frontend-design，把模糊需求稳定落地为高质量、可生产的页面。
---

# 高级设计技能：页面制作实战

用户常见输入是模糊的，比如“改下这个区块”“参考某个风格做一下”。
如果没有约束，agent 很容易产出模板化 UI。这个流程就是为了解决这个问题。

## 快速答案

两个技能组合使用：

- `awesome-design-md`：先生成 `DESIGN.md` 风格约束
- `frontend-design`：按约束实现页面与交互

先锁风格，再写页面，能显著减少风格漂移。

## 标准流程

1. 在目标项目安装技能：

```bash
node <AIOS_ROOT>/scripts/aios.mjs setup --components skills --client codex --scope project --skills awesome-design-md,frontend-design
```

2. 生成风格基线：

```bash
npx --yes getdesign@latest list
npx --yes getdesign@latest add linear --force
```

3. 固定提示词：

```text
先按 DESIGN.md 定风格，再用 frontend-design 落地实现页面。
```

4. 补充业务目标后直接开始实现。

## 模糊提示词自动收敛

先把需求归类为以下三种模式：

| 模式 | 用户常见说法 | 交付要求 |
|---|---|---|
| `Patch` | “把这个元素改得更高级” | 局部改造 + 完整交互状态 |
| `Restyle` | “按 Stripe 风格重做这个页面” | 结构基本不变，统一替换视觉系统 |
| `Flow` | “做一套完整 SaaS 后台” | 交付连贯页面与任务链路 |

不要因为需求模糊就停住。先写简短假设，再推进实现。

## 默认风格建议

- SaaS / B2B：`linear`、`vercel`、`supabase`
- 营销页：`framer`、`stripe`、`notion`
- 文档站：`mintlify`、`hashicorp`、`mongodb`

没有明显行业线索时，默认 `linear`。

## SaaS 最低质量线

完整流程类需求至少包含：

- 仪表盘
- 列表页
- 详情页
- 创建/编辑表单
- 设置或计费页面
- 核心状态：`loading`、`empty`、`error`、`success`
- 交互状态：`hover`、`focus`、`active`、`disabled`

## 推荐系统提示词

```text
当用户需求模糊时，请先自动判断是 Patch/Restyle/Flow 三类中的哪一类；基于 DESIGN.md 锁定风格后再实现页面。输出必须包含完整交互状态（hover/focus/active/disabled）以及核心流程的 loading/empty/error/success。
```

## 相关阅读

- [Rex 工作流迁移](superpowers.md)
- [Skill Candidates 指南](skill-candidates.md)
- [高级设计技能实战（博客）](/blog/zh/advanced-design-skills-page-building/)
