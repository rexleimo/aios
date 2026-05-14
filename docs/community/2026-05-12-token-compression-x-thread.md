# X Community Changelog Draft: ContextDB Token Compression

Date: 2026-05-12
Status: draft for human review and publish
Primary link: https://cli.rexai.top/blog/2026-05-token-compression/
Image: `docs-site/assets/visual-token-compression-wireframe.svg`

## Goal

回答社区问题：“这个压缩有什么 nb 的地方？”

核心说法：它不是“少给上下文”，而是先把噪音压掉，把错误、文件、命令、下一步这些真正能接续工作的信号留下来。

## X Thread Draft

### 1/6

有人问：这个 token 压缩到底 nb 在哪？

一句话：不是让 agent 记得更少，而是让它少吃重复日志、长 stack trace、工具输出这种噪音。

真正要保的是：错误、文件、命令、checkpoint、next action。

配图是线框图：
raw history -> compress noise -> smaller context packet

### 2/6

以前做 context pack，最朴素的办法就是 tail window：

最近的先塞进去，预算满了就停。

问题是最近的不一定最有用。可能你保留了一大段重复 log，却丢掉了前面那个真正解释问题的文件路径或失败原因。

### 3/6

现在 ContextDB 的 `context:pack` 可以这样跑：

```bash
npm run contextdb -- context:pack \
  --session <id> \
  --limit 80 \
  --token-budget 1200 \
  --token-strategy balanced
```

默认推荐 `balanced`。

### 4/6

`balanced` 做几件事：

- 最新事件优先保
- error / file refs / command / next action 加权
- 重复日志折叠
- 大段输出截短
- stack trace 只留头尾和关键行

预算还不够，才开始丢低优先级事件。

### 5/6

打包结果里还会写 telemetry：

`tokenBudget`
`tokenUsed`
`rawTokenUsed`
`compressed`
`dropped`
`truncated`

所以你能看出来：这次省 token 是靠压缩省的，还是靠删事件省的。

这点对长任务和多 agent handoff 很重要。

### 6/6

我觉得它最实用的地方是：

agent 跑很久之后，下一次接手不需要重读一堆废话，但仍然知道：

- 刚刚失败在哪
- 哪些文件改过
- 下一步该做什么
- 有没有 checkpoint

文档和 blog 已补：
https://cli.rexai.top/blog/2026-05-token-compression/

## Single-Post Version

这个 token 压缩 nb 在哪？

不是让 agent “记得更少”，而是让它少吃噪音。

以前 bounded context pack 很像 tail window：最近的先塞进去，预算满了就停。问题是最近的不一定有用，可能是一大段重复 log。

现在 `context:pack --token-budget 1200 --token-strategy balanced` 会先保错误、文件、命令、checkpoint、next action，再压缩重复日志/长输出/stack trace，最后才丢低优先级事件。

结果里还能看到 `rawTokenUsed / tokenUsed / compressed / dropped / truncated`。

所以这东西适合长任务和多 agent handoff：上下文更短，但接手的人还能知道该从哪里继续。

图和 blog：
https://cli.rexai.top/blog/2026-05-token-compression/

## Reply For The Original Question

我会这么解释：这个压缩不是“把上下文变少”，而是“先把没用的噪音变少”。

真正 nb 的点是顺序：先保护错误、文件路径、命令、next action，再压缩重复日志和长 stack trace，最后预算还不够才丢事件。

所以长任务接手时，agent 不用重新读一堆废 log，但还知道刚才失败在哪、改了哪些文件、下一步该干嘛。

线框图我画好了：raw history -> compress noise -> smaller context packet。
