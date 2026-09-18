---
title: Skill Candidates 指南
description: "技能候选指南：AIOS 如何把失败会话自动转成可审查的改进补丁，候选如何被发现、如何评审、以及怎样安全应用与回滚。理解这套流程之后，你能把 Agent 的失败变成可积累的能力改进，候选只有通过评审与验证才会进入正式技能库。，不会自动改动线上技能。"
---

# Skill Candidates 指南

**Skill Candidates** 是从失败的 agent 会话中提取的自动化改进建议。它们通过从错误中学习帮助你持续改进 AI 助手的技能。

## 什么是 Skill Candidates？

当 agent 会话未通过 quality-gate 检查时，AIOS 自动：
1. 分析失败模式
2. 识别根本原因（例如，缺少错误处理、边界情况）
3. 生成 skill patch draft
4. 将其作为 **skill candidate** 呈现供你审查

### 示例流程

```
会话失败 → Learn-eval 分析 → 生成 skill candidate → 你审查 → 应用补丁 → 技能改进
```

## Skill Candidate 结构

每个 skill candidate 包含：

| 字段 | 描述 |
|-------|-------------|
| `skillId` | 要补丁的目标技能 |
| `scope` | 功能区域（例如 "authentication"、"file-ops"） |
| `failureClass` | 遇到的失败类型 |
| `lessonKind` | 改进类型（例如 "error-handling"、"edge-case"） |
| `lessonCount` | 学习的课程数量 |
| `patchHint` | 建议的代码/文本更改 |
| `sourceDraftTargetId` | 来源 draft ID |
| `reviewStatus` | Pending/Approved/Rejected |

## 查看 Skill Candidates

### 从 HUD

```bash
# 在会话状态中内联显示 candidates
aios hud --show-skill-candidates

# 详情视图（仅 candidates，无 HUD）
aios hud --show-skill-candidates --skill-candidate-view detail

# 限制结果
aios hud --show-skill-candidates --skill-candidate-limit 5
```

### 从 Team Status

```bash
# 显示所有最近 candidates
aios team status --show-skill-candidates

# 按会话过滤
aios team status --session <session-id> --show-skill-candidates

# 导出到 artifact 文件
aios team status --export-skill-candidate-patch-template
```

### List 命令

```bash
# 列出当前会话的 candidates
aios team skill-candidates list

# 列出特定会话的 candidates
aios team skill-candidates list --session-id <session-id>

# JSON 输出
aios team skill-candidates list --json
```

### 按 Draft ID 过滤

```bash
# 仅显示特定 draft 的 candidates
aios team skill-candidates list --draft-id <draft-id>

# 导出过滤的 candidates
aios team skill-candidates export --draft-id <draft-id>
```

## 导出补丁

### 导出到 Artifact 文件

```bash
# 默认位置（会话 artifacts 文件夹）
aios team skill-candidates export

# 自定义输出路径
aios team skill-candidates export --output-path ./patches/my-fix.md

# 带 draft 过滤
aios team skill-candidates export --draft-id <draft-id> --output-path ./draft-patch.md
```

### 导出格式

导出的补丁模板包括：
- Candidate 元数据（skill ID、scope、failure class）
- 课程描述
- 建议的补丁内容
- 应用说明

## 应用 Skill 补丁

### 审查流程

**应用任何补丁之前：**
1. 阅读 failure class - 理解出了问题
2. 审查 lesson - 学到了什么
3. 检查 patch hint - 建议的更改
4. 验证补丁适用于你的技能版本

### Apply 命令

```bash
# 应用特定 candidate
aios skill-candidate apply <candidate-id>

# 带审查模式应用
aios skill-candidate apply <candidate-id> --review

# 预运行（预览更改）
aios skill-candidate apply <candidate-id> --dry-run
```

### 批量应用

```bash
# 应用技能的所有待处理 candidates
aios skill-candidate apply-all --skill <skill-id>

# 带批准应用
aios skill-candidate apply-all --skill <skill-id> --approve
```

## Skill Candidate 工作流

### 步骤 1：发现 Candidates

```bash
# 失败会话后，检查 candidates
aios hud --session <failed-session-id> --show-skill-candidates
```

### 步骤 2：审查 Candidates

```bash
# 仔细审查的详情视图
aios hud --session <session-id> --show-skill-candidates --skill-candidate-view detail

# 导出离线审查
aios team skill-candidates export --session-id <session-id>
```

### 步骤 3：本地测试补丁

