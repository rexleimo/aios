---
title: クイックスタート：AIOS をインストールして確認する
description: 現在のコマンドで AIOS をインストールし、プロジェクト guidance、ContextDB、client sync、安全チェックを確認します。
---

# クイックスタート

## まず答え

AIOS は対応する coding client 向けのローカル workflow layer です。現在の導入は、release を install し、project root で aios init --all を実行し、その後 aios doctor --native --verbose で結果を確認します。既存の client を置き換えず、全履歴を毎回の prompt に入れるものでもありません。

## 必要なもの

- Node.js 24 LTS と npm
- Git
- 対応 client のいずれか：codex、claude、gemini、opencode、hermes、grok（Grok Build）
- client guidance とローカル記憶を置く project directory

~~~bash
node -v
npm -v
~~~

## Stable release を install

=== "macOS / Linux"

    ~~~bash
    curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
    source ~/.zshrc
    ~~~

    bash の場合は PATH を管理する profile、たとえば source ~/.bashrc を reload します。

=== "Windows PowerShell"

    ~~~powershell
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://github.com/rexleimo/aios/releases/latest/download/aios-install.ps1 | iex
    . $PROFILE
    ~~~

release installer を推奨します。未リリースの main source が必要な場合だけ repository を clone してください。

## Project を初期化

project root で実行します。

~~~bash
aios init --all
aios doctor --native --verbose
~~~

aios init は繰り返し実行できます。project integration marker と、存在する対応 client guidance を更新します。marker は pull-based ContextDB のローカル registry である .aios/context-db/index.json を指します。

Unattended setup では権限を分けて明示します。

~~~bash
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

- --yes-compression-tools は RTK、Caveman、Headroom package の unattended install を許可します。
- --yes-headroom-mcp は対応 client の user-scope Headroom MCP registration を許可します。
- --dry-run は download や client configuration の書き込みをせず予定状態だけ表示します。

## 最初の client を起動

同じ project directory から起動します。

~~~bash
codex
# または claude
# または gemini
# または opencode
# または hermes
# または grok
~~~

client は registry から必要な guidance と記憶を参照できます。ContextDB は pull-based なので、必要なときに unified search、memo、checkpoint、context pack を使います。

## Install を確認

client を起動した後、もう一度診断します。

~~~bash
aios doctor --native --verbose
ls .aios/context-db/
~~~

診断出力に表示される実際の checks と paths を根拠にしてください。warning は provider または live client route が使える証拠ではありません。live route を確かめる場合は小さな task を実行し、status または verification output を保存します。

profile を変更した場合は reload します。

=== "macOS / Linux"

    ~~~bash
    source ~/.zshrc
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    . $PROFILE
    ~~~

## Legacy compatibility switch

一部の古い compatibility script は .contextdb-enable を opt-in marker として認識します。現在の install の primary path ではありません。

=== "macOS / Linux"

    ~~~bash
    touch .contextdb-enable
    ~~~

=== "Windows PowerShell"

    ~~~powershell
    New-Item -ItemType File -Path .contextdb-enable -Force
    ~~~

古い wrapper または compatibility workflow が明示的に要求する場合だけ使用してください。現在の project では aios init と .aios/context-db/index.json を使います。legacy file を作成しても既存の記憶は移行されず、client sync も証明しません。

## Memo を保存して検索

~~~bash
aios memo add "Keep authentication tests strict"
aios memo search "authentication"
aios memo storage status
~~~

Memo はローカル project data です。デフォルトでは .aios/memo/file/events.jsonl の append-only JSONL を使います。storage、scope、rebuild、context pack は [ContextDB](contextdb.md) で説明します。

## Recovery commands

~~~bash
aios doctor --native --verbose
aios doctor --native --fix
node scripts/aios.mjs init --all --dry-run
~~~

configuration や package install の変更が不明な場合は dry run から始めます。質問するときは diagnostic output を残してください。

## FAQ

### AIOS は coding client を置き換えますか？

いいえ。元の client をそのまま起動し、AIOS が記憶、workflow route、optional tool、verification guidance を追加します。

### aios init は project memory を upload しますか？

registry と memo はローカルファイルです。client provider、package、MCP の network boundary はそれぞれ異なります。ローカル install は後続の model traffic がすべてローカルという意味ではありません。

### すべての client は同じ記憶を共有しますか？

integration が対応し sync 済みであれば、同じ project の client は同じ ContextDB registry を利用できます。実際の状態は aios doctor --native --verbose で確認してください。

### 記憶を無効にするには？

client を停止し、client guidance に従って project integration marker を調整します。削除前に .aios/ を確認してください。legacy workflow が .contextdb-enable を使っていた場合はその file を削除できますが、marker の削除だけでは既存データは消えません。

## 次に読むページ

| 目的 | ページ |
| --- | --- |
| project memory と unified search | [ContextDB](contextdb.md) |
| direct、guarded、planned の選択 | [Workflow Policy](workflow-policy.md) |
| 独立作業を並列化 | [Agent Team](team-ops.md) |
| 再開可能な長時間作業 | [Solo Harness](solo-harness.md) |
| install failure の診断 | [トラブルシューティング](troubleshooting.md) |
| intent 別 command | [ユースケース](use-cases.md) |
