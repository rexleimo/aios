---
title: "v5.19.2：Windows 能容纳的文件名"
description: "候选 id 合法地就是 'session:<id>'。在 NTFS 上把它当文件名用，它就变成备用数据流：写入看起来成功了，readdir 却永远列不出它，晋升记录就这样丢失，而导入方仍然报告零错误。"
date: 2026-09-18
tags: ["AIOS", "evolution", "windows", "filesystem", "testing", "release", "v5.19.2"]
---

# v5.19.2：Windows 能容纳的文件名

实体 id 和文件名是两回事。大多数时候这个差别看不出来，于是两者被混用，直到某个平台悄悄表示不同意。

在本仓库里，候选 id 就是 `session:<sessionId>`。这个形状由测试套件断言，是数据模型的一部分，不会改。而有三处直接把它当成了文件名。

## 那个不成立的冒号

`session:eval-001.json` 在 POSIX 上是再普通不过的文件名。在 NTFS 上它根本不是文件名：冒号后面的一切都是一个名为 `session` 的文件的**备用数据流（ADS）**。

这带来一种比崩溃更糟的失败模式。在 Windows 上：

```
writeFile('...promotions/session:session-import-0.json')  -> 成功
readdir('...promotions/')                                 -> []
```

写入报告成功。目录列表里没有它。`readPromotion` 找不到，`listPromotions` 返回空数组，而"刚写了三条晋升记录"的导入方报告 `errors.length === 0`。

记录从未落盘，也没有任何东西说出来。

## 三个写入方，三种结果

同一个 id 以三种方式到达了文件系统：

**裁决（verdicts）** 用原始 id 命名文件，并通过原子重命名写入。临时文件被当成数据流创建，随后重命名到最终的数据流路径上失败：`EINVAL: invalid argument, rename '...\.session:session-eval-001.json...'`。至少它是响的 —— 但只在 Windows 上响。

**晋升（promotions）** 更糟。`promotionPath()` 会先净化 id 再拼路径，而它的白名单是 `[^A-Za-z0-9._:-]` —— 它**保留**了冒号。于是存储层写进了一个数据流，`readdir` 永远看不见，晋升记录就此消失。

**集成桥（integration）** 自己又写了一份写入代码：

```js
const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', `${promotionId}.json`);
await fs.writeFile(target, JSON.stringify(promotion, null, 2), 'utf8');
```

这条路径完全绕过了 `promotionPath()` —— 同一个产物有两个写入方，只靠运气保持一致。

## 修法

派生的名字被净化；id 是数据，保留它的冒号。

```js
// scripts/lib/fs/file-segment.mjs
const ILLEGAL_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
export function sanitizeFileSegment(segment) {
  return String(segment ?? '').replace(ILLEGAL_FILE_NAME_CHARS, '-');
}
```

这个字符类不是这里发明的：memo 存储层早就为自己路径里的同一组字符做了归一化。但那些助手还会小写化、折叠空白，对不透明 id 并不适用 —— 这个只去掉文件名容纳不下的字符。

随之有三处结果。`writeVerdict`/`readVerdict` 净化各自派生出的名字，于是两者依旧互相一致。`promotionPath()` 从白名单里去掉了冒号，并把结果再过一遍净化器作为兜底。`writePromotion` 现在被导出，集成桥调用它，而不是自己拼路径。

这个缺陷背后还有一件事：`atomicWriteText` 复写了临时文件名公式，却没有另一个原子写实现具备的清理逻辑，于是失败的重命名把数据流垃圾留在了磁盘上。现在它委托给 `writeFileAtomic`，实现从两份变成一份。

## 只在临时目录里存在的失败

往 `scripts/lib/fs/` 里加一个文件，弄红了三个 release-preflight 测试 —— 而在工作区里手跑那条命令是 `exit 0`。发布夹具把 `scripts/lib/fs/atomic-write.mjs` 当作**显式单文件**复制，所以当这个模块 import 了它的新同级文件，每一次夹具运行都在**临时根目录**里以 `agent export regeneration failed` 死掉。

第一反应是"与我无关"。那只是猜测，于是改成测量：把这些改动过的文件退回到上一个提交，跑同一个测试 —— 通过；还原它们 —— 失败。猜测错了。夹具现在整目录复制，与 `scripts/lib/clients` 的既有做法一致。

## 诚实的状态：修好了，但还没接线

`evolution-integration.test.mjs` 从五个失败变成了退出码 0。但它仍然无法从任何测试入口到达 —— 也就是说这个修复还没有被 CI 保护：它绿，只是因为没有东西跑它。

这是下一步，而且是独立的一步：`scripts/tests/` 下有 82 个测试文件从所有入口都不可达，而在它们通过之前就把它们接进套件，只会把门禁弄红。先修，再接，最后收缩基线。

## 验证

- `node --test scripts/tests/evolution-integration.test.mjs` —— 五个失败到退出码 0
- `scripts/tests/artifact-filename-windows-safety.test.mjs` —— 新增、已接线、五个用例，把不变量钉在 POSIX 上（那里这个失败无法复现）
- `npm run test:scripts` —— 1293 tests，1285 pass，0 fail
