---
title: "v2.0.2: Safer Skill Health Records and Cleaner Crush Config"
description: "Harness CLI v2.0.2 は skill health telemetry、help routing、repository からの Crush config 除外を改善します。"
date: 2026-06-15
tags: ["release", "CLI", "skills", "Crush", "configuration"]
---

# v2.0.2: Safer Skill Health Records and Cleaner Crush Config

v2.0.2 は小さな修正リリースです。焦点は local agent state を正直に保ち、discoverable にし、machine-local config を repository から切り離すことです。

## Skill health は未知 status を拒否

`recordSkillObservation()` は `success` と `failure` だけを受け付けます。その他の値は保存前に例外になり、producer typo や legacy value が failure rate を汚さないようになりました。

## Help が先に処理される

`aios skill ... --help` と `aios session ... --help` は、必須 positional argument の検証より先に usage を表示します。

```bash
node scripts/aios.mjs skill --help
node scripts/aios.mjs skill comply --help
node scripts/aios.mjs session --help
node scripts/aios.mjs session changed-files --help
```

## Crush config は tracking 対象外

`.crush.json` と `crush.json` は git tracking から外れ、`.gitignore` に追加されました。AIOS は必要な場合に local Crush config を生成・読み取りできますが、その config は machine-local state として扱います。

## Verification

このリリースには invalid skill health status と help-first parser behavior の regression test が含まれます。docs/blog site も再生成されます。
