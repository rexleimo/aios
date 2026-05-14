# 输出与验收 Schema

## Storyboard Shot Schema
- shot_id: `S1..S5`
- duration_sec: number
- objective: 本镜头叙事目的
- visual: 画面主体与动作
- camera: 景别/角度/运镜
- mood: 情绪词
- continuity_anchor: 与上一镜头保持一致的角色锚点
- prompt: 生成提示词
- negative_prompt: 负面约束

## QA Checklist
- identity_consistency: PASS/FAIL + 说明
- scene_transition: PASS/FAIL + 说明
- emotion_delivery: PASS/FAIL + 说明
- visual_readability: PASS/FAIL + 说明
- policy_compliance: PASS/FAIL + 说明

## Revision Patch
当 QA 出现 FAIL 时，按最小改动给出：
- target_shot: 受影响镜头
- field_to_change: 仅列出需要修改的字段
- patch_reason: 修改原因
- patched_prompt: 修改后提示词
