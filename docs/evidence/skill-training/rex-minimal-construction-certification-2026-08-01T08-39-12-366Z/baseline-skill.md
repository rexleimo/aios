---
name: rex-minimal-construction
description: Use only after rex-harness selects minimal construction evaluation and supplies the current Command.
---

# Rex Minimal Construction

仅在 rex-harness 已经激活最小构造 Capability，并提供当前 Command 后执行本流程。

按顺序评估复用阶梯，并记录每一级为什么适用或不适用：

1. 这个新结构是否真的需要存在，还是可以删除需求中的偶然复杂度？
2. 仓库已有代码或配置能否直接复用？
3. 语言、平台或标准库能否清晰解决？
4. 已安装依赖能否解决且不会扩大耦合？
5. 一个局部表达式能否保持可读和可测试？
6. 都不成立时，什么是保持正确性、安全性和可靠性的最小新构造？

返回 `reuse-ladder-evaluated` 和 `minimal-option-recorded`，每项都必须附带真实的代码、依赖或决定引用。宿主要求 `AIOS_REX_EVIDENCE` 时，只在结尾输出当前 `activationId` 的恰好一个证据信封。

简单不等于偷工减料；不能为了减少文件或代码量破坏清晰边界，也不要调用下一个 Provider。
