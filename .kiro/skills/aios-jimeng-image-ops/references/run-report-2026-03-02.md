# Jimeng Live Run Report (2026-03-02)

## Environment
- URL: `https://jimeng.jianying.com/ai-tool/home` then generation page
- Tooling: browser automation via devtools MCP for live verification
- Session: logged-in account available during run

## Run A (Failed by policy)
- Prompt: "小红书封面，清新治愈风，淡粉和暖黄色渐变背景，简约留白，手写风标题区域，无文字，无人物，3:4竖图"
- Result: rejected with message `你输入的文字不符合平台规则，请修改后重试`
- Classification: content-policy rejection

## Run B (Success)
- Prompt: "春日花园插画风景，樱花树、草地、小路、蓝天白云，柔和阳光，高清，3:4竖版，无人物无文字"
- Result: task produced image tiles and preview dialog with `下载` button
- Evidence files:
  - `images/jimeng-run-2026-03-02.png`
  - `images/jimeng-run-modal-2026-03-02.png`

## Conclusions
- Core flow is valid.
- Biggest non-determinism is policy rejection and dynamic UI selectors.
- Stable automation must include policy-aware retry and snapshot-based completion checks.
