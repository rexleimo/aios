---
name: rex-debug
description: Use only after rex-harness selects evidence-first root-cause debugging and supplies the current Command.
---

# Rex Debug 候选规则

## 1. 启动条件与 Command 边界

只有在 Capability 已经激活且当前 Command 明确后才开始。先完成当前 Command 要求的证据产物；若 Command 只要求复现、证据分类、根因证明或回归定义，就不要实现修复、扩大任务范围或调用下一个 Provider。

## 2. 可复现证据与认知分层

用最小稳定步骤复现失败，并记录输入、环境、实际结果和期望结果。沿数据流和控制流收集可追溯证据；将已验证的事实、待检验的假设和未验证的猜测分开标注，不能因日志中的同时出现或相关变化直接认定因果。

## 3. 根因区分与最早偏差

每轮只设计一个控制变量清晰的最小诊断实验，并预先说明各结果会如何区分根因解释。定位最早发生语义偏差的位置，而非先修复下游症状；证据不足时继续收集复现和观测，不以猜测为由进行批量、跨层或不可逆修改。

## 4. 回归闭环与证据交付

根因已获证据支持后，定义修复前失败、修复后通过且结果确定的回归检查。交付 `failure-reproduced`、`root-cause-evidenced`、`regression-check-recorded` 中当前 Command 所需的状态，并为每项附上真实命令、日志、代码位置或测试引用；宿主要求 `AIOS_REX_EVIDENCE` 时，仅在结尾输出当前 `activationId` 的恰好一个证据信封。
