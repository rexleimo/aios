---
title: Windows ガイド：PowerShell のセットアップと復旧
description: Windows の PowerShell で Harness CLI を install し、project を初期化し、client sync と PATH の問題を確認します。
---

# Windows ガイド

## まず答え

PowerShell 5.x または 7 で TLS 1.2 を明示して release installer を実行し、profile を reload します。その後 project root で aios init --all と aios doctor --native --verbose を実行してください。診断 output が PATH、Node.js、client sync、native integration の根拠です。

## 前提条件

~~~powershell
$PSVersionTable.PSVersion
node -v
npm -v
git --version
~~~

Node.js 24 LTS を使います。execution policy による制限がある場合は組織の policy に従い、credential や profile 全体をサポートへ送らないでください。

## Install と PowerShell profile

~~~powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/harness-cli/releases/latest/download/aios-install.ps1 | iex
. $PROFILE
~~~

profile がまだない場合：

~~~powershell
New-Item -ItemType File -Path $PROFILE -Force
. $PROFILE
~~~

reload しても PATH が変わらない場合は、新しい PowerShell window を開きます。

## Project を初期化して確認

project root で実行します。

~~~powershell
aios init --all
aios doctor --native --verbose
~~~

marker は .aios/context-db/index.json を指します。diagnostic result を確認してから client を起動します。

~~~powershell
codex
# または claude
# または gemini
# または opencode
# または hermes
# または grok
~~~

Unattended setup：

~~~powershell
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

--dry-run は package や client configuration を書かずに変更を preview します。

## Recovery commands

### aios が見つからない

~~~powershell
Get-Command aios -ErrorAction SilentlyContinue
$env:Path -split ';'
. $PROFILE
~~~

まだ見つからない場合は、新しい PowerShell process で installer を再実行します。

### Node.js version が違う

~~~powershell
node -v
where.exe node
npm -v
~~~

Node.js 24 LTS を install または選択し、profile を reload して aios doctor を再実行します。

### Native client sync が不完全

~~~powershell
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

fix の前に dry-run plan を確認します。dry run の成功は live provider の証明ではありません。

### Project memory が見えない

~~~powershell
Test-Path .aios\context-db\index.json
Get-ChildItem .aios -Force
aios doctor --native --verbose
~~~

意図した project root で aios init を実行したことを確認します。.contextdb-enable は古い compatibility script 専用です。現在は .aios/context-db/index.json marker を使います。

## FAQ

### Windows installer は coding client を置き換えますか？

いいえ。Harness CLI layer と対応 integration を install します。codex、claude、gemini、opencode、hermes、grok はそのまま使います。

### TLS 1.2 を指定する理由は？

一部の PowerShell 環境は古い protocol を default にします。installer request の HTTPS protocol を明示するためで、後続の client や provider の network behavior は変更しません。

### 問題報告に何を含めるべきですか？

command、exit code、Node / PowerShell version、関連する aios doctor output を含めます。token、cookie、private path、client credential は redaction してください。

## 次に読むページ

- [クイックスタート](getting-started.md)
- [トラブルシューティング](troubleshooting.md)
- [Workflow Policy](workflow-policy.md)
