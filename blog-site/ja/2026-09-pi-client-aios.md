---
title: "Pi coding agent が AIOS ファーストクラスクライアントに"
description: "AIOS が Pi に対応：skills、native 指示、harness 駆動、コードレベルの extension と RPC 制御。"
date: 2026-09-11
tags: ["AIOS", "pi", "client", "extension", "harness", "skills"]
---

# Pi coding agent が AIOS ファーストクラスクライアントに

Pi は最小構成の自己拡張型ターミナル harness です。AIOS は Pi を
`skills` / `native` / `harness` 付きの一等公民として登録しました。

## 内容

- レジストリ登録（`pi` / `pi-coding-agent`）。Pi に sub-agent がないため
  `team` / `agents` は主張しません。
- MCP は正直にモデリング（`format: none`、空 scopes）。移行・巡検は
  安全にスキップします。
- native 指示レイヤー、`.pi/skills`、全 25 スキルを投影。
- ランタイム：`pi -p` ワンショット、harness 戦略、shell-bridge 対応。

## コードレベルの組み込み

`aios-pi-extension` パッケージが memory ツール 4 件、破壊的コマンドの
`tool_call` ゲート、workflow policy の hard inject、`aios init --agent pi`
による登録、`--mode rpc` ドライバを提供します。プロンプト依存から
コードによる制御へ。それが今回の質的変化です。
