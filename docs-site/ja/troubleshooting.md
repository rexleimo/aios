---
title: AIOS トラブルシューティング
description: install、ContextDB、client sync、workflow、Team、browser、token tool、privacy の問題を evidence で診断します。
---

# トラブルシューティング

## まず答え

最初に診断 output を保存します。

~~~bash
aios doctor --native --verbose
~~~

症状を分類し、dry-run から live provider failure を推測しないでください。最初の failure command を確認する前に project data を削除しないでください。

## Install と Node.js

**症状：** aios が見つからない、または Node 切り替え後に ContextDB が失敗。

~~~bash
node -v
npm -v
command -v aios
aios doctor --native --verbose
~~~

Node.js 24 LTS と aios path を確認します。profile を reload または新しい shell を開きます。Windows は TLS 1.2 installer と . $PROFILE を使います。

## ContextDB と registry

**症状：** client が project memory を見つけない。

~~~bash
test -f .aios/context-db/index.json
find .aios/context-db -maxdepth 2 -type f | head -n 30
aios doctor --native --verbose
~~~

正しい project root で aios init --all を実行したか確認します。unified search または明示した memo/checkpoint で recall を確認します。.contextdb-enable は legacy compatibility switch です。

**症状：** search が空。

~~~bash
node scripts/aios.mjs search "release readiness" --agent codex-cli --json
aios memo storage status
aios memo storage rebuild
~~~

source list または storage status を確認してから derived index を rebuild します。

## Client sync と route

**症状：** native guidance または shortcut がない。

~~~bash
aios doctor --native --verbose
node scripts/aios.mjs init --all --dry-run
aios doctor --native --fix
~~~

dry-run を読んでから fix します。file sync は provider route が live である証明ではありません。

## Workflow Policy と plan

**症状：** read-only question に plan が作られる、または小さい change が block される。

~~~bash
node scripts/aios.mjs plan auto-gate --task "Explain the current auth flow" --dry-run --json
node scripts/aios.mjs plan auto-gate --task "Refactor auth across modules" --json
~~~

noop、direct、guarded、planned と persistence none、reuse、create を確認します。policy は pre-edit safety と final verification とは別です。[Workflow Policy](workflow-policy.md) を参照します。

## Team と Solo Harness

**症状：** run が stop、blocked、または progress がない。

~~~bash
aios team history --provider codex --limit 5
aios harness status --session <session-id> --json
aios hud --session <session-id> --json
~~~

最初の failure を読みます。

~~~bash
aios team --resume <session-id> --retry-blocked --provider codex --workers 2
aios harness stop --session <session-id> --reason "diagnose first failure"
aios harness resume --session <session-id>
~~~

dry-run は provider credential や live route を test しません。

## Browser MCP

~~~bash
aios internal browser doctor
aios internal browser cdp-status
~~~

browser-use MCP over CDP を使い、visible browser、semantic snapshot、targeted text、act、verify の順に進みます。auth wall は human-controlled にします。Playwright MCP は compatibility path です。

**Symptom:** アップグレード後、またはプロジェクト／インストールディレクトリを移動した後に、MCP server が "connection closed" になる。

~~~bash
aios internal browser mcp-migrate
aios update
~~~

クライアント設定（例：`~/.config/opencode/opencode.json`）の MCP エントリは、このリポジトリの `scripts/` ランチャーへの**絶対パス**を保存しています。プロジェクトやインストールディレクトリを物理的に移動すると、そのパスは存在しなくなり、server が起動できません。`aios update` はデフォルトでこれを書き直します（browser コンポーネントはデフォルト更新セットに含まれます）。`aios internal browser mcp-migrate` は直接書き直します。どちらかを新しいプロジェクトルートで実行し、クライアントを再起動してください。`aios doctor` はランチャーパスの確認のみで、書き換えは行いません。

## Token tools

~~~bash
node scripts/aios.mjs init --all --dry-run
aios doctor --native --verbose
node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
~~~

package consent と user-scope MCP consent は別です。Headroom の external / conflict registration を確認し、headroom_stats が positive saved-token total を示さない限り savings を主張しません。

## Privacy

~~~bash
aios privacy status
aios privacy read --file .env
~~~

raw .env、cookie、token、private key、browser profile を共有しないでください。ログから provider token と private path を除きます。

## FAQ

### .aios を削除すべきですか？

いいえ。最初の failure を特定し、sessions、exports、memo JSONL を backup してから derived data を扱います。

### dry-run が成功すれば動作していますか？

いいえ。local parsing と planned state の証拠です。provider と credential は live task で確認します。

## 次に読む

- [クイックスタート](getting-started.md)
- [ContextDB](contextdb.md)
- [Workflow Policy](workflow-policy.md)
- [Token Intelligence](token-compression.md)
- [ケースライブラリ](case-library.md)
