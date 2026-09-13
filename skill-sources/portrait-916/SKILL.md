---
name: portrait-916
description: '人像生图默认 9:16 竖幅规则。TRIGGER: 人像生图、portrait generation、人像、portrait、人脸、9:16、竖幅人像、韩系人像、网红人像'

installCatalogName: portrait-916
clients: [codex, claude, gemini, opencode, hermes, workbuddy, pi]
scopes: [global, project]
defaultInstall:
  global: false
  project: false
tags: [portrait, image, generation, 9x16]
repoTargets: [codex, claude, gemini, opencode, hermes, workbuddy, pi]
---

# Portrait 9:16 — 人像生图画幅升格规则

生成人像（portrait）图片时，**默认一律用 9:16 竖幅**。这是实测结论，不是偏好。

## 核心规则

1. **人像 → 9:16**：`gpt-image-2` 用 `--size 1024x1792`。不要用 3:4 直接出人像。
2. **为什么**：3:4 画幅下模型把人脸摊进更宽的画面，五官更扁、皮肤纹理更弱、"抓拍感"更差；9:16 对应手机竖屏自拍的真实取景，人脸占比和景深逻辑都更对。2026-09-12 kr-realism 任务实测：同风格下 3:4 出图（gen/probe 时期）人脸明显弱于 9:16 v4（见 rex-videos `.workspace/2026-09-12-kr-realism/` 对比记录）。
3. **下游要 3:4 时**：先 9:16 生成，再用 Python（Pillow）裁成 3:4，禁止直接 3:4 生成后凑合。
4. **提示词里同步声明画幅**：prompt 首句写 `9:16 vertical ...`，与 `--size 1024x1792` 保持一致。

## 尺寸对照（gpt-image-2 支持值）

| 画幅 | size | 用途 |
|------|------|------|
| 9:16 | `1024x1792` | **人像默认** |
| 1:1 | `1024x1024` | 头像/方形位、快速试 prompt |
| 16:9 | `1792x1024` | 横版场景/背景图 |

## 执行要点

- 执行器用 `rexai-image-generation` 技能的 **Python 版** `rexai-image.py`（进度可见、超时 600s、熔断/内容策略自动重试）。
- 9:16 大尺寸出图常需 60-180s，属正常，勿中途 kill（job 在服务端继续跑，kill 会丢 job id 上下文）。
- 内容安全过滤是概率性的：同一 prompt 可能过可能拦；被拦时脚本自动重试，仍失败就替换高危措辞（实测 "one hand ... in foreground" 易拦，"leaning forward with hands on the bed edge" 稳定过）。

## 验证记录

- 2026-09-12：kr-realism 任务，ref-01 参考图拆解 → v4 prompt（9:16, 1024x1792）一次通过，8 项场景锚点全中，人脸立体度显著优于 3:4 对照图。
