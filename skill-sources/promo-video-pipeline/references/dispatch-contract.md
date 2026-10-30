# Dispatch Contract — promo-video-pipeline

两份可直接粘的契约：派发前的节点 recipe header，和子代理必须返回的结构化结果。
字段名与 `skill-sources/aios-work-dispatch/SKILL.md` 的 1.5 节保持一致；`model`、`task-type`
必须是显式声明，程序不按文本猜。

## 节点 recipe header（每个场景一个工作项）

以 8 个场景里的 `hook` 为例；其余场景换 `scene_id` 与 `--target/--allow-write` 即可。

```json
{
  "work_item": "scene-hook",
  "objective": "实现 video/src/scenes/hook.tsx：冷开场 · 一句话指令（timeline.json 帧区间 0-149，竖版 1080x1920）",
  "owner": "subagent-scene-hook",
  "tools": ["read", "edit", "bash:cd video && npm run typecheck", "bash:cd video && npm run render -- --scene hook"],
  "model": "kimi-k2.6",
  "task_type": "frontend",
  "max_turns": 30,
  "budget": { "tokens": 120000, "on_overrun": "downgrade" },
  "retry": { "max": 1, "requires_changed_hypothesis": true },
  "subflow": null,
  "read_only_inputs": [
    "video/src/timeline.json",
    "video/src/timeline.ts",
    "video/src/theme.ts",
    "video/src/components/**",
    "video/README.md"
  ],
  "allowed_writes": ["video/src/scenes/hook.tsx"],
  "forbidden_writes": [
    "video/src/index.ts",
    "video/src/PromoVideo.tsx",
    "video/src/timeline.json",
    "video/src/components/**",
    "video/src/scenes/**（除自己的 hook.tsx）"
  ],
  "output_schema": "scene-result.v1"
}
```

`tools` 白名单之外的一律阻塞该节点。`read_only_inputs` 里的 `timeline.json` 帧区间由
`video/scripts/render.mjs` 的 `sceneRange()` 现算，字幕由 `PromoVideo.tsx` 从同一份 json 下发，
子代理不要把帧数或 cues 抄进场景代码。

`model` 必须落在 `scripts/lib/tooling/specs/registry/model-registry.json` 中该 `task_type` 的候选链里
（`routingRules[].primary` 或 `.fallback`）；`frontend` 的 primary 是 `claude-sonnet-5`，
`kimi-k2.6` 是其 fallback 之一（多子代理并行 + 前端 UI 是它注册表里的 strengths），所以示例选它是有条件的，
不是默认值。不声明 `task_type` 时路由会退回 `general`，不要指望程序从描述里猜。

## 子代理结果 schema（`scene-result.v1`）

```json
{
  "scene_id": "hook",
  "status": "done | blocked | partial",
  "files_touched": ["video/src/scenes/hook.tsx"],
  "typecheck_exit_code": 0,
  "still_path": "video/out/still-0014.png",
  "scene_render_exit_code": 0,
  "segment_output": "video/out/scene-hook.mp4",
  "evidence": {
    "storyboard_claims": [
      { "claim": "冷开场展示一句话指令触发 planned 路由", "code_ref": "video/src/scenes/hook.tsx:10" }
    ],
    "progress_json_phase": "still-done",
    "rendered_frames": 150,
    "total_frames": 150
  },
  "assumptions": [],
  "blockers": []
}
```

- `status` 是模型自报字段（self-report），门禁用 `*_exit_code` 这些客观事实判定，两者不一致时以退出码为准。
- `evidence.storyboard_claims[].code_ref` 必须是 `file:line`；无 `code_ref` 的画面断言不算完成。
- `assumptions` 只记录不改变已接受行为/验收的低影响默认值；影响可行性、范围或恢复的未决项写入 `blockers`，不能因澄清预算耗尽就降级为假设。

## 主线程合并与门禁

```bash
cd video && npm run typecheck                 # 退出码 0
cd video && npm test                          # 退出码 0（timeline 不变量，需 video/tests/）
cd video && npm run render -- --output out/aios-promo.mp4 --concurrency 8
node -e "const p=require('./video/out/render-progress.json');console.log(p.phase,p.renderedFrames,p.totalFrames)"
# 期望：done 1355 1355，且 video/out/aios-promo.mp4 存在、size > 0
```

进度 json 由 `render.mjs` 的 `writeProgress()` 写出：节流 >350ms，`final: true` 时立刻写；
整片成功最后一条 `phase` 为 `done`，`--still` 为 `still-done`。