```bash
# 创建测试分支（如果使用 git）
git checkout -b skill-patch-<skill-id>

# 手动应用补丁或使用 apply 命令
aios skill-candidate apply <candidate-id>

# 运行测试验证
npm test
```

### 步骤 4：批准或拒绝

```bash
# 如果补丁有效 - 批准
aios skill-candidate review <candidate-id> --approve

# 如果补丁有问题 - 拒绝并反馈
aios skill-candidate review <candidate-id> --reject --comment "不处理边界情况 X"
```

## 最佳实践

### 优先级

**按此顺序应用补丁：**
1. 高频失败（相同 failure class 多次出现）
2. 关键路径技能（认证、安全、数据完整性）
3. 简单修复（单行修复、清晰改进）

### 审查指南

- **从不自制应用** - 每个补丁都需要人工验证
- **孤立测试** - 验证补丁不会破坏现有功能
- **检查冲突** - 多个补丁可能修改相同代码
- **记录决策** - 记录批准/拒绝原因

### 避免过拟合

- 不要为一次性边界情况应用补丁
- 在多个会话中寻找模式
- 优先通用解决方案而非特定变通方法

## 与 Learn-Eval 集成

Learn-eval 是生成 skill candidates 的系统：

```bash
# 运行 learn-eval 分析最近会话
aios learn-eval --limit 10

# 显示包括 skill candidates 的 draft 推荐
```

### Learn-Eval 输出

```
Dispatch Hindsight 分析:
- 分析的对数：15
- 重复阻塞轮数：3
- 回归：1
- 主要 failure class: token-validation-edge-case

Draft 推荐:
[fix] skill-candidate-001
    Skill: authentication-handler
    Scope: token-validation
    Failure: edge-case-expired-token
    Lessons: 2
    Patch: 为过期令牌添加重试逻辑...
```

## Quality-Gate 连接

当 quality-gate 失败时生成 skill candidates：

### Quality-Gate 结果

| 结果 | 描述 |
|---------|-------------|
| `ok` | 会话通过 - 不生成 candidate |
| `failed` | 会话失败 - 可能生成 candidate |
| `retry-needed` | 需要重试 - 可能生成 candidate |

### 失败分类

触发 candidates 的常见 quality-gate 失败分类：
- `clarity-needs-input` - Agent 需要更多用户输入
- `sample.latency-watch` - 性能问题
- `dispatch.blocked` - 作业执行阻塞
- `evidence.missing` - 缺少验证证据

## 故障排查

### 失败会话后无 Candidates

可能原因：
- Learn-eval 尚未运行
- 失败未分类为技能改进机会
- 会话未达到 quality-gate 检查阈值

```bash
# 手动触发 learn-eval
aios learn-eval --session <session-id>

# 检查 quality-gate 状态
aios hud --json | jq '.selection.qualityGate'
```

### Candidate 补丁不适用

原因：
- 目标技能自 candidate 生成后已更改
- 补丁格式与当前技能结构不兼容
- 冲突修改

```bash
# 检查 candidate 来源版本
aios team skill-candidates list --json | jq '.[0].sourceArtifactPath'

# 与当前技能比较
diff <(cat <source-artifact>) <(cat <current-skill-file>)
```

### 多个冲突 Candidates

当多个 candidates 修改相同技能时：
1. 首先审查所有 candidates
2. 按优先级应用（频率、严重程度）
3. 每次应用后测试
4. 拒绝冲突重复项

```bash
# 列出技能的所有 candidates
aios team skill-candidates list --json | \
  jq '[.[] | select(.skillId == "target-skill-id")]'
```

## 高级用法

### 编程访问

```bash
# 获取 JSON candidates
aios team skill-candidates list --json > candidates.json

# 按 failure class 过滤
cat candidates.json | \
  jq '[.[] | select(.failureClass == "token-validation-edge-case")]'

# 按技能计数
cat candidates.json | \
  jq 'group_by(.skillId) | map({skill: .[0].skillId, count: length})'
```

### 自定义分析

```bash
# 分析随时间推移的失败模式
aios team history --quality-failed-only --json | \
  jq '[.[] | .skillCandidate] | group_by(.skillId)'

# 查找最常见 failure classes
aios team history --json | \
  jq '[.[] | .skillCandidate.failureClass] | unique'
```

## 相关文档

- [Team Ops](team-ops.md) - Team Operations 概述
- [HUD 指南](hud-guide.md) - 使用 HUD 监控会话
- [ContextDB](contextdb.md) - 会话存储和 artifacts
