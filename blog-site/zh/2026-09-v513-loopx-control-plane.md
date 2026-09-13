---
title: "v5.13.0：LoopX 控制面 + 孤儿进程终结"
description: "AIOS v5.13.0 把 provider turn 收敛为可结算契约，为无人值守加上节奏管理，超时杀整棵进程树，aios-shell 不再卡死。v5.13.0。"
date: 2026-09-13
tags: ["AIOS", "harness", "发布", "v5.13.0"]
---

# v5.13.0：LoopX 控制面 + 孤儿进程终结

v5.13.0 是 v5.11.0 之后的首个发布版本。除 v5.12.0 记忆面与 Pi 客户端外，它带来了长任务 harness 的控制面采纳，以及来自我们自己使用反馈的最后两处卡死修复。

## 结算的 turn，而不是祈祷的 turn

借鉴 LoopX 的 turn 契约，每一轮 provider 执行现在都结算为类型化 envelope：outcome、证据，以及 `effectRef` 幂等键（execution token 加 payload 哈希）。独立 validator 进程在写入前复核 envelope——执行者不能自验，重复副作用被拒绝，结算日志只追加。

## 无人值守的节奏管理

should-run 门在每轮前决定 run、wait、ask、quiet：cadence 梯在无进展时放宽唤醒间隔，24 小时占空比配额只对 material 轮扣费，连续无变化轮自动静默停机。attended 行为不变；`--unattended` 是严格 opt-in，操作者门前只有一次只读绕行，重入只靠显式 resume。只读 `aios harness dashboard` 把状态投影为静态 HTML。

## turn 死了还在改文件的孤儿

有些验证任务本来就超过 30 分钟默认超时。超时触发时 AIOS 只杀了直接子进程——底下的 provider CLI 变成孤儿继续跑，还在改同一份工作区，而 loop 已经进了下一轮：两个 agent、一个工作区，没人吱声。

v5.13.0 让每一轮 detached 启动，三段式清理整棵进程组（SIGTERM 组、宽限、SIGKILL 组、存活校验）。SIGKILL 后还活着的树直接停机，绝不并发。验证任务就是长？`--turn-timeout-ms` 把上限显式化。

## 永不返回的工具调用

同一类问题藏在 shell MCP 里：命令留下后台孙进程持有 stdout/stderr，`close` 事件永不触发，工具调用就一直挂着——"git diff 转个不停"就是这个形状。shell server 现在走同款三段式清理，哪怕 `close` 永不到也强制结算。超时就是超时。

## 升级

从 v5.13.0 release 资产里取 installer 脚本重跑即可；changelog 提供中英日韩四语。
