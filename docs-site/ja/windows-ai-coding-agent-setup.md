---
title: "Windows での AI コーディングエージェントセットアップ：10 分でインストールと検証"
description: "PowerShell で Windows に AI コーディングエージェントをセットアップ：AIOS のインストール、PATH 問題の修正、プロジェクトの初期化、クライアント同期の検証、よくある失敗の復旧——完全な低摩擦ガイド。"
date: 2026-08-10
schema_type: techarticle
---

# Windows での AI コーディングエージェントセットアップ：10 分でインストールと検証

> **まず答え：** Windows では、1 つの PowerShell コマンドで AIOS をインストールし、プロファイルを再読み込みし、プロジェクトで `aios init --all` を実行し、`aios doctor --native --verbose` で検証します。その後 `aios` が認識されない場合は PATH エントリが再読み込みされていません——シェルを再起動するか、インストールディレクトリを PATH に手動で追加してください。合計時間：動作し検証済みのセットアップまで 10 分未満。

## 必要なもの

- PowerShell 5.x または 7 が入った Windows 10/11
- Git
- Node.js 24 LTS
- 少なくとも 1 つのコーディングクライアント：Codex、Claude Code、Gemini CLI、OpenCode、Hermes、または Grok

## 1 コマンドでインストール

PowerShell を開いて実行：

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
```

次にプロファイルを再読み込みして `aios` コマンドを解決できるようにします：

```powershell
. $PROFILE
aios --version
```

## 初期化と検証

```powershell
cd C:\path\to\your\project
aios init --all
aios doctor --native --verbose
```

`aios init --all` はプロジェクトマーカーを作成し、サポート対象クライアントを検出します。`aios doctor` は ContextDB、クライアント同期、セーフティチェックを報告します——リストの最初の実行可能項目を修正してください。

## よくある失敗の復旧

| 症状 | 修正 |
| --- | --- |
| `aios` が認識されない | プロファイルを再読み込み（`. $PROFILE`）するか PowerShell を開き直す。それでもダメなら AIOS インストールディレクトリを PATH に手動で追加する。 |
| `aios init` が途中で失敗する | プロジェクトルートから `aios init --all` を再実行する。初期化処理は冪等。 |
| doctor がクライアントのドリフトを報告 | `aios doctor --native --verbose` を実行し、dry run を確認してから、提案された修正を適用する。 |
| インストール時に TLS エラー | インストールコマンドの前に `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12` を設定する。 |

## FAQ

**AIOS は Windows PowerShell 5.1 で動きますか？**
はい——インストーラーとラッパーは PowerShell 5.x と 7 をサポートしています。

**WSL は必要ですか？**
いいえ。AIOS は Windows にネイティブインストールされます。WSL は任意です。

**Windows Terminal を使えますか？**
はい——AIOS は Windows Terminal、PowerShell ISE、標準の PowerShell コンソールで動作します。

## 次のステップ

復旧手順の詳細は完全な [Windows ガイド](https://cli.rexai.top/ja/windows-guide/) を読むか、[クイックスタート](https://cli.rexai.top/ja/getting-started/) から始めてください。
